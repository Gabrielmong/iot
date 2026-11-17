# CI pipeline on the Deploys page — Design

*Date: 2026-11-16 · Status: awaiting approval · Builds on: [Auto-deploy](2026-11-10-auto-deploy-design.md) (`apps/deployer/`), the Deploys page (`apps/web/src/admin/DeploysPage.tsx`, `apps/web/src/admin/deploys/`)*

## Intent

The Deploys page shows what the deployer did: deploys, skips, rollbacks, restarts, pauses. It doesn't show what happened before that. The user wants to follow a commit through its whole life on that page:

1. it lands on `main`;
2. GitHub Actions runs, job by job and step by step;
3. the deployer deploys it (or skips it);
4. it's running.

The page should show this live while it happens and keep it as history afterwards.

## Goals

- **One card per commit**, replacing the flat event list. Each card shows the commit, its workflow runs with jobs and steps, its deploy attempts, and whether it's running now.
- **Live CI progress.** Step status updates within about 5s while a run is in progress. A new push shows up within about 20s.
- **CI logs in the log panel.** Clicking a finished CI job shows its log in the same panel that shows deploy logs.
- **All push workflows on `main`.** That's `CI` and `Android` today. Only the deploy-gating workflow (`ciWorkflowName`, `CI`) is presented as blocking the deploy. The others are labelled as not blocking it.
- **Faster deploys as a side effect.** When the CI watcher sees a `CI` run finish, it nudges the deploy loop to check right away. Today a green commit can wait up to 2 minutes (`pollMs`) before the deploy starts.
- **Commits the deployer passed over become visible.** A green commit that never deployed because a newer one went first is shown as "Superseded". Today these don't appear anywhere.

## Non-goals

- **GitHub webhooks.** The server is LAN-only and GitHub can't reach it. Polling with conditional requests is close to free. Webhooks could be added later if the server is ever exposed.
- **Pull-request runs.** Only pushes to the deploy branch are tracked.
- **Re-running, cancelling or triggering workflows** from the app.
- **Live streaming of a running job's log.** GitHub's REST API serves a job's log only once the job has finished. While it runs, the panel says so and links to the run on GitHub.
- **A card for every commit in a multi-commit push.** CI runs only on the pushed head, so the card belongs to that commit. Earlier commits in the same push get no card of their own.
- **Changes to the Android app.** It shows the web app, so it gets the new page for free.

## Anti-goals

These would make it a failure even if it works:

- **The CI watcher affecting deploy decisions.** The deploy loop keeps deciding exactly as it does today (`findPick` / `pickCommit` with its own `checkState` calls). The watcher only reports, plus the nudge, which calls the existing `tick()` with its existing guards (busy, paused, already ticking).
- **A watcher failure hurting deploys.** A GitHub error, a corrupt file or a crash in the watcher must never stop the deploy loop or the API. It's reported on the page and retried later.
- **Burning the rate limit.** The watcher shares the GitHub token, and so the 5,000 requests/hour limit, with the deploy loop and the APK sync. Running out would make deploys fail.

## Constraints

- **Same token, no new permissions.** The token already has Actions: Read, which covers runs, jobs, steps and job logs.
- **A deploy doesn't update the deployer itself.** After this ships, the helper must be reinstalled with `install-deployer.ps1`, as `docs/RUNNING.md` §8 describes. The page already shows "helper update available". Until the reinstall, the server will be talking to an old helper. It must treat missing CI data as "none" and render the page as today, grouped by commit.
- **Small files and components**, split by concern, as in the rest of the codebase.

## Approaches

1. **The deployer runs a separate CI watcher (chosen).** The deployer already holds the token and a GitHub client. A second loop next to the deploy loop polls Actions, stores results in a file keyed by commit, and serves them through its local API. The server passes them through GraphQL.
2. **The app server polls GitHub itself.** Rejected: the token would have to be copied to the server, and a second GitHub client would have to be kept in step with the deployer's.
3. **Push-based (webhooks, or the workflow calling home).** Rejected: GitHub can't reach the LAN-only server without a tunnel or a port forward, which means more moving parts and an internet-facing endpoint on the house controller.

Two decisions came out of the conversation: the commit-centric card layout (A), chosen over a live strip above the unchanged history (B), and smart polling chosen over webhooks.

## Design

### Deployer: CI watcher (`apps/deployer/src/ci/`)

**The loop.** It's independent of `Deployer.schedule`/`tick`. It starts with the deployer, stops with it, and never awaits a deploy operation.

- **Idle** (no unfinished run known): one request every `ciIdlePollMs` (default 20,000):
  `GET /actions/runs?branch=<branch>&event=push&per_page=20`, sent with `If-None-Match` and the last ETag.
  - A `304` means nothing changed. It doesn't count against the rate limit.
  - This one call covers every workflow and every recent commit. Each run carries `head_sha`, `head_commit` (message and timestamp), `name`, `status`, `conclusion`, timestamps and `html_url`.
- **Active** (any known run not `completed`): the same list request every `ciActivePollMs` (default 5,000), plus `GET /actions/runs/{id}/jobs` for each unfinished run, also with ETags.
  - Jobs carry their steps (name, number, status, conclusion, started/completed times) and `html_url`.
  - When a run turns `completed`, its jobs are fetched once more so the final state is stored. After that its jobs aren't fetched again unless the run changes again (see re-runs).
  - A run first seen already completed (first start, or after downtime) has its jobs fetched once.
- **Re-runs** (designer's call). "Re-run" in GitHub keeps the run id, increases `run_attempt`, and makes the run unfinished again.
  - Runs are keyed by run id and store their `attempt`. When the list shows a run with a newer attempt or no longer completed, it becomes active again and its jobs are fetched again.
  - Only the **latest attempt's** jobs are kept; they replace the old ones, and the old attempt's cached job logs are deleted.
  - The card shows "attempt N" when N > 1.
  - This keeps the page in agreement with `checkState`, which reads only the run's current status. Re-running a flaky CI is the usual recovery, so this case has to work.
- **Head of `main`:** the `head_sha` of the newest push run in the list. No extra request.
- **On error:** keep the last data, record `ciError` (GitHub's message, as `checkError` does), and fall back to the idle cadence until a call succeeds.
  - On a rate-limit error, wait until `x-ratelimit-reset` and don't ask again before then.
- **Rate budget (worst case):** active, about 3 requests per 5s, roughly 2,200/hour, and only for the few minutes a run lasts. Idle, about 180 requests/hour, almost all `304`.

**The nudge.** When an attempt of a run named `ciWorkflowName` changes from not-completed to `completed` with the head of `main` as its `head_sha`, call the deployer's `tick()`. It fires once per attempt, so a re-run that goes green nudges too. The existing guards in `tick()` decide whether anything happens.

**Storage.** `<data>/ci.json` (next to `history.json`), written with the existing `readStored`/`writeStored`.

- One record per commit:
  - `sha`, `message` (first line), `committedAt`;
  - `runs[]`: id, workflow name, status, conclusion, created/updated times, url, and `jobs[]` with `steps[]`;
  - `firstSeenAt`.
- Keep the newest `ciKeepCommits` commits (default 50, matching `maxEvents`). When a commit is pruned, its cached job logs are deleted with it.
- A corrupt or missing file starts empty. It's never fatal.

**Normalised states.** GitHub's `status` and `conclusion` pairs are mapped to one state per run, job and step:

| State | From GitHub |
|---|---|
| `QUEUED` | `queued`, `waiting`, `pending`, `requested` |
| `RUNNING` | `in_progress` |
| `SUCCEEDED` | `success` |
| `FAILED` | `failure`, `timed_out`, `startup_failure` |
| `CANCELLED` | `cancelled` |
| `SKIPPED` | `skipped`, `neutral` |
| `UNKNOWN` | anything else (e.g. `action_required`, `stale`) |

`SUCCEEDED`/`SKIPPED`/`neutral` match the deploy gate's `OK_CONCLUSIONS`, so the page never disagrees with the deployer about what's green.

**Job logs.**
- `GET /actions/jobs/{id}/logs` answers with a redirect to plain text. Follow it without the token, as `downloadAsset` already does.
- Fetched only on request, and only for completed jobs.
- Cached at `<data>/ci-logs/<jobId>.log`, keeping the last 2,000 lines as `readLog` does.
- Job ids are numeric. Reject anything else, so the path can't escape the directory.

**API.**
- `GET /status` gains `ci: { commits: CiCommit[]; error?: string; lastCheckAt?: string }`.
- New `GET /ci/jobs/{id}/log` returns `{ log }`, or 404 when the job is unknown, not finished, or its log has expired on GitHub.

**Config.** `ciIdlePollMs`, `ciActivePollMs` and `ciKeepCommits` get defaults in `DEFAULTS` and can be overridden in `deployer.json`.

### Server

- **`deployer/types.ts`:** add the CI shapes. `StatusView.ci` is optional, since an old helper won't send it.
- **`client.ts`:** add `ciJobLog(id)`.
- **`status-map.ts`:** map `ci`, defaulting to no commits.
- **GraphQL** (admin, like the rest of the deploy API):

  ```graphql
  enum CiState { QUEUED RUNNING SUCCEEDED FAILED CANCELLED SKIPPED UNKNOWN }
  type CiStep { number: Int!  name: String!  state: CiState!  startedAt: String  completedAt: String }
  type CiJob { id: ID!  name: String!  state: CiState!  startedAt: String  completedAt: String  url: String!  steps: [CiStep!]! }
  type CiRun { id: ID!  attempt: Int!  workflow: String!  gatesDeploy: Boolean!  state: CiState!  createdAt: String!  updatedAt: String!  url: String!  jobs: [CiJob!]! }
  type DeployCommit { sha: String!  message: String!  committedAt: String!  runs: [CiRun!]! }
  # DeployStatus gains:  commits: [DeployCommit!]!  ciError: String  ciCheckedAt: String
  # Query gains:         ciJobLog(jobId: ID!): String   # admin; null when unavailable
  ```

  - `gatesDeploy` is set by the deployer (`workflow === ciWorkflowName`), so the web app never needs to know the workflow's name.

### Web: the timeline

**Building it.** A pure function (e.g. `buildTimeline(commits, events, running)`) turns the status into an ordered list of entries. It has unit tests.

- **Commit card:** made from every sha in `commits` and every `DEPLOY` / `SKIPPED` event with a sha. Old history and manual deploys get a card with no CI section.
- **Standalone row:** `ROLLBACK`, `RESTART`, `PAUSE`, `RESUME`. These are actions at a moment in time. Putting a rollback on the old commit's card would move it out of time order.
- **Order:** newest activity first. A card's activity time is the latest of its run updates and its event times. A commit re-deployed today therefore comes back to the top.

**Card stages, top to bottom:**

1. **Commit:** short sha chip, message, commit time.
2. **CI:** each run, gating workflow first.
   - A run's row shows its state icon, workflow name, duration and an "Open in GitHub" link. Non-gating runs say "doesn't block deploy".
   - Expanding a run shows its jobs. Each job shows its steps with state icon and duration.
   - **Expanded by default** while the run is unfinished or has failed. Collapsed once it's green.
3. **Deploy:** one line per attempt (the existing `DEPLOY` / `SKIPPED` events, newest last). Each keeps today's details and the "Roll back to this" button. When there's no attempt, the line is derived instead:

   The first rule that matches wins:

   | Shown | When |
   |---|---|
   | "Waiting for tests" | gating run unfinished |
   | "Superseded" | gating run green, no attempt, and the commit is older (`committedAt`) than the running commit |
   | "Waiting to deploy" | gating run green, no attempt (add "auto-deploy paused" when it is) |
   | nothing | otherwise, including when the running commit's `committedAt` isn't known |

   **Why "Superseded" is measured against the running commit** (designer's call):
   - The deployer only ever considers commits after the running one (`commitsSince(running, head)`). So a green commit older than the running one will never be auto-deployed, and one newer than it still might be.
   - It doesn't matter how the running commit got there (deploy, manual deploy or rollback). After a rollback, newer green commits correctly read "Waiting to deploy (auto-deploy paused)".
   - The running commit's `committedAt` comes from its own CI record. If there's no record (e.g. history from before this feature), no "Superseded" label is shown.

4. **Running badge** on the card whose sha is `status.running.sha`.

**Selection and the log panel.**
- `useLogSelection` selects either an event (the deploy log, as today) or a CI job (`ciJobLog`).
- **Default selection:** a running deploy event. Otherwise the newest entry's most relevant stage: its deploy attempt if it has one, else its first failed job, else its newest job.
- **Job still running:** the panel says "Log is available when the job finishes" and links to the job on GitHub.
- **Job finished:** the log is fetched once, and isn't polled since it can't change.
- **Phones:** the panel opens inline under the selected card, as today.

**Polling.** The page already polls `deployStatus` every 5s (2s while busy). With the CI watcher's ~5s cadence, that's enough for live CI. No subscription is needed.

**Top bar.** Show `ciError` the way `lastCheckError` is shown today, e.g. "Can't read CI: …".

### Testing

- **Deployer:**
  - the watcher with a fake GitHub: idle/active cadence, ETag `304`, pruning, a run completing triggers the nudge exactly once per attempt, a re-run going active again and replacing its jobs, errors and back-off;
  - the status mapping table;
  - the job-log endpoint (id validation, redirect, cache, 404s).
- **Server:** API tests for the new fields, including an old helper with no `ci` field.
- **Web:**
  - `buildTimeline` cases: CI only, deploy only, superseded, waiting, re-deploy ordering, standalone rows;
  - card rendering for running, failed and green;
  - selection of a job vs an event.

## Left to the builder

- File and component names and how they split, within the small-files rule.
- Exact icons, colours and spacing, kept consistent with the redesigned page (`ShaChip`, `statusIcon`, `formatDuration`).
- Whether the card list keeps MUI `List` or moves to stacked `Paper`s.
- Whether the watcher shares `GitHub`'s `request()` (preferred) or wraps it to add ETag support. Either way, the rate-limit reset time has to be passed out of it.
- How selection ids tell a CI job apart from a deploy event.
