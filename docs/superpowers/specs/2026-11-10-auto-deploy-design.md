# Auto-deploy and the Deploys page — Design

*Date: 2026-11-10 · Status: draft, awaiting approval · Builds on: `scripts/install-service.ps1` and `scripts/lib/*` (build, migrate, NSSM service, ACL lock-down, go2rtc/ffmpeg download), `docs/RUNNING.md`, the admin section (`apps/web/src/admin/`, side nav in `apps/web/src/layout/nav/`), admin-only GraphQL guards (`apps/server/src/graphql/guards.ts`)*

## 1. Intent

Today, updating the server PC means walking over (or remoting in), running `git pull` in an elevated shell and re-running `install-service.ps1`. The owner wants this to happen by itself: **push to `main`, and the server PC picks it up and redeploys**. Nobody should have to touch the server PC for a normal update.

They also want to **watch and steer deploys from the app itself**: an admin page that shows what's running, the history of deploys with their logs (live while one runs), and buttons to deploy now, restart the app, pause auto-deploy, and roll back.

Nothing is broken today. This is planning ahead, so the bar is "boring and trustworthy", not "clever".

## 2. Decisions already made (by the owner)

- **No containers.** The backend must stay a native Windows process on the LAN (broadcast/multicast discovery, Wake-on-LAN, `LAN_ADDRESS` binding, go2rtc WebRTC on UDP 8555). Docker was discussed and dropped.
- **The repo goes to a private GitHub repo.** (A public repo was considered and dropped.)
- **The server PC pulls; nothing pushes to it.** No self-hosted GitHub Actions runner, no inbound ports.
- **Tests run on GitHub** (GitHub Actions, GitHub-hosted runners) on every push to `main`. The server deploys a commit only once its tests pass.
- **A Deploys page in the admin UI, layout "B":** a top bar with status and buttons, then a deploy/event list on the left and the selected event's log on the right (stacks on a phone). Mockup: `.superpowers/brainstorm/978-1794320425/content/deploy-layout.html`, option B.
- **Controls:** Deploy now, Restart app, Pause / Resume auto-deploy, Roll back.
- **Rollback is blocked across database changes.** If the target version doesn't know about every migration the database has, the rollback is refused with a clear message ("can't roll back past a database change; push a fix instead"). No "roll back anyway".

## 3. Goals

### Deploying
- **Auto-deploy:** a helper on the server PC checks GitHub every **2 minutes** for a new commit on `main`.
- **Wait for CI:** a new commit deploys only after its GitHub Actions checks are all green.
  - Pending → wait and check again.
  - Any failed → record the commit as **skipped (tests failed)** and don't deploy it. A later green commit deploys normally.
  - No check result after **30 minutes** → record **skipped (no test result)**.
- **Only the newest green commit deploys.** If three commits land at once, it deploys the latest one, not each in turn. *(Designer's call, the exact rule:)*
  - If the head of `main` is still pending, wait for it, up to the 30 minutes.
  - If the head is red or has no result, deploy the newest green commit between the running version and the head, if there is one. A red head doesn't block an older green commit.
- **A commit that failed to deploy is never retried automatically** *(designer's call)*. It's marked "failed" and auto-deploy waits for a *newer* green commit. This stops a broken commit from rebuilding and failing every 2 minutes. **Deploy now** may retry it on purpose.
- **Build first, switch after.** The new version is installed and built in its own folder while the current version keeps running. The app is stopped only for the short switch: stop, migrate, switch, start.
- **A failed build changes nothing.** The old version keeps running, untouched, and the event shows where the log broke.
- **Health check after start:** the new version must answer on `http://127.0.0.1:<PORT>/` within 60 s. If it doesn't:
  - and no migration ran in this deploy → switch back to the previous version automatically and record **failed (rolled back automatically)**.
  - and a migration ran → record **failed (app didn't come up)**. The old version can't safely run against the newer database, so the new release is left in place with NSSM restarting it (in case the failure was temporary). Auto-deploy stays **on**, so the owner's fix deploys by itself as soon as it's green. That matters because the Deploys page is unreachable while the app is down. The commit isn't retried (see above). *(Designer's call.)* `docs/RUNNING.md` says where the helper's logs are for this case.
- **Database backup before migrating:** when a deploy has migrations the database hasn't applied yet, the helper takes a `pg_dump` first. It keeps the last 10 backups. There's no restore button. Restoring is a manual, documented step.
- **One thing at a time.** While a deploy, rollback or restart is running, other commands are refused ("busy").

### The Deploys page (admin only)
- A new **Deploys** entry in the admin side menu at `/admin/deploys`. Regular users and guests never see it.
- **Top bar:**
  - The running version: short hash and commit message, and when it was deployed.
  - Whether auto-deploy is **on** or **paused**. When paused, it shows why ("paused by Admin", "paused: rolled back to 9be3a25").
  - When GitHub was last checked, and whether that check worked (for example "can't reach GitHub since 14:02").
  - Buttons: **Deploy now** (deploy the newest green commit on `main` right away, skipping the 2-minute wait, still requiring green CI), **Restart app**, **Pause / Resume auto-deploy**. *(Designer's call:)* Deploy now also works while paused, and auto-deploy stays paused afterwards. Only Resume turns it back on.
- **Left column: event list,** newest first, roughly the last 50. Each entry is one of:
  - a deploy: in progress, succeeded, failed, or skipped (with the reason), plus commit hash, message, time and duration
  - a rollback: to which version, and whether it worked
  - a restart
  - a pause or resume

  Each shows who started it: **auto** or the admin's name.
- **Right column: the selected event's log.** While a deploy runs, the log streams in live.
- **Roll back to this:** a button on each successful deploy in the list that isn't the one running now.
  - If the database has migrations that version doesn't contain, the button is disabled and says why.
  - Rolling back **pauses auto-deploy**, so the next check doesn't put the newer version straight back.
  - A confirmation dialog names the version being rolled back to.
- **During the switch:** the app goes down for a few seconds. The page shows "restarting…" instead of an error and picks up again once the app is back, including the rest of that deploy's log.
- **Helper not running or not installed** (for example on the dev machine): the page says "The deploy helper isn't running on this computer" with a link to the setup section of `docs/RUNNING.md`. The rest of the app is unaffected.

### Setup
- A one-time, elevated setup script installs the helper as its own Windows service. It moves the existing install to the new folder layout (section 5) and stores the GitHub access key.
- `docs/RUNNING.md` gains a section covering: creating the private repo, creating the read-only access key, running the setup, what the Deploys page shows, restoring a database backup, and updating the helper itself.
- A GitHub Actions workflow (`.github/workflows/ci.yml`) runs `pnpm test` on pushes to `main` and on pull requests. Server tests need Postgres, so the workflow uses a Postgres service container for `DATABASE_URL_TEST`.

## 4. Non-goals

- Deploying branches other than `main`, or more than one server.
- Notifications (push, email, Slack). The page is the only place to look. *(Possible later.)*
- Restoring the database from the UI, or rolling back migrations.
- Making the repo public. The design assumes a private repo and a single trusted pusher.
- Containers, a self-hosted runner, or webhooks into the server PC.
- Deploying with failing or missing tests from the UI.

## 5. Anti-goals (would be a failure even if it "works")

- **A deploy that leaves the app stopped** when it didn't need to. A bad build or a failed health check before migration must always leave a working version running.
- **The web app gaining admin power on the PC.** The app runs as `LocalService` and must only be able to *ask* the helper for one of a fixed set of commands. It must never pass a command line, a path or a script, and never arbitrary git refs: a rollback target must be one of the helper's own known, previously successful releases.
- **Secrets in logs.** The GitHub key, `.env` values and database password must never appear in a deploy log or on the page. The helper redacts anything that looks like them before storing a log line.
- **A rollback that silently runs old code against a newer database.**
- **Deploying a red commit.**

## 6. Constraints and facts from the codebase

- `install-service.ps1` currently: stops the service, then installs, builds, migrates, locks down ACLs and starts it, with the repo root as the service's working directory. That stop-first order is what this design changes (build first, stop only for the switch).
- The app loads `.env` from its working directory (`import "dotenv/config"` in `apps/server/src/main.ts`). `prisma migrate deploy` also reads it. `dotenv` honours `DOTENV_CONFIG_PATH`.
- go2rtc and ffmpeg default to `<repo>/tools/...` (`apps/server/src/cameras/go2rtc/binary.ts`), but `GO2RTC_PATH` / `FFMPEG_PATH` override them.
- The service runs as `NT AUTHORITY\LocalService`. The repo is locked down so only Administrators/SYSTEM can change what it runs (`scripts/lib/acl.ps1`). The same guarantee must hold for every release folder and for the helper's own files.
- The helper needs admin-level rights: NSSM, ACLs and stopping/starting the service. It runs as **LocalSystem**, which is the main reason for the anti-goals above.
- Node 22, pnpm, NSSM and PostgreSQL are already on the server PC (`docs/RUNNING.md` §1).

## 7. Shape of the solution (decided here; builder may refine)

These are my calls as the designer, not the owner's. The builder may change them if they find a better way that keeps the goals and anti-goals.

- **The helper** ("deployer") is a small Node + TypeScript program in the monorepo (`apps/deployer`). It uses Node built-ins only and has its own Vitest tests. It runs as a second NSSM service, `HomeDeployer`, as LocalSystem.
  - It runs from **its own installed copy** (for example `C:\ProgramData\HomeDeployer\`), not from a release folder, so a deploy never swaps the helper's code out from under it. Updating the helper is a deliberate step: re-run the setup script. The Deploys page shows "helper update available" when `main` has a newer helper than the installed one.
- **Folder layout on the server PC** (example root `C:\home-control\`):
  - `repo\`: a clone used only for `git fetch` and `git worktree` / export of commits.
  - `releases\<short-sha>\`: one built copy per deployed commit. Keep the last **5** successful ones; older ones are deleted.
  - `current`: a directory junction pointing at the running release. The `HomeControl` service's working directory is the junction.
  - `shared\.env` and `shared\logs\`: shared across releases. They're passed in via `DOTENV_CONFIG_PATH` (or `DATABASE_URL` set directly, since `prisma.config.ts` may not honour it) and NSSM log paths.
  - **go2rtc and ffmpeg belong to each release** *(designer's call)*: each release's own `helpers-download.ps1` pins decide what it gets, and it's passed in via `GO2RTC_PATH` / `FFMPEG_PATH`. Downloads are cached by SHA-256 in `shared\tools-cache\`, so an unchanged pin costs nothing. A pushed go2rtc bump then deploys like code, and a rollback gets the old tools back too.
  - **NSSM settings are re-applied from the release on every switch** *(designer's call)*, rollbacks included, so service settings always match the code that runs. Firewall rules stay a manual setup step.
  - `deployer\`: the helper's state (`history` file), per-event log files, backups and config.
- **Rolling back to a kept release needs no rebuild.** It just stops the app, switches the junction and starts it, which takes seconds. Only kept releases can be rolled back to (the last 5 successful ones), so the list shows the button only on those.
- **The rollback rule (exact):** allowed only if every migration recorded in the database's `_prisma_migrations` table (applied, not rolled back) exists in the target release's `apps/server/prisma/migrations/` folder.
- **Talking to the app:** the helper listens on `127.0.0.1` only, on a fixed port, with a random token. The token is written to a file that only Administrators, SYSTEM and LocalService can read.
  - The app server is the only client. It exposes admin-only GraphQL:
    - a query for status plus the event list
    - a query for one event's log
    - a subscription (or polling) for the live log
    - mutations `deployNow`, `restartApp`, `pauseAutoDeploy`, `resumeAutoDeploy`, `rollback(releaseId)`
  - The app passes the admin's display name along for the "who" field.
  - The browser never talks to the helper directly.
- **The helper keeps its own history on disk, not in the app's database.** The database may be mid-migration or down while the helper still needs to record what's happening.
- **GitHub access:** a **fine-grained personal access token**, scoped to this one repo, with read-only **Contents** and **Checks/Actions** permissions. It's used for `git fetch` over HTTPS and for the checks API. A deploy key can't read check results, which is why it's a token. It's stored in the helper's config, readable only by SYSTEM and Administrators.
- **Restart app** = `nssm restart HomeControl`, then the same health check.
- **Deploy steps** (each one a labelled section in the log):
  1. fetch
  2. CI check
  3. export the commit into `releases\<sha>\`
  4. `pnpm install --frozen-lockfile --config.package-import-method=copy`
  5. `pnpm build`
  6. lock down ACLs on the release
  7. backup, if migrations are pending
  8. stop the service
  9. `prisma migrate deploy` from the new release
  10. switch the junction
  11. start the service
  12. health check
  13. prune old releases and backups

  The PowerShell helpers in `scripts/lib/` are reused where that's simpler than rewriting them in Node.

## 8. Left to the builder

- Exact port, file formats, history retention beyond "about 50 events", and how live log lines reach the page (GraphQL subscription vs polling).
- How the setup script migrates today's single-folder install into the release layout. It must not lose `.env`, `tools\` or logs, and must leave a running app at the end.
- Wording, icons and empty states on the Deploys page, following the existing admin pages' look.
- Whether `install-service.ps1` becomes a thin wrapper around the new flow or is replaced. A manual way to deploy without the helper should still exist and be documented.
- Error messages for GitHub being unreachable, an expired token (fine-grained tokens expire, so the page should say so clearly), a full disk, and so on.
