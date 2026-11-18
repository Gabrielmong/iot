# Tray icons for the server PC and HomeAgent PCs

Date: 2026-11-18

## Intent

The user wants a Windows tray icon on the server PC (192.168.0.100) and on every PC running HomeAgent, so the
everyday jobs can be done from the PC itself without opening the admin pages:

- **Server PC:** open the Home page (clicking the icon opens it straight away), restart the server, deploy the
  latest version ("update"), see whether it's healthy.
- **Agent PCs:** see the agent's version and connection, check for a newer agent and update to it, open Home.

## Goals

- One tray program for both cases: `HomeAgent.exe tray`, part of the existing Go agent (`apps/agent`).
- No admin rights or secrets in the tray. It runs as the signed-in user; everything privileged is done by the
  HomeAgent service (LocalSystem), which the tray asks over a local named pipe.
- No separate install or Startup entry: the service starts the tray in each signed-in session, and agent updates
  update the tray too.
- The server section appears only on the PC that runs the HomeDeployer service.

## Non-goals

- Power actions (sleep/shut down/restart this PC) from the tray. Windows already has them.
- Rollback, pause/resume auto-deploys, or deploy logs in the tray. The Deploys admin page keeps those; the tray
  links to it.
- macOS/Linux trays (the agent is Windows-only).
- A tray for the server without HomeAgent installed: the server PC gets HomeAgent like any other PC.

## Anti-goals

- The tray must never be able to make the service do something not listed below (the pipe protocol is a closed
  message set, like the WebSocket protocol).
- The tray must never block an agent update (a running tray holds `HomeAgent.exe` open; see Lifecycle).
- No second icon per session, and no icon left behind (a "ghost" icon) after the service stops.

## Constraints (from the code today)

- HomeAgent runs as a Windows service in session 0 and cannot show UI itself. It already starts the countdown
  prompt in the user's session with `WTSQueryUserToken` + `CreateProcessAsUser`
  (`internal/power/launch_windows.go`); the tray uses the same technique.
- The agent's state (`C:\ProgramData\HomeAgent\agent.json`: server URL, device id, token) is readable only by
  SYSTEM/Administrators, so the tray gets what it needs from the service, not from the file.
- The deployer already exposes `POST /commands` with `restartApp` and `deployNow`, and `GET /status`, on
  `127.0.0.1:4100`, authorised by a bearer token in `<root>\deployer\api-token` (the server reads it through
  `DEPLOYER_TOKEN_FILE`, set in `scripts/apply-service-settings.ps1`).
- Update offers are sent only in reply to `hello` (`apps/server/src/agent/hello.ts` `updateOffer`). "Check for
  updates" needs a new agent → server message.
- `update-helper` stops the service and copies the new exe over the installed one, retrying for 10 s.
- The agent avoids new dependencies; Win32 UI is hand-rolled through `golang.org/x/sys/windows` (`internal/prompt`).

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | `HomeAgent.exe tray`, started by the HomeAgent service in each user session, talking to it over a named pipe; on the server PC the service also talks to the deployer and the tray shows a Server section | One program, auto-updated with the agent; secrets stay in services. The server PC must have HomeAgent installed. |
| B | A separate Node tray shipped with the deployer (Run key) for the server, plus the Go tray for agents | Two tray programs to build and maintain; the deployer token problem has to be solved separately |
| C | Server tray only now, agent tray later | Less work now, but most of it would be redone for the agent tray |

The user picked A.

## Design

### What the user sees

Left-click opens Home in the default browser. Right-click opens the menu.

Agent PC:

```
HomeAgent 14 · Connected            (disabled; "Not connected — retrying" when offline)
──────────────
Open Home                           → <server>/
Open this PC in Home                → <server>/devices/<deviceId>
──────────────
Check for updates                   → "Up to date" / "Updating to 15…" notification
──────────────
Hide until next sign-in
```

Server PC (the same menu with a Server section added above the agent items):

```
Server · Running 94c48fc            (disabled; or "Deploying 1a2b3c4…", "Stopped", "Deployer not responding")
Open Home                           → <server>/
Open Deploys page                   → <server>/admin/deploys
Restart server…                     → confirm dialog → deployer restartApp
Deploy latest now…                  → confirm dialog → deployer deployNow
──────────────
HomeAgent 14 · Connected
Open this PC in Home
Check for updates
──────────────
Hide until next sign-in
```

Left-click opens the agent's server URL (on the server PC that is its own address, e.g. `http://192.168.0.100:4000/`).

- Tooltip: `Home — connected` / `Home — not connected` (plus `· server running` on the server PC).
- Icon: the agent's existing icon; a greyed-out version while the agent isn't connected (and on the server PC,
  while the server isn't running).
- Notifications (balloon/toast via `Shell_NotifyIcon` `NIF_INFO`): result of Check for updates; restart/deploy
  accepted or refused (with the deployer's error message); when a deploy started from the tray finishes or fails
  (the tray keeps polling status until the operation ends).
- Commands are recorded with `by: "<Windows user> on <PC name> (tray)"` so the Deploys page history shows where
  they came from.

### Lifecycle

- The service registers for session-change notifications (`SERVICE_ACCEPT_SESSIONCHANGE`). On start, and on
  logon, unlock or Remote Desktop connect, it makes sure each session with a signed-in user has exactly one tray,
  launched like the prompt (`CreateProcessAsUser`, `winsta0\default`, the user's environment). It tracks the
  process handle per session and relaunches a tray that exits unexpectedly (with backoff: at most 3 times in
  5 minutes).
- "Hide until next sign-in": the tray tells the service, which remembers that session and doesn't relaunch it
  until that session logs off.
- The tray exits by itself when the pipe closes (the service stopped). It removes its icon first (`NIM_DELETE`),
  so no ghost icon is left behind. That is also what frees `HomeAgent.exe` for `update-helper`. The service
  additionally ends its trays when it stops, so a hung tray can't block the copy.
- After an update the service starts again and launches the new tray build.
- A second `tray` started in the same session (for example by hand) exits straight away; a named mutex per session
  makes sure of that.
- Explorer restarts (`TaskbarCreated` message): the tray re-adds its icon.

### Tray ↔ service: named pipe

- Pipe `\\.\pipe\HomeAgent.tray`, created by the service. Security descriptor: SYSTEM full, `INTERACTIVE` read/write
  (signed-in desktop users); nobody else. The service checks the client's session id
  (`GetNamedPipeClientSessionId`) and treats it as the session the request is for.
- One JSON object per line, closed message set, versioned like the agent protocol (`v: 1`):
  - tray → service: `status.get`, `update.check`, `server.restart`, `server.deploy`, `tray.hide`
  - service → tray: `status` (pushed on every change and in reply to `status.get`), `result` (for a request id:
    ok / message)
- `status` holds: agent version, connected (bool), server URL, device id, and on the server PC a `server` object
  (`running` / `deploying <sha>` / `stopped` / `unreachable`, current sha, operation in progress). The service
  refreshes the deployer status every 5 s only while at least one tray is connected.
- Unknown or malformed messages are logged and ignored; the connection stays up.
- The pipe is a new package `internal/traypipe` (protocol and encode/decode, testable on any OS) with the Windows
  listener in `*_windows.go`.

### Server section (service side)

- Server PC detection: the `HomeDeployer` service exists. The service reads the `deployer.json` path from the
  HomeDeployer NSSM `AppParameters` (registry `HKLM\SYSTEM\CurrentControlSet\Services\HomeDeployer\Parameters`;
  note `AppDirectory` is `<root>\deployer\app`, not the root), and from it `root`, `apiPort` (default 4100) and
  `serviceName` (default `HomeControl`). If that fails it falls back to `C:\HomeControl`. Token:
  `<root>\deployer\api-token`; URL: `http://127.0.0.1:<apiPort>`.
- Server state shown in the menu, tooltip and icon (my call):
  - `deploying` / `restarting`: the deployer `/status` `busy` label is set (e.g. "Deploying abc1234").
  - `running <sha>`: the `serviceName` service is Running in the Service Control Manager **and** `GET
    <server>/api/identity` answers 200 within 3 s. The sha is the `/status` `running` field.
  - `not responding`: the service is Running but the probe fails (crash-looping or starting).
  - `stopped`: the service isn't Running.
  - `deployer not responding`: `/status` fails. The service state is still shown.
  No deployer or server changes are needed for this.
- `server.restart` → `POST /commands {type:"restartApp", by}`; `server.deploy` → `POST /commands {type:"deployNow", by}`.
  The deployer's own rules apply (for example a deploy already in progress is refused); its error text goes back
  to the tray as the `result` message.
- "Open Home" and "Open Deploys page" use the agent's server URL on the server PC too, not `localhost`. Login is
  a per-origin cookie, so mixing `localhost:4000` and `192.168.0.100:4000` would mean signing in twice.

### Check for updates (agent ↔ server)

- New agent → server message `update.check` (protocol v1, both `apps/agent/internal/protocol` and
  `apps/server/src/agent/protocol.ts`). The server replies with the existing `update` offer when a newer agent is
  published, else a new `update.none {version}` (the published version).
- The agent applies an `update` exactly as it does today (download, verify, swap). The tray shows
  "Updating to N…" and then disappears and comes back with the new version when the service restarts.
- When not connected, Check for updates answers "Not connected to Home" without trying.

### Install, uninstall, docs

- Install: nothing new to install; the service starts trays on its next start. Uninstall: stopping the service ends
  the trays; nothing else to remove (no Run key, no files).
- The server PC: install HomeAgent on it through the usual "adopt this PC" download (add a line to
  `docs/RUNNING.md`).
- `docs/HOME-AGENT.md`: describe the tray, the pipe, and that any signed-in user can use Restart/Deploy on the
  server PC.
- `apps/agent/README.md`: add the new packages to the layout table.

## Decisions made without the user (please check)

- Left-click opens Home on both kinds of PC; right-click opens the menu.
- "Open Home" on the server PC uses the agent's server URL, not `localhost`, so you only sign in once.
- Server health = the Service Control Manager state of HomeControl + a `/api/identity` probe + the deployer's busy label.
- Restart and Deploy ask for confirmation first (a Yes/No dialog).
- Any user signed into the server PC can restart/deploy from the tray (no PIN). The server PC is the user's own
  machine; the Deploys page records who did it.
- "Hide until next sign-in" rather than "Quit": the service would relaunch a quit tray anyway.
- Hand-rolled Win32 tray (`Shell_NotifyIconW`, `TrackPopupMenu`) with `x/sys/windows`, no new dependency.

## Left to the builder

- Exact icon artwork for the greyed state (derive from the existing `winres` icon).
- Notification wording.
- Status polling details as long as the deployer isn't polled when no tray is connected.
- Package split, following the repo's small-files rule: e.g. `internal/tray` (menu model, pure and tested),
  `internal/tray/win` (Win32), `internal/traypipe`, `internal/service/trays_windows.go` (session tracking/launch),
  `internal/deployerapi` (client).
