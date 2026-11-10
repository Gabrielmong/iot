# Auto-deploy and the Deploys page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server PC deploys new green commits on `main` by itself, and admins watch and steer deploys (deploy now, restart, pause/resume, rollback) from a Deploys page in the app.

**Architecture:** A new package `apps/deployer` runs as its own Windows service (`HomeDeployer`, LocalSystem). It polls GitHub, builds each commit into `releases\<sha>\`, switches a `current` junction that the `HomeControl` service runs from, and keeps its history and logs on disk. It exposes a token-protected HTTP API on `127.0.0.1`. The app server is that API's only client: it re-exposes it as admin-only GraphQL, and the web app renders it as `/admin/deploys` (layout B).

**Tech Stack:** Node 22 + TypeScript (NodeNext ESM), Vitest, `pg` (deployer only), PowerShell 5.1 + NSSM, GitHub Actions, Apollo Server/Client, React 19 + MUI.

**Spec:** `docs/superpowers/specs/2026-11-10-auto-deploy-design.md`

## Global Constraints

- Poll every **2 minutes**. CI wait limit **30 minutes**. Health check: `GET http://127.0.0.1:<PORT>/` must answer 2xx within **60 s**.
- Keep the last **5** successful releases and the last **10** database backups. Keep about **50** history events. Deleting an event deletes its log file.
- Deploy only commits whose GitHub checks are all green. A failed commit is never retried automatically; **Deploy now** may retry it.
- Rollback is allowed only to a kept, previously successful release that contains every migration applied in `_prisma_migrations` (applied, not rolled back). Otherwise refuse with: `Can't roll back past a database change; push a fix instead.`
- Rollback pauses auto-deploy with reason `rolled back to <short-sha>`. Deploy now works while paused and leaves it paused. Only Resume turns it back on.
- If a migration ran and the health check fails, leave the new release running under NSSM, keep auto-deploy **on**, and mark the commit failed.
- The helper accepts only these commands: `deployNow`, `restartApp`, `pause`, `resume`, `rollback(sha)`. A rollback `sha` must match a kept release. No paths, scripts or refs come from the app.
- One operation at a time. Anything else while busy is refused with HTTP 409 and the message `Busy: <what is running>`.
- Never write a secret into a log or API response: the GitHub token, the API token, any `.env` value, or the password in a `postgres://` URL.
- Helper API binds `127.0.0.1` only, on port **4100**, with `Authorization: Bearer <token>`. The token file is readable by Administrators, SYSTEM and LocalService only.
- Short SHA = first 7 characters, everywhere in the UI and folder names.
- Small files and components, one responsibility each (owner preference).
- *Deviation from spec §7:* the deployer depends on `pg`, already in the lockfile through `@prisma/adapter-pg`, to read `_prisma_migrations`. Everything else uses Node built-ins.

## Review Focus

1. **The helper restarts in the middle of a deploy** (crash, reboot). Expected: the `RUNNING` event becomes `FAILED` with "helper stopped during this". If `HomeControl` is stopped and `current` exists, it is started. *Test: Task 8, `recovers an interrupted deploy`.*
2. **GitHub unreachable or token expired.** Expected: no deploy happens. Status shows `lastCheckError` (an HTTP 401 says "GitHub token expired or invalid"), and the next tick tries again. *Test: Task 9, `records a failed check and keeps polling`.*
3. **The app server can't reach the helper** (not installed, stopped, wrong token). Expected: `deployStatus.available = false`. The page shows the "helper isn't running" notice, and other admin pages are unaffected. *Test: Task 10, `reports unavailable when the helper is down`.*
4. **The page during the switch**: polling errors while an operation is busy. Expected: "Restarting…", not an error, and it recovers without a reload. *Test: Task 11, `shows restarting while the app is down mid-deploy`.*
5. **Secrets in command output** (for example git echoing a URL with credentials, or prisma printing `DATABASE_URL`). Expected: redacted before the log file is written. *Test: Task 2, `redacts tokens and postgres passwords`.*

---

## File Structure

```
.github/workflows/ci.yml                       CI on GitHub-hosted Ubuntu + Postgres
apps/deployer/
  package.json, tsconfig.json, vitest.config.ts
  src/config.ts            loads deployer.json + shared .env
  src/redact.ts            secret redaction
  src/history.ts           history.json state + events (atomic writes, pruning)
  src/event-log.ts         per-event log files (redacted, sectioned)
  src/github.ts            GitHub compare + check-runs client
  src/pick-commit.ts       pure commit-selection rule
  src/migrations.ts        applied/pending migrations, rollback rule
  src/backup.ts            pg_dump + pruning
  src/releases.ts          release dirs, junction, pruning
  src/system.ts            System interface + real impl (run, nssm, health)
  src/deploy.ts            deploy pipeline
  src/rollback.ts          rollback + restart operations
  src/recover.ts           startup recovery
  src/deployer.ts          core: tick, commands, busy lock, status view
  src/api.ts               127.0.0.1 HTTP API
  src/main.ts              wiring
  test/*.test.ts, test/fakes.ts
scripts/apply-service-settings.ps1             NSSM settings for HomeControl (run per release switch)
scripts/install-helpers.ps1                    go2rtc/ffmpeg into a release, via SHA cache
scripts/protect-release.ps1                    ACL lock-down of one folder
scripts/install-deployer.ps1                   one-time setup / helper update
scripts/lib/helpers-download.ps1               (modify) cache support
scripts/install-service.ps1                    (modify) refuse when HomeDeployer exists
apps/server/src/deployer/client.ts             HTTP client for the helper
apps/server/src/graphql/resolvers/deploys.ts   admin-only resolvers
apps/server/src/graphql/schema.graphql         (modify) deploy types
apps/server/src/config.ts, main.ts, services/deps.ts   (modify) wiring
apps/server/test/api-deploys.test.ts, test/fakes/fake-deployer.ts
apps/web/src/admin/data/deployDocuments.ts, useDeployStatus.ts, useDeployCommands.ts
apps/web/src/admin/DeploysPage.tsx
apps/web/src/admin/deploys/DeployTopBar.tsx, DeployEventList.tsx, DeployEventRow.tsx,
  DeployLogPanel.tsx, RollbackDialog.tsx, HelperUnavailable.tsx, deployLabels.ts
apps/web/src/layout/nav/navItems.ts, AppRoutes.tsx   (modify)
docs/RUNNING.md                                 (modify) new section
```

---

### Task 1: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow.**
  - Triggers: `push` to `main`, and `pull_request`.
  - One job `test` on `ubuntu-latest`, with a `postgres:17` service (`POSTGRES_PASSWORD=password`, `POSTGRES_DB=home_test`, health-checked with `pg_isready`, port 5432).
  - Steps: checkout; `pnpm/action-setup@v4`; `actions/setup-node@v4` (Node 22, pnpm cache); `pnpm install --frozen-lockfile`; `pnpm --filter @home/protocols build`; `pnpm test`.
  - Env: `DATABASE_URL_TEST=postgresql://postgres:password@localhost:5432/home_test` and `DATABASE_URL` set to the same value.
  - The job name `test` is the check the deployer waits on. It reads all check runs, so the exact name doesn't matter.
- [ ] **Step 2: Verify locally that the suite passes the way CI runs it.** Run `pnpm install --frozen-lockfile; pnpm --filter @home/protocols build; pnpm test`. Expected: all packages pass.
  - Any test that only passes on Windows (for example `tasklist` in `go2rtc/process-image.ts`) gets `it.skipIf(process.platform !== "win32")`, plus a one-line comment explaining why. Run `pnpm test` again.
- [ ] **Step 3: Commit** `ci: run tests on GitHub Actions`. The workflow is verified for real on the first push to the private repo (Task 12, Step 4).

### Task 2: Deployer package, config and redaction

**Files:**
- Create: `apps/deployer/package.json` (`@home/deployer`, `type: module`; scripts `build: tsc -p tsconfig.json`, `test: vitest run`; deps `pg`; devDeps `@types/node@^22`, `@types/pg`, `typescript`, `vitest` matching the other packages)
- Create: `apps/deployer/tsconfig.json` (extends base, `rootDir: src`, `outDir: dist`), `apps/deployer/vitest.config.ts` (`include: ["test/**/*.test.ts"]`)
- Create: `apps/deployer/src/config.ts`, `apps/deployer/src/redact.ts`
- Test: `apps/deployer/test/config.test.ts`, `apps/deployer/test/redact.test.ts`
- Modify: root `package.json` `build` script: add `pnpm --filter @home/deployer build` (only CI and the setup script need it)

**Interfaces:**
- Produces:
  ```ts
  // config.ts
  export interface DeployerConfig {
    root: string;                 // e.g. C:\HomeControl
    githubRepo: string;           // "owner/name"
    branch: string;               // "main"
    tokenFile: string;            // GitHub fine-grained PAT
    apiTokenFile: string;         // helper API bearer token
    apiPort: number;              // 4100
    serviceName: string;          // "HomeControl"
    pollMs: number;               // 120_000
    ciTimeoutMs: number;          // 1_800_000
    keepReleases: number;         // 5
    keepBackups: number;          // 10
    maxEvents: number;            // 50
    healthTimeoutMs: number;      // 60_000
    bin: { node: string; pnpm: string; git: string; nssm: string; pgDump: string; powershell: string; tar: string };
    installedDeployerTree: string; // git tree hash of apps/deployer at install time
  }
  export interface Paths { repo: string; releases: string; current: string; shared: string; envFile: string; logs: string; toolsCache: string; pnpmStore: string; data: string; eventLogs: string; backups: string; history: string }
  export function loadConfig(file: string): DeployerConfig;  // defaults for every numeric field; throws naming missing keys
  export function pathsFor(root: string): Paths;               // root\repo, root\releases, root\current, root\shared\{.env,logs,tools-cache,pnpm-store}, root\deployer\{logs,backups,history.json}
  export function readAppEnv(envFile: string): Record<string, string>; // node:util parseEnv
  // redact.ts
  export function makeRedactor(secrets: string[]): (line: string) => string;
  ```

- [ ] **Step 1: Write failing tests.**
  - `config.test.ts`:
    - `fills defaults`: a minimal JSON with `root`, `githubRepo`, `tokenFile`, `apiTokenFile`, `bin`, `installedDeployerTree` gives `pollMs 120000`, `ciTimeoutMs 1800000`, `keepReleases 5`, `keepBackups 10`, `maxEvents 50`, `apiPort 4100`, `branch "main"`, `serviceName "HomeControl"`.
    - `names missing keys`: throws a message containing `githubRepo`.
    - `pathsFor`: `pathsFor("C:\\H").current` equals `C:\H\current` (use `path.win32` joins).
  - `redact.test.ts`, `redacts tokens and postgres passwords`:
    - `makeRedactor(["s3cret"])("x s3cret y")` → `"x *** y"`.
    - `github_pat_ABC123_xyz` and `ghp_abcdEFGH1234` → `***`.
    - `postgresql://postgres:pw@localhost:5432/home` → `postgresql://postgres:***@localhost:5432/home`.
    - `Authorization: Basic abc==` → `Authorization: ***`.
    - Empty strings and secrets shorter than 4 characters in the list are ignored, so `"a"` doesn't blank every `a`.
- [ ] **Step 2: Run** `pnpm --filter @home/deployer test`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement `config.ts` and `redact.ts`.** The redactor escapes the literal secrets and applies the fixed patterns: `github_pat_\w+`, `gh[pousr]_\w+`, `(postgres(?:ql)?://[^:/\s]+:)[^@\s]+@`, `(Authorization:\s*)\S.*`.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): package, config and log redaction`.

### Task 3: History store and event logs

**Files:**
- Create: `apps/deployer/src/history.ts`, `apps/deployer/src/event-log.ts`
- Test: `apps/deployer/test/history.test.ts`, `apps/deployer/test/event-log.test.ts`

**Interfaces:**
- Consumes: `makeRedactor` (Task 2).
- Produces:
  ```ts
  export type EventKind = "DEPLOY" | "ROLLBACK" | "RESTART" | "PAUSE" | "RESUME";
  export type EventStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  export interface DeployEvent { id: string; kind: EventKind; status: EventStatus; sha?: string; message?: string; by: string; startedAt: string; finishedAt?: string; detail?: string }
  export interface DeployerState {
    running?: { sha: string; message: string; deployedAt: string };
    autoDeploy: { on: boolean; reason?: string };
    lastCheck?: { at: string; error?: string };
    failedShas: string[];      // never auto-retried
    skippedShas: string[];     // already recorded as SKIPPED (no duplicate events)
    releases: string[];        // full SHAs of kept successful releases, newest first
  }
  export class History {
    constructor(file: string, logsDir: string, maxEvents: number, now: () => Date);
    state(): DeployerState;
    update(patch: Partial<DeployerState>): void;
    events(): DeployEvent[];                                  // newest first
    start(e: Omit<DeployEvent, "id" | "startedAt" | "status">): DeployEvent; // status RUNNING; id = timestamp + random suffix
    finish(id: string, status: Exclude<EventStatus, "RUNNING">, detail?: string): void;
    record(e: Omit<DeployEvent, "id" | "startedAt" | "finishedAt">): DeployEvent; // instant events (pause, skip)
  }
  export class EventLog {
    constructor(file: string, redact: (s: string) => string);
    section(title: string): void;   // writes "▶ <title>"
    line(text: string): void;       // redacted, one line per call (splits on \n)
    ok(title: string, ms: number): void;   // "✔ <title> (12s)"
    fail(title: string, why: string): void; // "✖ <title>: <why>"
  }
  export function readLog(logsDir: string, id: string, maxLines?: number): string | undefined; // last 2000 lines by default
  ```

- [ ] **Step 1: Write failing tests** (temp directory per test):
  - `persists state and events across instances`.
  - `keeps the newest maxEvents and deletes dropped logs`: with `maxEvents 3`, record 4 events, each with a log file. Only 3 remain, and the oldest log file is gone.
  - `writes atomically`: after `update`, no `*.tmp` is left and the JSON parses.
  - `defaults`: a fresh file gives `autoDeploy.on === true`, `failedShas []`, `releases []`.
  - `event-log redacts`: `line("token s3cret")` with secret `s3cret` writes `token ***`. `readLog` returns the file, and with `maxLines 2` only the last 2 lines.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Write JSON to `history.json.tmp`, then `renameSync`. Logs live at `<logsDir>/<id>.log`, opened with `appendFileSync` (low volume, keeps it simple).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): history and per-event logs`.

### Task 4: GitHub client and the commit-picking rule

**Files:**
- Create: `apps/deployer/src/github.ts`, `apps/deployer/src/pick-commit.ts`
- Test: `apps/deployer/test/github.test.ts`, `apps/deployer/test/pick-commit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CheckState = "pending" | "success" | "failure" | "none";
  export interface Commit { sha: string; message: string; committedAt: string } // message = first line
  export class GitHubError extends Error { constructor(message: string, readonly status?: number) }
  export class GitHub {
    constructor(repo: string, token: string, fetchImpl?: typeof fetch);
    head(branch: string): Promise<Commit>;
    commitsSince(base: string | undefined, head: string): Promise<Commit[]>; // newest first, excludes base; base undefined → just [head commit]
    checkState(sha: string): Promise<CheckState>;
    treeSha(sha: string, path: string): Promise<string | undefined>; // for "helper update available"
  }
  export type Pick =
    | { action: "deploy"; commit: Commit; skip: SkipNote[] }
    | { action: "wait"; skip: SkipNote[] }
    | { action: "none"; skip: SkipNote[] };
  export interface SkipNote { commit: Commit; reason: "tests failed" | "no test result" }
  export function pickCommit(input: { commits: Commit[]; states: Record<string, CheckState>; failed: string[]; now: Date; ciTimeoutMs: number }): Pick;
  ```
  - GitHub endpoints: `GET /repos/{repo}/commits/{branch}`, `GET /repos/{repo}/compare/{base}...{head}`, `GET /repos/{repo}/commits/{sha}/check-runs`, and for `treeSha`: `GET /repos/{repo}/contents/{dir parent}?ref={sha}` and read the `sha` of the `{path}` entry (type `dir`). Headers: `Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: home-deployer`.
  - `checkState`: no runs → `none`; any run not `completed` → `pending`; any conclusion outside `success | skipped | neutral` → `failure`; otherwise `success`.
  - A 401 or 403 throws `GitHubError("GitHub token expired or invalid", status)`. Other non-2xx responses throw `GitHubError("GitHub answered <status>", status)`. Network errors throw `GitHubError("Can't reach GitHub")`. Messages never include the token.

- [ ] **Step 1: Write failing tests.**
  - `github.test.ts` with a fake `fetch`:
    - `maps check runs` covers all four states.
    - `sends the token as bearer`.
    - `401 → token message`.
    - `compare returns newest first and drops the base`.
  - `pick-commit.test.ts` (C newest, B, then A as base, not in the list):
    - `deploys the newest green`: C success → deploy C.
    - `waits while the head is pending`: C pending, committed 5 min ago → `wait`.
    - `red head falls back to older green`: C failure, B success → deploy B, with skip `[C tests failed]`.
    - `head pending past 30 min counts as no result`: C pending, committed 31 min ago, B success → deploy B, skip `[C no test result]`. `none` behaves the same as pending-past-timeout once older than 30 min; while younger, `wait`.
    - `never auto-picks a failed sha`: C success but in `failed`, B success → deploy B, with no skip note for C.
    - `nothing new`: empty commits → `none`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `pickCommit` walks newest to oldest:
  - a sha in `failed` → skip it silently
  - `success` → deploy
  - `pending` or `none` younger than the timeout → `wait`, stop
  - `pending` or `none` older than the timeout → skip note "no test result"
  - `failure` → skip note "tests failed"
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): GitHub checks and commit selection`.

### Task 5: Migrations rule and database backups

**Files:**
- Create: `apps/deployer/src/migrations.ts`, `apps/deployer/src/backup.ts`
- Test: `apps/deployer/test/migrations.test.ts`, `apps/deployer/test/backup.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function releaseMigrations(releaseDir: string): string[]; // dir names under apps/server/prisma/migrations (exclude migration_lock.toml)
  export function readAppliedMigrations(databaseUrl: string): Promise<string[]>; // SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  export function pendingMigrations(applied: string[], release: string[]): string[];
  export function rollbackBlockedReason(applied: string[], release: string[]): string | undefined; // the exact refusal message when any applied is missing from release
  export const ROLLBACK_BLOCKED = "Can't roll back past a database change; push a fix instead.";
  export function backupDatabase(sys: Pick<System, "run">, opts: { pgDump: string; databaseUrl: string; dir: string; keep: number; now: Date; log: EventLog }): Promise<string>; // returns file path
  ```
  (`System` comes from Task 6. Define the `run` signature here exactly as Task 6 states it, or do Task 6 first. Order is free.)

- [ ] **Step 1: Write failing tests.**
  - `rollbackBlockedReason`: applied `[a,b]` with release `[a,b,c]` → `undefined`; applied `[a,b,c]` with release `[a,b]` → `ROLLBACK_BLOCKED`.
  - `pendingMigrations`: `[a]` vs `[a,b]` → `[b]`.
  - `releaseMigrations` on a temp tree.
  - `readAppliedMigrations` against `DATABASE_URL_TEST`, after Prisma migrations are applied (reuse the server's migrations folder: run `prisma migrate deploy` in `globalSetup`, the same way the server does). Expected: it includes `20261106024258_init`.
  - `backup.test.ts`, with a fake `run`:
    - it calls `pgDump` with `["--format=custom", "--file", <dir>/home-<yyyymmdd-hhmmss>.dump, "--dbname", <url without password>]` and env `PGPASSWORD=<password>`; the args never contain the password.
    - with 11 existing files and `keep 10`, only the newest 10 remain after the call.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** For `pg_dump`, pass `--dbname` built from the URL without its password, and the password through `PGPASSWORD`, so the password never appears in a command line or log.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): migration rule and backups`.

### Task 6: System adapter and release folders

**Files:**
- Create: `apps/deployer/src/system.ts`, `apps/deployer/src/releases.ts`
- Create: `apps/deployer/test/fakes.ts` (`FakeSystem` that records calls and can be told to fail a given step)
- Test: `apps/deployer/test/releases.test.ts`, `apps/deployer/test/system.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RunOptions { cwd?: string; env?: Record<string, string>; onLine?: (line: string) => void; timeoutMs?: number }
  export interface System {
    run(cmd: string, args: string[], opts?: RunOptions): Promise<void>;   // rejects with Error("<cmd basename> exited <code>") on non-zero
    serviceStop(name: string): Promise<void>;     // nssm stop, then wait for Stopped (30 s)
    serviceStart(name: string): Promise<void>;
    serviceRestart(name: string): Promise<void>;
    serviceStatus(name: string): Promise<"running" | "stopped" | "missing">;
    healthy(url: string, timeoutMs: number): Promise<boolean>;  // polls every 1 s until 2xx or timeout
  }
  export function realSystem(bin: DeployerConfig["bin"]): System;
  // releases.ts
  export function releaseDir(paths: Paths, sha: string): string;           // releases\<short sha>
  export function currentTarget(paths: Paths): string | undefined;        // readlinkSync of the junction, or undefined
  export function switchCurrent(paths: Paths, sha: string): void;          // rmdir junction (link only) then symlinkSync(dir, current, "junction")
  export function pruneReleases(paths: Paths, keepShas: string[]): void;  // deletes release dirs not in keepShas (never the current target)
  ```
  - `realSystem.run` uses `spawn` without a shell. stdout and stderr go line by line to `onLine`. `windowsHide: true`.

- [ ] **Step 1: Write failing tests.**
  - `releases.test.ts` (temp dir; junctions work without admin):
    - `switchCurrent` twice → `currentTarget` points at the second release, and the first release dir still exists.
    - `pruneReleases` keeps the listed releases and the current one.
  - `system.test.ts`:
    - `run` streams lines from `process.execPath -e "console.log('a');console.log('b')"` → `["a","b"]`.
    - `run` rejects on `process.exit(3)` with `exited 3`.
    - `healthy` is true against a local http server answering 200, and false within the timeout against a closed port, with `timeoutMs 1500`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The NSSM service methods call `bin.nssm` (`stop`/`start`/`restart`/`status`). `status` output `SERVICE_RUNNING` → running; an error containing "does not exist" → missing.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): system adapter and release folders`.

### Task 7: Per-release PowerShell scripts

**Files:**
- Create: `scripts/apply-service-settings.ps1`, `scripts/install-helpers.ps1`, `scripts/protect-release.ps1`
- Modify: `scripts/lib/helpers-download.ps1` (cache support), `scripts/install-service.ps1` (move its `$settings` block into a shared function and refuse when `HomeDeployer` exists)
- Create: `scripts/lib/service-settings.ps1`

**Interfaces:**
- Produces (the CLI that Task 8 calls, and the deployer runs from the **release's** copy):
  - `powershell -NoProfile -ExecutionPolicy Bypass -File <release>\scripts\apply-service-settings.ps1 -Service HomeControl -Root <root> -Node <node.exe>`
    - Installs the service if missing.
    - `Application <node>`, `AppParameters apps/server/dist/main.js`, `AppDirectory <root>\current`, `ObjectName NT AUTHORITY\LocalService`.
    - `AppEnvironmentExtra` (multi-value): `NODE_ENV=production`, `DOTENV_CONFIG_PATH=<root>\shared\.env`, `GO2RTC_PATH=<root>\current\tools\go2rtc\go2rtc.exe`, `FFMPEG_PATH=<root>\current\tools\ffmpeg\ffmpeg.exe`.
    - Logs in `<root>\shared\logs`. The other values (start mode, restart delay 5000, rotation, stop 15000, `DependOnService` Postgres) are the same as today's `install-service.ps1`.
  - `... install-helpers.ps1 -Target <release>\tools -Cache <root>\shared\tools-cache`: copies from the cache when the SHA matches, and downloads into the cache otherwise.
  - `... protect-release.ps1 -Path <dir>`: `Protect-RepoDirectory` (admins/SYSTEM full, LocalService RX).
  - `scripts/lib/service-settings.ps1` exports `Get-HomeControlServiceSettings([string]$AppDirectory, [string]$LogsDir, [string[]]$Environment)`, used by both `install-service.ps1` and `apply-service-settings.ps1`, so the two can't drift.
- Server change: `apps/server/prisma.config.ts` also loads `process.env.DOTENV_CONFIG_PATH` when set (first in the `path` list). `dotenv/config` in `main.ts` already honours it.

- [ ] **Step 1: Run** `.\scripts\install-service.ps1 -DryRun` before the change and save the output, as the baseline for Step 4.
- [ ] **Step 2: Implement the scripts.** Each supports `-DryRun` like the existing ones.
- [ ] **Step 3: Verify the dry runs.**
  - `.\scripts\apply-service-settings.ps1 -Service HomeControl -Root C:\HomeControl -Node (Get-Command node).Source -DryRun` prints each `nssm set`, including the four environment lines and `AppDirectory = C:\HomeControl\current`.
  - `.\scripts\install-helpers.ps1 -Target $env:TEMP\t\tools -Cache $env:TEMP\t\cache -DryRun` prints both helpers.
- [ ] **Step 4: Verify `install-service.ps1 -DryRun`** prints the same settings as the Step 1 baseline, now built by the shared function. With a fake `HomeDeployer` check (temporarily stub `Get-Service`), it throws `HomeDeployer is installed: deploy from the Deploys page, or stop HomeDeployer first (see docs\RUNNING.md).`
- [ ] **Step 5: Add a server config test** in `apps/server/test/config.test.ts` (or a new `prisma-config.test.ts`) only if `prisma.config.ts` logic is non-trivial. Otherwise check it by hand: `$env:DOTENV_CONFIG_PATH='<some .env>'; pnpm --filter @home/server exec prisma migrate status` reads that file.
- [ ] **Step 6: Commit** `feat(scripts): per-release service settings, helper cache, release lock-down`.

### Task 8: Deploy, rollback, restart and recovery operations

**Files:**
- Create: `apps/deployer/src/deploy.ts`, `apps/deployer/src/rollback.ts`, `apps/deployer/src/recover.ts`
- Test: `apps/deployer/test/deploy.test.ts`, `apps/deployer/test/rollback.test.ts`, `apps/deployer/test/recover.test.ts`

**Interfaces:**
- Consumes: Tasks 2–7.
- Produces:
  ```ts
  export interface OpContext {
    config: DeployerConfig; paths: Paths; sys: System; history: History;
    migrations: { applied(): Promise<string[]> };          // wraps readAppliedMigrations(databaseUrl)
    backup(log: EventLog): Promise<string>;
    appEnv(): Record<string, string>;                      // readAppEnv(paths.envFile)
    gitAuthArgs(): string[];                               // ["-c", "http.extraHeader=Authorization: Basic <base64 x-access-token:TOKEN>"]
    now(): Date;
  }
  export function deployCommit(ctx: OpContext, commit: Commit, by: string): Promise<DeployEvent>;
  export function rollbackTo(ctx: OpContext, sha: string, by: string): Promise<DeployEvent>;
  export function restartApp(ctx: OpContext, by: string): Promise<DeployEvent>;
  export function recoverOnStart(ctx: OpContext): Promise<void>;
  ```
- Deploy steps (each one is a `log.section`; any throw before "Stop app" deletes the half-built release and finishes FAILED):
  1. `Fetch`: `git <auth> -C repo fetch origin <branch>`
  2. `Export`: `git -C repo archive -o <tmp>.tar <sha>`, then `tar -xf <tmp>.tar -C releases\<short>`. Delete any existing folder of that name first, unless it is current.
  3. `Helpers`: `install-helpers.ps1` from the release.
  4. `Install`: `pnpm install --frozen-lockfile --config.package-import-method=copy --store-dir <pnpmStore>` (cwd release)
  5. `Build`: `pnpm build` (cwd release)
  6. `Lock down`: `protect-release.ps1 -Path <release>`
  7. `Backup`: only if `pendingMigrations(applied, releaseMigrations(release))` is non-empty
  8. `Stop app`
  9. `Migrate`: `pnpm --filter @home/server exec prisma migrate deploy` (cwd release, env `DATABASE_URL` from `appEnv()`). On failure: switch nothing, start the old release, FAILED "migration failed; still running <old short>".
  10. `Switch`: `switchCurrent`, then `apply-service-settings.ps1` from the **new** release
  11. `Start app`, then `Health`, using `PORT` from `appEnv()` (default 4000)
  12. Health OK → update `running`, prepend to `releases` (cap `keepReleases`), prune releases, SUCCEEDED.
  13. Health fails, no migration pending in step 7 → switch back to the old release, apply its settings, start it, FAILED "didn't come up; rolled back automatically to <old short>".
  14. Health fails after migrations → leave it. FAILED "app didn't come up after a database change; push a fix". Auto-deploy unchanged.
  - Every FAILED deploy adds its sha to `failedShas`.
- Rollback:
  - refuses (throws `OpError`, see Task 9) unless `sha` is in `state.releases` and isn't the running one, and `rollbackBlockedReason(applied, releaseMigrations(dir))` is `undefined`
  - then: stop, switch, apply settings from the target release, start, health
  - on success: `running` = target, auto-deploy off with reason `rolled back to <short>`
  - on failure: switch back to the previous release and FAILED
- Restart: `serviceRestart`, then health. SUCCEEDED or FAILED "app didn't come up after restart".
- Recover: any RUNNING event → FAILED "helper stopped during this". If `currentTarget` exists and the service is `stopped` → start it.

- [ ] **Step 1: Write failing tests** with `FakeSystem` and a temp root (`FakeSystem.run` fakes `git archive`/`tar` by creating the release dir with a `apps/server/prisma/migrations/<names>` tree from the test):
  - `deploys in order`: the call sequence equals fetch, archive, tar, helpers, install, build, protect, stop, migrate, switch-settings, start. The health URL is `http://127.0.0.1:4000/`. The event is SUCCEEDED and `state.running.sha` is the commit.
  - `backs up only when migrations are pending`.
  - `build failure keeps the old version`: no stop call, the release dir is removed, FAILED, and the sha is in `failedShas`.
  - `health failure without migration rolls back automatically`: current is the old release again, and the old release's settings script ran.
  - `health failure after migration leaves it`: current = new, `autoDeploy.on` unchanged, detail mentions "push a fix".
  - `migration failure restarts the old release`.
  - `rollback blocked across a database change`: rejects with `ROLLBACK_BLOCKED`, and no service calls happen.
  - `rollback pauses auto-deploy`: reason `rolled back to abc1234`.
  - `rollback refuses an unknown sha`.
  - `recovers an interrupted deploy` (Review Focus 1).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep each step a small function in `deploy.ts`. If the file grows past ~200 lines, split steps into `deploy-steps.ts`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): deploy, rollback, restart and recovery`.

### Task 9: Deployer core, HTTP API and entry point

**Files:**
- Create: `apps/deployer/src/deployer.ts`, `apps/deployer/src/api.ts`, `apps/deployer/src/main.ts`
- Test: `apps/deployer/test/deployer.test.ts`, `apps/deployer/test/api.test.ts`

**Interfaces:**
- Produces (the HTTP contract Task 10 consumes):
  ```ts
  export class OpError extends Error { constructor(message: string, readonly status: 400 | 404 | 409) }
  export type Command = { type: "deployNow" | "restartApp" | "pause" | "resume"; by: string } | { type: "rollback"; sha: string; by: string };
  export interface StatusView {
    running?: { sha: string; message: string; deployedAt: string };
    autoDeploy: { on: boolean; reason?: string };
    lastCheck?: { at: string; error?: string };
    busy?: string;                       // e.g. "Deploying abc1234"
    helperUpdateAvailable: boolean;
    events: (DeployEvent & { canRollback: boolean; rollbackBlockedReason?: string })[];
  }
  export class Deployer {
    constructor(ctx: OpContext, github: Pick<GitHub, "head" | "commitsSince" | "checkState" | "treeSha">);
    start(): void; stop(): Promise<void>;   // timer every pollMs; first tick 10 s after start
    tick(): Promise<void>;                  // skips when paused or busy
    command(c: Command): Promise<{ eventId: string }>; // validates synchronously, runs the operation in the background; 409 when busy
    status(): Promise<StatusView>;          // canRollback computed per kept release (applied migrations cached 10 s)
  }
  ```
  - HTTP (all need `Authorization: Bearer <apiToken>`, otherwise 401; JSON bodies; body limit 10 KB):
    - `GET /status` → `StatusView`
    - `GET /events/:id/log` → `{ log: string }` or 404
    - `POST /commands` with body `Command` → `202 { eventId }`. `OpError` → its status with `{ error: message }`. Unknown `type`, or a missing or non-string `by`/`sha` → 400.
  - `deployNow`: picks with `pickCommit`, passing `failed: []` (an explicit retry is allowed), and deploys the newest green commit. If nothing is green → 400 "No green commit to deploy". If it's the running sha → 400 "Already running <short>".
  - `pause`/`resume` record PAUSE/RESUME events. Pause stores reason `paused by <by>`.
  - `tick`: sets `lastCheck` (an error message from `GitHubError` goes in `lastCheck.error`), records SKIPPED events once per sha (via `skippedShas`), and on `deploy` runs `deployCommit(..., "auto")`.
  - `helperUpdateAvailable` = `treeSha(headSha, "apps/deployer") !== config.installedDeployerTree`, checked once per tick.
  - `main.ts`: `loadConfig(process.argv[2] ?? "<root>\\deployer\\deployer.json")`, reads both token files, builds `realSystem`, runs `recoverOnStart`, starts `Deployer` and the API, and on SIGINT/SIGTERM stops both. It never stops mid-operation: it waits for the current operation, up to 10 min.

- [ ] **Step 1: Write failing tests.**
  - `deployer.test.ts`, with a fake GitHub and stubbed ops (inject `deployCommit`/`rollbackTo`/`restartApp` via an optional `ops` constructor argument):
    - `tick deploys the picked commit as auto`.
    - `tick does nothing while paused`.
    - `records a failed check and keeps polling` (Review Focus 2): `head` throws a 401 `GitHubError`; `lastCheck.error === "GitHub token expired or invalid"`; the next tick calls `head` again.
    - `records each skip once`.
    - `busy refuses a second command with 409`.
    - `deployNow retries a failed sha`.
    - `deployNow while paused stays paused`.
    - `status marks rollback-blocked releases`.
  - `api.test.ts`, on an ephemeral port:
    - 401 without a token
    - 400 for `{type:"rm -rf"}`
    - 202 and an `eventId` for `pause`
    - `/events/x/log` → 404
    - the server listens on `127.0.0.1` only (`server.address().address === "127.0.0.1"`)
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @home/deployer test; pnpm --filter @home/deployer build`. Expected: all pass, and `dist/main.js` exists.
- [ ] **Step 5: Commit** `feat(deployer): scheduler, command API and entry point`.

### Task 10: The app server talks to the helper

**Files:**
- Create: `apps/server/src/deployer/client.ts`, `apps/server/src/graphql/resolvers/deploys.ts`
- Create: `apps/server/test/fakes/fake-deployer.ts` (in-process HTTP server implementing Task 9's contract with canned data)
- Modify: `apps/server/src/graphql/schema.graphql`, `apps/server/src/graphql/resolvers/index.ts`, `apps/server/src/services/deps.ts` (`deployer: DeployerClient`), `apps/server/src/config.ts` (`DEPLOYER_URL` default `http://127.0.0.1:4100`, `DEPLOYER_TOKEN_FILE` default `<repo root>\..\deployer\api-token`, i.e. `<root>\deployer\api-token` when running from `<root>\current`), `apps/server/src/main.ts`, `apps/server/test/api-harness.ts` (`deployer?: DeployerClient` option, default: unavailable)
- Test: `apps/server/test/api-deploys.test.ts`, `apps/server/test/deployer-client.test.ts`

**Interfaces:**
- Consumes: the HTTP contract (Task 9).
- Produces (GraphQL, which Task 11 consumes):
  ```graphql
  enum DeployEventKind { DEPLOY ROLLBACK RESTART PAUSE RESUME }
  enum DeployEventStatus { RUNNING SUCCEEDED FAILED SKIPPED }
  type DeployEvent { id: ID!  kind: DeployEventKind!  status: DeployEventStatus!  sha: String  message: String  by: String!  startedAt: String!  finishedAt: String  detail: String  canRollback: Boolean!  rollbackBlockedReason: String }
  type DeployRunning { sha: String!  message: String!  deployedAt: String! }
  type DeployStatus { available: Boolean!  running: DeployRunning  autoDeploy: Boolean!  pausedReason: String  lastCheckAt: String  lastCheckError: String  busy: String  helperUpdateAvailable: Boolean!  events: [DeployEvent!]! } # available false → every other field empty/default
  # Query
  deployStatus: DeployStatus!          # admin
  deployLog(eventId: ID!): String      # admin; null when the event has no log
  # Mutation (each returns the new event id; admin)
  deployNow: ID!
  restartApp: ID!
  pauseAutoDeploy: ID!
  resumeAutoDeploy: ID!
  rollbackDeploy(sha: String!): ID!
  ```
  ```ts
  export interface DeployerClient { status(): Promise<StatusView | undefined>; log(id: string): Promise<string | undefined>; command(c: Command): Promise<string> }
  export function httpDeployerClient(url: string, tokenFile: string, fetchImpl?: typeof fetch): DeployerClient;
  ```
  - `status()` returns `undefined` on network errors, 401, or a missing token file, which maps to `available: false`. The token file is re-read on each call, so the helper can rotate it.
  - Command errors: 409 → `coded("CONFLICT", msg)`, 400 → `badInput(msg)`, 404 → `notFound("Deploy event")`, helper down → `coded("UNAVAILABLE", "The deploy helper isn't running")`.
  - `by` = `requireAdmin(ctx).name`.

- [ ] **Step 1: Write failing tests.**
  - `api-deploys.test.ts`:
    - `forbids users and guests` (each query and mutation → `FORBIDDEN`)
    - `maps status for admins`
    - `reports unavailable when the helper is down` (Review Focus 3): the harness default; `available false`; `events []`
    - `passes the admin name as by`
    - `maps busy to CONFLICT`
    - `rollbackDeploy forwards the sha`
  - `deployer-client.test.ts`: the bearer token is read from the file; a missing file → `undefined`.
- [ ] **Step 2: Run** `pnpm --filter @home/server test -- api-deploys deployer-client`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema, client and resolvers, and wire `deployer` into deps in `main.ts`.
- [ ] **Step 4: Run** the same tests, then the whole server suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): admin GraphQL for the deploy helper`.

### Task 11: The Deploys page

**Files:**
- Create: `apps/web/src/admin/data/deployDocuments.ts`, `useDeployStatus.ts`, `useDeployCommands.ts`
- Create: `apps/web/src/admin/DeploysPage.tsx`, and under `apps/web/src/admin/deploys/`: `DeployTopBar.tsx`, `DeployEventList.tsx`, `DeployEventRow.tsx`, `DeployLogPanel.tsx`, `RollbackDialog.tsx`, `HelperUnavailable.tsx`, `deployLabels.ts`
- Modify: `apps/web/src/layout/nav/navItems.ts` (`{ to: '/admin/deploys', label: 'Deploys', Icon: RocketLaunchOutlinedIcon }` after Settings), `apps/web/src/AppRoutes.tsx` (`<Route path="deploys" element={<DeploysPage />} />`)
- Create: `apps/web/src/test/deployFixtures.ts`
- Test: `apps/web/src/admin/DeploysPage.test.tsx`, `apps/web/src/admin/deploys/DeployEventRow.test.tsx`

**Interfaces:**
- Consumes: the GraphQL from Task 10.
- Produces:
  - `useDeployStatus()` returns `{ status, restarting, error, refetch }`.
    - Polls every 5 s, or every 2 s while `busy`.
    - `restarting` is true when a poll fails while the last good status had `busy`, or within 90 s of a command the page sent. While `restarting`, errors are not shown.
  - `useDeployLog(eventId, live)` polls the log every 2 s while `live` (the event is RUNNING or the page is restarting).
  - `deployLabels.ts`: `statusIcon(status)`, `eventTitle(event)` (for example "Deploy abc1234", "Rollback to abc1234", "Restart", "Auto-deploy paused"), `whoLabel(by)` ("auto" → "Auto").
- Layout (mockup option B):
  - Top bar: running short sha and message, "deployed <relative time>", the auto-deploy chip (on, or paused with the reason), "checked <relative time>" or the `lastCheckError` in warning colour, a "Helper update available" note, and the buttons.
  - Below that, a two-column grid (`md` and up: list 5/12, log 7/12; stacks on `xs`).
  - The list selects the RUNNING event by default, otherwise the newest.
  - Buttons:
    - **Deploy now**, **Restart app**, **Pause auto-deploy / Resume auto-deploy**. All are disabled while `busy` (tooltip shows `busy`).
    - **Restart app** asks for confirmation (`ConfirmDialog`).
    - **Roll back to this** appears in the row actions of each event where `canRollback`. Where `rollbackBlockedReason` is set, the button is shown disabled with that reason as its tooltip. It opens `RollbackDialog`: "Roll back to <short> — <message>? Auto-deploy will be paused."
  - `available: false` → `HelperUnavailable`: "The deploy helper isn't running on this computer." plus "See Deploying in docs/RUNNING.md."
  - Command errors show in a Snackbar with the error message.

- [ ] **Step 1: Write failing tests** (pattern: `createTestClient` with handlers, as in `RoomsPage.test.tsx`):
  - `shows the running version and auto-deploy state`.
  - `shows the helper notice when unavailable`.
  - `selecting an event shows its log`.
  - `deploy now sends the mutation and disables buttons while busy`.
  - `rollback asks first, then sends the sha`.
  - `blocked rollback is disabled with the reason`.
  - `shows restarting while the app is down mid-deploy` (Review Focus 4): the first status is `busy: "Deploying abc1234"`, the next poll errors → "Restarting…" is visible, no error is shown, and the next good poll clears it.
  - `DeployEventRow`: renders the title, the who, the duration from `startedAt`/`finishedAt`, and the skipped reason.
  - Add `/admin/deploys` to the existing nav test if `NavList.test.tsx` lists admin links.
- [ ] **Step 2: Run** `pnpm --filter @home/web test -- Deploy`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `PageSection`, `ConfirmDialog` and `QueryError` from `admin/common`, MUI `Grid`/`List`, and a monospace `pre` for the log (dark surface from the theme, `whiteSpace: pre-wrap`, auto-scroll to bottom while live).
- [ ] **Step 4: Run** `pnpm --filter @home/web test; pnpm --filter @home/web typecheck; pnpm --filter @home/web lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Deploys page`.

### Task 12: Setup script and docs

**Files:**
- Create: `scripts/install-deployer.ps1`
- Modify: `docs/RUNNING.md` (new section "Deploying automatically", and §3 notes), `.env.example` (comment that `DEPLOYER_URL`/`DEPLOYER_TOKEN_FILE` are optional), `README.md` (one line under "Running it for real")

**Interfaces:**
- `install-deployer.ps1 -Root C:\HomeControl -GitHubRepo owner/name [-From <existing install dir>] [-DryRun]`. Elevated; re-runnable. Each run:
  1. Creates the layout from `pathsFor`.
  2. Asks once for the GitHub token (`Read-Host -AsSecureString`) unless `deployer\github-token` exists.
  3. Clones into `repo\` with the token passed via `http.extraHeader` (never stored in the remote URL or git config).
  4. Generates `deployer\api-token` (32 random bytes, base64) if missing.
  5. Copies `.env` and `logs\` from `-From` into `shared\` if they aren't there yet.
  6. Resolves the absolute paths of node, pnpm, git, nssm, pg_dump (from the Postgres service's install path), powershell and tar.
  7. Writes `deployer\deployer.json`, including `installedDeployerTree` = `git -C repo rev-parse origin/main:apps/deployer`.
  8. `pnpm --filter @home/deployer deploy --prod deployer\app` from a fresh export of `origin/main`.
  9. Locks down ACLs: `deployer\` is admins/SYSTEM only, except `api-token`, which LocalService can also read; `shared\` uses the same rules as today's `.env` and `logs` (`Protect-EnvFile`, `Grant-LogsAccess`).
  10. Installs or updates the NSSM service `HomeDeployer` as LocalSystem (`node deployer\app\dist\main.js <root>\deployer\deployer.json`, auto start, logs to `deployer\service.*.log`), then starts it.
  - The first tick deploys the newest green commit. That deploy repoints `HomeControl` to `current`, so the old install keeps running until the switch.
- [ ] **Step 1: Implement**, reusing `scripts/lib/*`.
- [ ] **Step 2: Verify the dry run**: `.\scripts\install-deployer.ps1 -Root C:\HomeControl -GitHubRepo owner/name -From C:\home-control -DryRun` prints every step and changes nothing.
- [ ] **Step 3: Write the docs.** Cover:
  - creating the private repo and pushing
  - a fine-grained token (this repo only; Contents: read; Checks: read; Actions: read; Metadata: read; expiry, and what the page shows when it expires)
  - running setup
  - what the page shows
  - where the logs are when the app is down (`C:\HomeControl\deployer\logs\` and `service.*.log`)
  - restoring a backup (`pg_restore --clean --dbname ... <file>` with the app stopped)
  - updating the helper (re-run setup)
  - deploying without the helper (stop `HomeDeployer`, use `install-service.ps1` from a clone)
  - deleting the old install folder once the first auto-deploy succeeds
- [ ] **Step 4: End-to-end check on the server PC** (manual, with the owner):
  1. Push to the private repo. The CI run is green.
  2. Run setup. `Get-Service HomeDeployer, HomeControl` both show Running, and within about 2 min the Deploys page shows the first successful deploy.
  3. Push a trivial commit. It deploys by itself.
  4. Roll back to the previous release. The app comes back, and auto-deploy is paused with the reason.
  5. Press Resume. The newer commit deploys again.
- [ ] **Step 5: Commit** `feat(scripts): deploy helper setup, docs`.
