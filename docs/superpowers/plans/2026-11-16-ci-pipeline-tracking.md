# CI Pipeline Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Deploys page shows each commit on `main` as a card: its GitHub Actions runs, jobs and steps (live), its deploy attempts, and whether it's running now.

**Architecture:**
- **Deployer.** A new CI watcher (`apps/deployer/src/ci/`) polls GitHub Actions with ETags and stores runs per commit in `ci.json`. The deployer exposes the result in `/status`, plus a new job-log endpoint, and nudges the deploy loop when the gating run completes.
- **Server.** Passes the data through GraphQL.
- **Web.** A pure `buildTimeline` turns commits and events into cards and standalone rows, and the page renders them.

**Tech Stack:** TypeScript, Node 22 `fetch`, vitest (all packages), GraphQL (server schema + web codegen), React 19 + MUI 9 + Apollo 4.

**Spec:** [docs/superpowers/specs/2026-11-16-ci-pipeline-tracking-design.md](../specs/2026-11-16-ci-pipeline-tracking-design.md). Read it first; this plan only adds the decisions it leaves open.

## Global Constraints

- **No webhooks; same GitHub token.** No new permissions (Actions: Read covers everything).
- **Config defaults:** `ciIdlePollMs: 20_000`, `ciActivePollMs: 5_000`, `ciKeepCommits: 50`.
- **Runs request:** `GET /actions/runs?branch=<branch>&event=push&per_page=20`. Jobs: `GET /actions/runs/{id}/jobs?per_page=100`, which by default returns the latest attempt.
- **Job logs:** fetched only for completed jobs, cached in `<data>/ci-logs/<jobId>.log`, keeping the last 2,000 lines. Job ids must match `/^\d{1,20}$/`.
- **The watcher never changes deploy decisions.** `pickCommit`, `findPick` and `checkState` stay untouched. Its only effect on deploys is calling `Deployer.tick()`.
- **No watcher failure may stop the deploy loop or the API.**
- **Compatibility with an old helper:** `/status` without `ci` must render, with commits `[]`.
- **State mapping:** exactly the spec's table. `SUCCEEDED` and `SKIPPED` count as green.
- **Card copy:**
  - deploy stage: "Waiting for tests", "Superseded", "Waiting to deploy", "Waiting to deploy (auto-deploy paused)";
  - non-gating run: "doesn't block deploy";
  - running job: "Log is available when the job finishes";
  - re-runs: "attempt N" when N > 1;
  - CI error: "Can't read CI: <message>".
- **Small files:** one component or concern per file. Deployer files use single quotes and semicolons, server files use double quotes and semicolons, web files use single quotes and no semicolons (match each package).

## Review Focus

1. **GitHub sends a queued job with no `steps`, or a run with `head_commit: null`.** The card should show the job with no steps, and the commit message falls back to the run's `display_title`. Test in Task 2.
2. **The helper hasn't been reinstalled yet, so `/status` has no `ci`.** The page should show deploy-only cards, as today but grouped. Tests in Task 6 (server) and Task 7 (`buildTimeline`).
3. **A job log has expired on GitHub (404/410), or the id isn't numeric.** The endpoint should answer 404, and the panel says "No log for this job." Tests in Task 5.
4. **A `ROLLBACK` to a sha that also has a card.** The rollback should stay a standalone row and not join the card; `DEPLOY` and `SKIPPED` events join by exact full sha. Test in Task 7.
5. **GitHub is down or rate-limited during a pass.** The pass should resolve without throwing, keep the last data, set `error`, and with a reset time wait until then. Test in Task 4.

---

### Task 1: GitHub client — conditional requests, runs, jobs, job logs

**Files:**
- Modify: `apps/deployer/src/github.ts`
- Test: `apps/deployer/test/github.test.ts`

**Interfaces:**
- Produces:
  - `GitHubError` gains `readonly resetAt?: Date`. It's set from `x-ratelimit-reset`, which is epoch seconds, on rate-limit errors.
  - `export type Conditional<T> = { changed: false } | { changed: true; data: T; etag?: string }`.
  - `export interface ApiRun { id: number; run_attempt: number; name: string; head_sha: string; status: string; conclusion: string | null; created_at: string; updated_at: string; html_url: string; display_title: string; head_commit: { message: string; timestamp: string } | null }`.
  - `export interface ApiStep { name: string; number: number; status: string; conclusion: string | null; started_at: string | null; completed_at: string | null }`.
  - `export interface ApiJob { id: number; name: string; status: string; conclusion: string | null; started_at: string | null; completed_at: string | null; html_url: string; steps?: ApiStep[] }`.
  - `GitHub.listPushRuns(branch: string, etag?: string): Promise<Conditional<ApiRun[]>>`.
  - `GitHub.runJobs(runId: number, etag?: string): Promise<Conditional<ApiJob[]>>`.
  - `GitHub.jobLog(jobId: number): Promise<string | undefined>`. It returns undefined on 404 or 410.

- [ ] **Step 1: Write failing tests** in a new `describe('GitHub Actions detail')` block, using the existing `fake()` helper:
  - `listPushRuns sends If-None-Match and returns changed:false on 304`: the handler returns `{ status: 304 }`. Expect `{ changed: false }`, and expect `calls[0].init.headers['If-None-Match'] === '"e1"'`.
  - `listPushRuns returns runs and the etag`: the URL equals `https://api.github.com/repos/o/r/actions/runs?branch=main&event=push&per_page=20`. Expect `{ changed: true, data: [...], etag: '"e2"' }` from header `etag: "e2"`.
  - `runJobs asks for the run's jobs`: the URL equals `.../actions/runs/42/jobs?per_page=100`, and the result is `data` = the `jobs` array.
  - `jobLog follows the redirect without the token`: the first response is 302 with `location: https://logs.example/x`, and the second is a text body `line1\nline2`. Expect `'line1\nline2'`, and the second call's headers carry no `Authorization`.
  - `jobLog returns undefined on 404 and 410`.
  - `rate limit error carries resetAt`: 403 with `x-ratelimit-remaining: 0` and `x-ratelimit-reset: 1790000000`. Expect `err.resetAt.getTime() === 1790000000_000`.
- [ ] **Step 2: Run** `pnpm --filter @home/deployer test -- github`. Expected: the new tests FAIL (methods missing).
- [ ] **Step 3: Implement.**
  - Add a private `conditional<T>(path, etag, pick: (body) => T)`. It returns `{changed:false}` on 304, throws `GitHubError` on other non-ok statuses, and otherwise returns the data and the `etag` header.
  - `jobLog` reuses the redirect pattern of `downloadAsset`: `request(..., 'manual')`, then a token-less fetch of `location`.
  - Pass `resetAt` into the rate-limit `GitHubError`.
- [ ] **Step 4: Run** `pnpm --filter @home/deployer test -- github`. Expected: PASS (old tests too).
- [ ] **Step 5: Commit** `feat(deployer): GitHub Actions runs, jobs and job logs`

### Task 2: CI types and state mapping

**Files:**
- Create: `apps/deployer/src/ci/types.ts`, `apps/deployer/src/ci/ci-map.ts`
- Test: `apps/deployer/test/ci-map.test.ts`

**Interfaces:**
- Consumes: `ApiRun`, `ApiJob` (Task 1).
- Produces (`types.ts`):
  ```ts
  export type CiState = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'SKIPPED' | 'UNKNOWN';
  export interface CiStep { number: number; name: string; state: CiState; startedAt?: string; completedAt?: string }
  export interface CiJob { id: number; name: string; state: CiState; startedAt?: string; completedAt?: string; url: string; steps: CiStep[] }
  export interface CiRun { id: number; attempt: number; workflow: string; gatesDeploy: boolean; state: CiState; completed: boolean; createdAt: string; updatedAt: string; url: string; jobs: CiJob[]; jobsFinal: boolean }
  export interface CiCommit { sha: string; message: string; committedAt: string; firstSeenAt: string; runs: CiRun[] }
  export interface CiView { commits: CiCommit[]; error?: string; lastCheckAt?: string }
  ```
- Produces (`ci-map.ts`):
  - `toCiState(status: string, conclusion: string | null): CiState`;
  - `toRun(api: ApiRun, gatingWorkflow: string): Omit<CiRun, 'jobs' | 'jobsFinal'>`;
  - `toJob(api: ApiJob): CiJob`;
  - `commitOf(api: ApiRun): { sha: string; message: string; committedAt: string }`. The message is the first line of `head_commit.message`, else `display_title`. `committedAt` is `head_commit.timestamp`, else `created_at`.

- [ ] **Step 1: Write failing tests:**
  - `toCiState follows the spec table`, with a `it.each` over every row of the spec table. Examples: `('queued', null) → QUEUED`, `('waiting', null) → QUEUED`, `('in_progress', null) → RUNNING`, `('completed','success') → SUCCEEDED`, `('completed','timed_out') → FAILED`, `('completed','startup_failure') → FAILED`, `('completed','cancelled') → CANCELLED`, `('completed','neutral') → SKIPPED`, `('completed','action_required') → UNKNOWN`.
  - `toRun marks gatesDeploy by workflow name and completed by status`.
  - `toJob maps a queued job without steps to steps: []` (Review Focus 1).
  - `commitOf falls back to display_title and created_at when head_commit is null` (Review Focus 1).
- [ ] **Step 2: Run** `pnpm --filter @home/deployer test -- ci-map`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** both files. Null timestamps become absent fields.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): CI state model`

### Task 3: CI store

**Files:**
- Create: `apps/deployer/src/ci/ci-store.ts`
- Modify: `apps/deployer/src/history.ts`. Extract `export function tailLines(text: string, max: number): string` from `readLog` and use it there.
- Test: `apps/deployer/test/ci-store.test.ts`

**Interfaces:**
- Consumes: `readStored`/`writeStored` (`history-file.ts`), Task 2 types.
- Produces: `class CiStore` with:
  - `constructor(file: string, logsDir: string, keep: number, now: () => Date)`;
  - `commits(): CiCommit[]`, newest `committedAt` first;
  - `run(id: number): CiRun | undefined`;
  - `upsertRun(commit: { sha: string; message: string; committedAt: string }, run: Omit<CiRun, 'jobs' | 'jobsFinal'>): void`;
  - `setJobs(runId: number, jobs: CiJob[], final: boolean): void`;
  - `logFile(jobId: number): string`.

- [ ] **Step 1: Write failing tests** (temp dir):
  - `persists across instances`.
  - `a new attempt clears jobs, resets jobsFinal and deletes the old jobs' cached logs`: write `logFile(7)`, then upsert the same run id with `attempt: 2`. Expect jobs `[]`, `jobsFinal: false`, and the file gone.
  - `same attempt keeps jobs`.
  - `prunes to keep commits by committedAt and deletes their job logs` (keep = 2, three commits).
  - `a corrupt file starts empty`.
  - In `history.test.ts`: `tailLines keeps the last N lines and the trailing newline`.
- [ ] **Step 2: Run** `pnpm --filter @home/deployer test -- ci-store history`. Expected: FAIL.
- [ ] **Step 3: Implement.** Store shape `{ commits: CiCommit[] }`. Save after each mutation. `firstSeenAt` is set on first insert, from `now()`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): CI store`

### Task 4: CI watcher

**Files:**
- Create: `apps/deployer/src/ci/ci-watcher.ts`
- Test: `apps/deployer/test/ci-watcher.test.ts`

**Interfaces:**
- Consumes: `GitHub.listPushRuns`, `runJobs`, `GitHubError.resetAt` (Task 1); `toRun`, `toJob`, `commitOf` (Task 2); `CiStore` (Task 3).
- Produces:
  ```ts
  export interface CiWatcherDeps {
    github: Pick<GitHub, 'listPushRuns' | 'runJobs'>;
    store: CiStore;
    branch: string;
    gatingWorkflow: string;
    idleMs: number;
    activeMs: number;
    now: () => Date;
    onGatingCompleted: () => void;
    errorText: (e: unknown) => string;
  }
  export class CiWatcher {
    constructor(deps: CiWatcherDeps);
    start(): void;            // first pass after 0 ms, then setTimeout(nextDelayMs())
    stop(): Promise<void>;    // clears the timer, awaits the pass in flight
    checkOnce(): Promise<void>; // one pass; never rejects
    nextDelayMs(): number;
    view(): CiView;
  }
  ```

**One pass:**
1. Call `listPushRuns(branch, etag)` and remember the new etag.
2. On `changed`, for each run:
   - read the stored run first;
   - `upsertRun`;
   - remember the run's id as "listed";
   - the head is `runs[0].head_sha`.
3. **Nudge.** Call `onGatingCompleted()` at most once per pass, when all of these hold:
   - the run gates the deploy;
   - it's now completed;
   - its `head_sha === head`;
   - the stored run existed before and was either not completed or had a different attempt.
4. For each listed run with `!jobsFinal`: `runJobs(id, jobEtag[id])`, and on `changed`, `setJobs(id, jobs.map(toJob), run.completed)`.
5. Set `lastCheckAt = now()` and clear `error`.

**On a throw:** set `error = errorText(e)`. If it's a `GitHubError` with `resetAt`, set `pausedUntil = resetAt`.

**`nextDelayMs`:**
- if `pausedUntil` is in the future: `max(idleMs, pausedUntil - now)`;
- otherwise, if there's an error: `idleMs`;
- otherwise, if any listed run is not completed or `!jobsFinal`: `activeMs`;
- otherwise: `idleMs`.

- [ ] **Step 1: Write failing tests** with a hand-written `FakeActions` (queues of `Conditional` answers, recorded calls) and a real `CiStore` in a temp dir:
  - `stores runs and jobs per commit` (CI + Android on one sha; Android `gatesDeploy: false`).
  - `sends the last etag and does nothing more on 304`.
  - `fetches jobs while unfinished, once more when completed, then never`.
  - `a run first seen completed gets its jobs fetched once`.
  - `nudges once when the gating run on the head completes; not for Android, not for an older sha, not on first sight`.
  - `a re-run (same id, attempt 2, in_progress) becomes active again, replaces jobs, and nudges again when it completes`.
  - `nextDelayMs: active 5000 while a run is unfinished, idle 20000 otherwise` (deps `idleMs: 20000`, `activeMs: 5000`).
  - `GitHub down: checkOnce resolves, keeps the stored data, sets view().error, idle delay` (Review Focus 5).
  - `rate limited: waits until resetAt` (`resetAt` = now + 10 min → `nextDelayMs() === 600000`).
- [ ] **Step 2: Run** `pnpm --filter @home/deployer test -- ci-watcher`. Expected: FAIL.
- [ ] **Step 3: Implement** `ci-watcher.ts`. The etags and the listed ids live only in memory.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): CI watcher`

### Task 5: Wire the watcher into the deployer, job-log endpoint, config, docs

**Files:**
- Create: `apps/deployer/src/ci/ci-job-log.ts`
- Modify:
  - `apps/deployer/src/config.ts`: the three config keys, plus `Paths.ci` (`<data>\ci.json`) and `Paths.ciLogs` (`<data>\ci-logs`);
  - `apps/deployer/src/deployer.ts`, `apps/deployer/src/api.ts`, `apps/deployer/src/main.ts`;
  - `docs/RUNNING.md`: a short note in the update section saying that this release needs `install-deployer.ps1` re-run, and naming the three config keys.
- Test: `apps/deployer/test/ci-job-log.test.ts`, `api.test.ts`, `config.test.ts`, `deployer.test.ts`

**Interfaces:**
- Consumes: `CiStore`, `CiWatcher`, `GitHub.jobLog`, `tailLines`.
- Produces:
  - `readJobLog(o: { id: string; store: CiStore; github: Pick<GitHub, 'jobLog'> }): Promise<string | undefined>`;
  - `export interface CiSource { view(): CiView; jobLog(id: string): Promise<string | undefined>; start(): void; stop(): Promise<void> }`, in `deployer.ts`;
  - `new Deployer(ctx, github, ops = REAL_OPS, ci: CiSource = NO_CI)`, where `NO_CI` has an empty view and `jobLog` returning undefined;
  - `StatusView.ci: CiView`;
  - `Deployer.ciJobLog(id: string)`;
  - `Deployer.start()`/`stop()` also start and stop `ci`.
- API: `GET /ci/jobs/{id}/log` answers `200 { log }` or `404 { error: 'Not found' }`. The `Api` type becomes `Pick<Deployer, 'status' | 'command' | 'ciJobLog'>`.

- [ ] **Step 1: Write failing tests:**
  - `ci-job-log.test.ts`:
    - `rejects a non-numeric id` (`'../x'` → undefined; no GitHub call);
    - `unknown or unfinished job → undefined`;
    - `fetches once, caches, tails to 2000 lines` (second call makes no GitHub call);
    - `expired log (jobLog undefined) → undefined` (Review Focus 3).
  - `api.test.ts`: `GET /ci/jobs/5/log answers the log`, and `404 when the deployer has none`. Add `ciJobLog` to `FakeDeployer`.
  - `config.test.ts`: `defaults ciIdlePollMs 20000, ciActivePollMs 5000, ciKeepCommits 50`.
  - `deployer.test.ts`: `status includes the CI view`, and `start/stop start and stop the CI source` (fake `CiSource`).
- [ ] **Step 2: Run** `pnpm --filter @home/deployer test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** In `main.ts`, build the store, then the deployer with a watcher whose `onGatingCompleted` is `() => void deployer.tick().catch((e) => console.error('CI nudge failed:', e))`. `errorText` is `(e) => checkError(ctx, e)`. A `let deployer` declared before the watcher is fine. Update `docs/RUNNING.md`.
- [ ] **Step 4: Run** `pnpm --filter @home/deployer test`, then `pnpm --filter @home/deployer build`. Expected: all PASS, tsc clean.
- [ ] **Step 5: Commit** `feat(deployer): serve CI pipeline status and job logs`

### Task 6: Server — GraphQL pass-through

**Files:**
- Modify:
  - `apps/server/src/deployer/types.ts`, `client.ts`, `status-map.ts`;
  - `apps/server/src/graphql/schema.graphql`, `apps/server/src/graphql/resolvers/deploys.ts`;
  - `apps/server/test/fakes/fake-deployer.ts`.
- Test: `apps/server/test/api-deploys.test.ts`, `apps/server/test/deployer-client.test.ts`

**Interfaces:**
- Consumes: the helper's `/status.ci` and `/ci/jobs/{id}/log` (Task 5).
- Produces:
  - **GraphQL:** exactly the spec's schema block, with `CiRun.attempt: Int!` included. `DeployStatus` gains `commits: [DeployCommit!]!`, `ciError: String` and `ciCheckedAt: String`. Query gains `ciJobLog(jobId: ID!): String  # admin; null when unavailable`.
  - **Types:** `StatusView.ci?: { commits: CiCommitView[]; error?: string; lastCheckAt?: string }`, mirroring the deployer's types.
  - **Client:** `DeployerClient.ciJobLog(id: string): Promise<string | null>`. Also added to `unavailableDeployer`.
  - **`toApiDeployStatus`:** maps run and job ids with `String(id)`. `commits` defaults to `[]`, and `ciError`/`ciCheckedAt` default to `null`.

- [ ] **Step 1: Write failing tests:**
  - `api-deploys.test.ts`:
    - `maps CI commits for admins`: one commit, one run with one job and one step; assert the GraphQL output fields and `attempt`.
    - `an old helper without ci gives commits [] and ciError null` (Review Focus 2).
    - `ciJobLog answers the helper's log, null on 404`.
    - Add `{ ciJobLog(jobId: "1") }` to the `forbids users and guests` list.
  - `deployer-client.test.ts`: `ciJobLog encodes the id and returns null when unavailable`.
  - `FakeDeployer` gains `jobLogs = new Map<string, string>()` and the route `/ci/jobs/:id/log`.
- [ ] **Step 2: Run** `pnpm --filter @home/server test -- deploy`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @home/server test -- deploy` and `pnpm --filter @home/server build`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(server): CI pipeline in deployStatus and ciJobLog`

### Task 7: Web — data and `buildTimeline`

**Files:**
- Modify:
  - `apps/web/src/admin/data/deployDocuments.ts`: add `commits { sha message committedAt runs { id attempt workflow gatesDeploy state createdAt updatedAt url jobs { id name state startedAt completedAt url steps { number name state startedAt completedAt } } } } ciError ciCheckedAt`, and a new `CI_JOB_LOG` query (`query CiJobLog($jobId: ID!) { ciJobLog(jobId: $jobId) }`);
  - `apps/web/src/admin/data/useDeployStatus.ts`: export `DeployCommit`, `CiRun` and `CiJob` types from `DeployStatus`;
  - `apps/web/src/test/deployFixtures.ts`: add `ciRunFixture`, `ciJobFixture` and `deployCommitFixture`, and default `commits: []`, `ciError: null` and `ciCheckedAt: null` in `deployStatusFixture`.
- Create: `apps/web/src/admin/deploys/timeline/buildTimeline.ts`
- Test: `apps/web/src/admin/deploys/timeline/buildTimeline.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PendingDeploy = 'WAITING_FOR_TESTS' | 'SUPERSEDED' | 'WAITING_TO_DEPLOY' | null
  export type TimelineEntry =
    | { type: 'commit'; key: string; sha: string; message: string | null; committedAt: string | null
        runs: CiRun[]          // gating first, then by createdAt
        attempts: DeployEvent[] // DEPLOY events for this sha, oldest first
        pending: PendingDeploy; running: boolean; activityAt: string }
    | { type: 'action'; key: string; event: DeployEvent; activityAt: string }
  export function buildTimeline(i: { commits: readonly DeployCommit[]; events: readonly DeployEvent[]; runningSha: string | null }): TimelineEntry[]
  ```
- **Rules:**
  - Keys: `commit:<sha>` and `event:<id>`.
  - `DEPLOY` events with a sha join the card with that exact sha. `SKIPPED` is a status of `DEPLOY`. Other kinds, and sha-less events, become `action` entries.
  - `activityAt` is the max of `committedAt`, the runs' `updatedAt`, and the attempts' `finishedAt ?? startedAt`. Entries are sorted newest `activityAt` first.
  - **Gating state:**
    - unfinished if any gating run is `QUEUED` or `RUNNING`;
    - green if there's at least one gating run and all are `SUCCEEDED` or `SKIPPED`.
  - **`pending`** (only when `attempts` is empty), first match wins:
    1. `WAITING_FOR_TESTS` when unfinished;
    2. `SUPERSEDED` when green and `committedAt` is older than the running commit's `committedAt` (taken from `commits`);
    3. `WAITING_TO_DEPLOY` when green;
    4. otherwise `null`.

- [ ] **Step 1: Write failing tests:**
  - `CI-only commit becomes a card with runs, gating first`.
  - `deploy event without CI data becomes a card with no runs` (Review Focus 2).
  - `DEPLOY and SKIPPED events join the card by exact sha; ROLLBACK, RESTART and PAUSE stay action rows` (Review Focus 4).
  - `waiting for tests / waiting to deploy / superseded / null when running commit has no committedAt`.
  - `a re-deploy today moves an old commit's card to the top`.
  - `running marks the card whose sha is runningSha`.
- [ ] **Step 2: Run** `pnpm --filter @home/web test -- buildTimeline`. Expected: FAIL (the `pretest` codegen runs first and must succeed against Task 6's schema).
- [ ] **Step 3: Implement** `buildTimeline.ts` and the fixture and doc changes.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): build the deploy timeline from commits and events`

### Task 8: Web — commit cards

**Files:**
- Create, in `apps/web/src/admin/deploys/timeline/`:
  - `ciLabels.ts`: `ciStateIcon(state: CiState, size?: number): ReactElement` and `isUnfinished(state)`;
  - `CiStepList.tsx`: steps with icon, name and duration;
  - `CiJobRow.tsx`: a job row, selectable, with its steps underneath;
  - `CiRunSection.tsx`: a run row (icon, workflow, "attempt N", duration, "doesn't block deploy", an "Open in GitHub" link), collapsible. Expanded by default while unfinished or failed;
  - `DeployStage.tsx`: the attempts list, or the pending line from the copy in Global Constraints;
  - `CommitCard.tsx`: `ShaChip`, message, `relativeTime(committedAt)`, a "Running" chip, the runs, and the deploy stage;
  - `DeployTimeline.tsx`: maps entries to `CommitCard`, or to the existing `DeployEventRow` for action rows, and renders `selectedLog` under the card or row that holds the selection.
- Modify:
  - `apps/web/src/admin/deploys/DeployEventRow.tsx`: export `metaLine` and `RollbackButton` (moved into `deployEventParts.tsx`) so `DeployStage` reuses them;
  - delete `DeployEventList.tsx`, which `DeployTimeline` replaces.
- Test: `apps/web/src/admin/deploys/timeline/CommitCard.test.tsx`

**Interfaces:**
- Consumes: `TimelineEntry` (Task 7) and `Selection` (Task 9's type; define it here in `timeline/selection.ts` so this task compiles):
  ```ts
  export type Selection = { kind: 'event'; id: string } | { kind: 'job'; id: string }
  ```
- Produces:
  - `CommitCard` props: `{ entry; selection: Selection | null; paused: boolean; disabled: boolean; onSelect(s: Selection); onRollback(e: DeployEvent); selectedLog?: ReactNode }`;
  - `DeployTimeline` props: `{ entries: TimelineEntry[]; selection; paused; disabled; onSelect; onRollback; selectedLog?: ReactNode }`.

- [ ] **Step 1: Write failing tests** (render with fixtures):
  - `a running CI run is expanded and shows its jobs and steps`.
  - `a green run is collapsed and expands on click`.
  - `a non-gating run says "doesn't block deploy"`.
  - `attempt 2 is labelled`.
  - `pending lines read "Waiting for tests", "Superseded", "Waiting to deploy (auto-deploy paused)"`.
  - `clicking a job calls onSelect({ kind: 'job', id })`.
  - `a deploy attempt keeps "Roll back to this"`.
- [ ] **Step 2: Run** `pnpm --filter @home/web test -- CommitCard`. Expected: FAIL.
- [ ] **Step 3: Implement** the components.
- [ ] **Step 4: Run** `pnpm --filter @home/web test -- CommitCard`, then `pnpm --filter @home/web lint`. Expected: PASS, no lint errors.
- [ ] **Step 5: Commit** `feat(web): commit cards with CI runs, jobs and steps`

### Task 9: Web — selection, CI job logs, page wiring

**Files:**
- Create:
  - `apps/web/src/admin/data/useCiJobLog.ts`: `useCiJobLog(jobId: string | null): { log: string | null; loading: boolean }`. It uses `CI_JOB_LOG` with `fetchPolicy: 'cache-first'` and no polling;
  - `apps/web/src/admin/deploys/CiJobPending.tsx`: "Log is available when the job finishes", plus a link to the job's `url`.
- Modify:
  - `apps/web/src/admin/deploys/useLogSelection.ts`: becomes `useLogSelection(entries: TimelineEntry[], collapsible: boolean): { selected: Selection | null; select(s: Selection): void }`;
  - `apps/web/src/admin/deploys/DeployLogPanel.tsx`: adds an `emptyText` prop (default `'No log for this event.'`) and an `ariaLabel` prop (default `'Deploy log'`);
  - `apps/web/src/admin/deploys/DeployTopBar.tsx`: shows `Can't read CI: ${ciError}` in `warning.main` under the check line when `ciError` is set;
  - `apps/web/src/admin/DeploysPage.tsx`: `buildTimeline` → `DeployTimeline`. The panel is chosen by the selection kind:
    - event → `useDeployLog` → `DeployLogPanel`;
    - finished job → `useCiJobLog` → `DeployLogPanel` with `emptyText='No log for this job.'` and `ariaLabel='CI log'`;
    - unfinished job → `CiJobPending`.
- Test: `useLogSelection.test.ts`, `DeploysPage.test.tsx`

**Default selection, first match wins:**
1. the picked selection, if it still exists;
2. a `RUNNING` deploy event;
3. for the first entry:
   - its newest attempt;
   - else its first `FAILED` job;
   - else its newest job;
   - else, for an action row, its event.

Collapse-on-retap on phones works as today.

- [ ] **Step 1: Write failing tests:**
  - `useLogSelection.test.ts`: rewrite the cases for entries:
    - `defaults to the running deploy`;
    - `else the first failed job of the newest card`;
    - `a picked job stays selected across updates`;
    - `phones: tapping the open selection closes it`.
  - `DeploysPage.test.tsx`: keep the existing cases (they now render cards), and add:
    - `clicking a finished job shows its CI log` (a `CiJobLog` handler);
    - `a running job shows "Log is available when the job finishes"`;
    - `ciError shows "Can't read CI: …"`;
    - `a status without commits still shows deploy cards`.
- [ ] **Step 2: Run** `pnpm --filter @home/web test -- useLogSelection DeploysPage`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @home/web test`, `pnpm --filter @home/web typecheck` and `pnpm --filter @home/web lint`. Expected: all PASS.
- [ ] **Step 5: Run the whole repo:** `pnpm test`. Expected: PASS. The server tests need the test Postgres from `.env`.
- [ ] **Step 6: Commit** `feat(web): CI pipeline on the Deploys page`
