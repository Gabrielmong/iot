# Tray Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tray icon (`HomeAgent.exe tray`) on every HomeAgent PC: version and connection, open Home, check for updates. On the server PC it adds server status, Restart server and Deploy latest.

**Architecture:** The HomeAgent service (LocalSystem) starts one tray process per signed-in session (the same `CreateProcessAsUser` technique as the countdown prompt) and answers it over the named pipe `\\.\pipe\HomeAgent.tray`, a closed JSON-lines protocol. Everything privileged stays in the service: the agent ↔ server `update.check` round trip, and on the server PC the deployer's local API (`restartApp`, `deployNow`, `/status`), the HomeControl service state and an `/api/identity` probe. The tray itself is hand-rolled Win32 (`Shell_NotifyIconW`, `TrackPopupMenu`), so there's no new dependency.

**Tech Stack:** Go 1.26 + `golang.org/x/sys/windows` (apps/agent); TypeScript + `ws` + vitest (apps/server).

**Spec:** `docs/superpowers/specs/2026-11-18-tray-icons-design.md`

## Global Constraints

- No new Go dependencies (`apps/agent/go.mod` stays as is; `x/sys/windows/registry` and `svc/mgr` are already in `x/sys`). Win32 through `x/sys/windows` + `NewLazySystemDLL`, like `internal/prompt`.
- Windows-only code lives in `*_windows.go`. Everything else builds and is tested on any OS (`go test ./...` on the dev PC; `GOOS=windows go vet ./...`).
- Both pipe and agent protocol are **closed message sets**, versioned `"v":1`. Unknown or malformed messages are logged and ignored, and the connection stays up.
- Pipe name `\\.\pipe\HomeAgent.tray`; SDDL `D:P(A;;GA;;;SY)(A;;GRGW;;;IU)`; max line 64 KiB.
- Small files, one responsibility each (user rule: no big files or components).
- Menu copy (exact): `HomeAgent <n> · Connected`, `HomeAgent <n> · Not connected — retrying`, `Open Home`, `Open this PC in Home`, `Check for updates`, `Hide until next sign-in`, `Server · Running <sha7>`, `Server · <busy label>`, `Server · Not responding`, `Server · Stopped`, `Server · Deployer not responding`, `Open Deploys page`, `Restart server…`, `Deploy latest now…`.
- Tooltip: `Home — connected` / `Home — not connected`, plus ` · server running` / ` · server <state>` on the server PC.
- Every Home link uses the agent's server URL (never `localhost`): `<server>/`, `<server>/devices/<deviceId>`, `<server>/admin/deploys`.
- Deployer commands carry `by: "<Windows user> on <PC name> (tray)"`.
- Server status is polled every 5 s **only while at least one tray is connected**; the identity probe times out after 3 s.
- Tray relaunch backoff: at most 3 relaunches per session in 5 minutes.
- Commit after every task, ending the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on `main` (no worktrees).

## Review Focus

1. **Agent update while a tray is running.** The tray holds `HomeAgent.exe` open. When the pipe closes, the tray must remove its icon and exit at once, and the service must kill trays on stop, so that `update-helper`'s 10 s copy succeeds. Tested in Task 6 (client returns on EOF) and Task 5 (`StopAll` kills).
2. **Two signed-in sessions** (console plus Remote Desktop, or fast user switching). Each gets exactly one tray and Hide affects only its own session. Tested in Task 5 (`policy_test.go`).
3. **Deployer refuses** (409 "Busy: …", 401, down). The tray shows the deployer's own text, never a generic success. Tested in Task 3.
4. **Connection drops while a Check for updates is pending, or there's no answer.** The tray gets "Not connected to Home" or "Home didn't answer" instead of hanging. Tested in Task 4.
5. **Explorer restarts or a tray crash-loops.** The icon comes back (`TaskbarCreated`) and the service stops relaunching after 3 tries in 5 minutes. Backoff is tested in Task 5; `TaskbarCreated` is checked by hand in Task 8.

---

## File map

| File | Responsibility |
|---|---|
| `apps/server/src/agent/protocol.ts` (modify) | `update.check` in, `update.none` out |
| `apps/server/src/agent/agent-socket.ts` (modify) | reply to `update.check` |
| `apps/agent/internal/protocol/{protocol,outgoing}.go` (modify) | `UpdateCheck` out, `UpdateNone` in |
| `apps/agent/internal/client/{handler,conn}.go` (modify) | `OnConnected`, `OnUpdateNone` |
| `apps/agent/internal/traypipe/protocol.go` (new) | pipe message types, `Status`, line codec |
| `apps/agent/internal/traypipe/server_windows.go` (new) | named-pipe listener, client session id |
| `apps/agent/internal/traypipe/client_windows.go` (new) | tray-side pipe dial and read loop |
| `apps/agent/internal/serverpc/config.go` (new) | parse `deployer.json` and NSSM `AppParameters` |
| `apps/agent/internal/serverpc/deployer.go` (new) | deployer HTTP client (`/status`, `/commands`) |
| `apps/agent/internal/serverpc/state.go` (new) | derive the server state from SCM, probe and status |
| `apps/agent/internal/serverpc/detect_windows.go` (new) | registry and SCM reads |
| `apps/agent/internal/trayhub/hub.go` (new) | service side: status store, subscribers, request handling |
| `apps/agent/internal/trayhub/updatecheck.go` (new) | pending `update.check` with a timeout |
| `apps/agent/internal/trays/policy.go` (new) | which sessions need a tray; hide and backoff |
| `apps/agent/internal/trays/manager_windows.go` (new) | launch and watch tray processes |
| `apps/agent/internal/winsession/launch_windows.go` (new) | `LaunchAs` (moved out of `power`) |
| `apps/agent/internal/service/service_windows.go` (modify) | session-change events, wiring |
| `apps/agent/internal/tray/menu.go` (new) | the menu, tooltip and icon state for a `Status` |
| `apps/agent/internal/tray/watch.go` (new) | "deploy/restart finished" notifications |
| `apps/agent/internal/tray/win/*_windows.go` (new) | Win32 icon, menu, balloon, window loop |
| `apps/agent/cmd/homeagent/args.go`, `main_windows.go` (modify) | `tray` mode |
| `apps/agent/winres/` (modify) | `icon.png`, `icon-off.png`, `RT_GROUP_ICON` entries |
| `docs/HOME-AGENT.md`, `docs/RUNNING.md`, `apps/agent/README.md` (modify) | docs |

---

### Task 1: Server answers `update.check`

**Files:**
- Modify: `apps/server/src/agent/protocol.ts`, `apps/server/src/agent/agent-socket.ts`
- Test: `apps/server/test/agent-socket.test.ts`

**Interfaces:**
- Produces (wire): agent → server `{"v":1,"t":"update.check","version":<int>}`. Server → agent: the existing `update` offer when `updateOffer(agentDir, version)` returns one, otherwise `{"v":1,"t":"update.none","version":<published version, 0 when none>}`.

- [ ] **Step 1: Write the failing tests** in `agent-socket.test.ts`, using the file's existing `connect`, `send`, `pairedPc` and `agentDir` helpers:
  - `"answers update.check with an offer when a newer agent is published"`: `agentDir(1010)`, send `{t:"update.check",version:1007}`, and expect a message `{v:1,t:"update",version:1010,url:"/agent/HomeAgent.exe",sha256:"a".repeat(64)}`. Use the same `url` constant the hello offer uses.
  - `"answers update.check with update.none when up to date"`: `agentDir(1007)`, send version 1007, and expect `{v:1,t:"update.none",version:1007}`.
  - `"answers update.none with version 0 when nothing is published"`: no agentDir, so expect `{v:1,t:"update.none",version:0}`.
  - `"ignores update.check with a bad version"`: `version:"x"` gets no reply within 200 ms and the socket stays open.
- [ ] **Step 2: Run them and check they fail.** Run `pnpm --filter @home/server exec vitest run test/agent-socket.test.ts`. Expected: the 4 new tests FAIL.
- [ ] **Step 3: Implement.** In `protocol.ts`, add `{ t: "update.check"; version: number }` to `AgentMessage` (parse: non-negative integer `version`, else null) and `{ t: "update.none"; version: number }` to `ServerMessage`. In `agent-socket.ts`, `serve()` handles `update.check` (paired devices only): it sends `updateOffer(...) ?? { t: "update.none", version: readAgentInfo(agentDir)?.version ?? 0 }`. Export `readAgentInfo` from wherever `hello.ts` imports it, if it isn't exported already.
- [ ] **Step 4: Run the tests and check they pass.** Same command. Expected: all PASS.
- [ ] **Step 5: Commit** with the message `feat(server): agents can ask for an update`.

---

### Task 2: Agent protocol, client and handler for update checks and connection state

**Files:**
- Modify: `apps/agent/internal/protocol/protocol.go`, `outgoing.go`, `internal/client/handler.go`, `conn.go`, `internal/service/agent.go`
- Test: `internal/protocol/protocol_test.go`, `internal/client/conn_test.go`, `internal/service/agent_test.go`

**Interfaces:**
- Produces:
  - `protocol.UpdateCheck{Version int \`json:"version"\`}` (Outgoing, type `"update.check"`).
  - `protocol.UpdateNone{Version int \`json:"version"\`}` (Message, decoded from `"update.none"`).
  - `client.Handler` gains `OnConnected()` (called after `hello` was sent) and `OnUpdateNone(u protocol.UpdateNone)`.
  - `service.Agent` gains an optional field `Events AgentEvents`:
    ```go
    type AgentEvents interface {
        Connected(bool)
        UpdateOffered(version int)
        UpdateNone(version int)
    }
    ```
    `OnConnected` calls `Connected(true)`; `OnDisconnected` calls `Connected(false)`; `OnUpdate` calls `UpdateOffered(u.Version)` before it starts the download; `OnUpdateNone` calls `UpdateNone`. A nil `Events` is skipped.

- [ ] **Step 1: Write the failing tests.**
  - protocol: `TestEncodeUpdateCheck` checks that `Encode(UpdateCheck{Version: 14})` is `{"v":1,"t":"update.check","version":14}`. `TestDecodeUpdateNone` checks that `{"v":1,"t":"update.none","version":15}` decodes to `UpdateNone{15}`.
  - client: extend `recorder` with `OnConnected` (`"connected"`) and `OnUpdateNone` (`"update.none 15"`). The test checks that a session against the existing test server records `"connected"` before any message and `"disconnected"` after close, and that an `update.none` message is dispatched.
  - service: `TestAgentReportsEvents` uses a fake `AgentEvents` and checks `Connected(true)`, `Connected(false)`, `UpdateOffered(15)` and `UpdateNone(14)`.
- [ ] **Step 2: Run them and check they fail.** Run `cd apps/agent && go test ./internal/protocol ./internal/client ./internal/service`. Expected: compile errors or FAIL.
- [ ] **Step 3: Implement** the types, the `"update.none"` case in `Decode`, dispatch, `OnConnected` in `session()` right after the hello `Send` succeeds, and the `Agent` methods.
- [ ] **Step 4: Check it passes.** Run the same command, then `GOOS=windows go vet ./...`. Expected: PASS, no vet output.
- [ ] **Step 5: Commit** with the message `feat(agent): update.check / update.none and connection events`.

---

### Task 3: `serverpc`, the server-PC detection, deployer client and server state

**Files:**
- Create: `apps/agent/internal/serverpc/config.go`, `deployer.go`, `state.go`, `detect_windows.go`
- Test: `config_test.go`, `deployer_test.go`, `state_test.go`

**Interfaces:**
- Produces:
  ```go
  type Config struct { Root string; APIPort int; ServiceName string }        // defaults 4100, "HomeControl"
  func ConfigPathFromParams(appParameters string) (string, bool)            // 2nd token of "<main.js> <deployer.json>"
  func ParseConfig(raw []byte) (Config, error)                               // root required; defaults applied
  func (c Config) TokenFile() string                                         // <Root>\deployer\api-token
  func (c Config) URL() string                                               // http://127.0.0.1:<APIPort>

  type Deployer struct { URL, Token string; HTTP *http.Client }
  type DeployerStatus struct { RunningSha string; Busy string }              // from /status running.sha, busy
  func (d *Deployer) Status(ctx context.Context) (DeployerStatus, error)
  func (d *Deployer) Command(ctx context.Context, typ, by string) error      // typ: "restartApp" | "deployNow"; non-2xx → error whose text is the body's "error"

  type State string // "running" | "busy" | "not-responding" | "stopped" | "deployer-down"
  type Reading struct { ServiceRunning bool; ProbeOK bool; Status DeployerStatus; StatusErr error }
  func Derive(r Reading) (state State, label string, sha string)

  // windows
  func Detect() (Config, bool)          // HomeDeployer service exists → read AppParameters, deployer.json; fallback Root C:\HomeControl
  func ServiceRunning(name string) bool
  ```

- [ ] **Step 1: Write the failing tests.**
  - `ConfigPathFromParams(`C:\HomeControl\deployer\app\dist\main.js C:\HomeControl\deployer\deployer.json`)` gives `C:\HomeControl\deployer\deployer.json, true`; an empty string gives `false`.
  - `ParseConfig(`{"root":"C:\\HomeControl"}`)` gives `{Root:C:\HomeControl, APIPort:4100, ServiceName:"HomeControl"}`; with `apiPort: 4200, serviceName: "X"` the values are kept; missing root returns an error. `TokenFile()` is `C:\HomeControl\deployer\api-token`.
  - The deployer test uses `httptest`. `Status` sends `Authorization: Bearer t` and maps `{"running":{"sha":"94c48fc1"},"busy":"Deploying abc1234"}`. `Command("deployNow","Gabriel on EPKG4 (tray)")` POSTs `{"type":"deployNow","by":"Gabriel on EPKG4 (tray)"}` to `/commands`. A 409 `{"error":"Busy: Deploying abc1234"}` returns an error whose `Error()` is `Busy: Deploying abc1234`. A 401 returns `Unauthorized`.
  - `Derive` table:
    - busy set → `busy`, label = busy, sha.
    - running + probe OK → `running`, `""`, sha.
    - running + probe fails → `not-responding`.
    - not running → `stopped`.
    - `StatusErr` set + service running + probe OK → `deployer-down`.
- [ ] **Step 2: Run them and check they fail.** Run `go test ./internal/serverpc`. Expected: FAIL (package missing).
- [ ] **Step 3: Implement.** `Detect` reads `HKLM\SYSTEM\CurrentControlSet\Services\HomeDeployer\Parameters` `AppParameters` with `golang.org/x/sys/windows/registry`; `ServiceRunning` uses `golang.org/x/sys/windows/svc/mgr`. Both packages are already in x/sys, so nothing new is added. Set the `HTTP` client timeout to 5 s.
- [ ] **Step 4: Check it passes.** Run `go test ./internal/serverpc && GOOS=windows go vet ./internal/serverpc`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(agent): server-PC deployer client and state`.

---

### Task 4: `traypipe` protocol and the `trayhub` (service-side logic)

**Files:**
- Create: `apps/agent/internal/traypipe/protocol.go`, `internal/trayhub/hub.go`, `internal/trayhub/updatecheck.go`
- Test: `traypipe/protocol_test.go`, `trayhub/hub_test.go`, `trayhub/updatecheck_test.go`

**Interfaces:**
- Produces (`traypipe`):
  ```go
  type Status struct {
      Version   int          `json:"version"`
      Connected bool         `json:"connected"`
      Server    string       `json:"server"`
      DeviceID  string       `json:"deviceId"`
      ServerPC  *ServerState `json:"serverPc,omitempty"`
  }
  type ServerState struct { State string `json:"state"`; Label string `json:"label,omitempty"`; Sha string `json:"sha,omitempty"` }
  type Request struct { T string `json:"t"`; ID string `json:"id,omitempty"` } // status.get | update.check | server.restart | server.deploy | tray.hide
  type Reply struct { T string `json:"t"`; Status *Status `json:"status,omitempty"`; ID string `json:"id,omitempty"`; OK bool `json:"ok,omitempty"`; Message string `json:"message,omitempty"` } // t: status | result
  func EncodeRequest(Request) []byte; func DecodeRequest([]byte) (Request, error)   // {"v":1,...}\n; unknown t → ErrUnknown
  func EncodeReply(Reply) []byte;     func DecodeReply([]byte) (Reply, error)
  const MaxLine = 64 << 10
  ```
- Produces (`trayhub`):
  ```go
  type ServerPC interface {
      Read(ctx context.Context) traypipe.ServerState
      Command(ctx context.Context, typ, by string) error
  }
  type Hub struct {
      Version int; Server, DeviceID string
      SendCheck func(version int) bool         // client.Send(protocol.UpdateCheck{...}); false = not connected
      ServerPC ServerPC                        // nil off the server PC
      Hide func(session uint32)
      Now func() time.Time; CheckTimeout time.Duration // 15 s
  }
  func (h *Hub) Subscribe() (<-chan traypipe.Status, func())   // current status first, then changes; func unsubscribes
  func (h *Hub) Handle(ctx context.Context, session uint32, by string, r traypipe.Request) traypipe.Reply
  func (h *Hub) Run(ctx context.Context)                       // polls ServerPC every 5 s while subscribers > 0
  // AgentEvents (Task 2):
  func (h *Hub) Connected(bool); func (h *Hub) UpdateOffered(int); func (h *Hub) UpdateNone(int)
  ```

- [ ] **Step 1: Write the failing tests.**
  - traypipe: round-trip each request and reply. `DecodeRequest("{\"v\":2,...}")` returns an error, and `t:"exec"` returns `ErrUnknown`. Each encoded line ends in exactly one `\n`.
  - hub:
    - `Subscribe` first yields `{Version, Connected:false, Server, DeviceID}`, and `Connected(true)` yields an update with `Connected:true`.
    - `update.check` while disconnected (`SendCheck` returns false) replies `{ok:false,message:"Not connected to Home"}`.
    - Connected, then `UpdateOffered(15)` replies `{ok:true,message:"Updating to version 15…"}`.
    - `UpdateNone(14)` replies `{ok:true,message:"Up to date (version 14)"}`.
    - No answer within `CheckTimeout` replies `{ok:false,message:"Home didn't answer"}`.
    - `Connected(false)` while pending replies `"Not connected to Home"`.
    - `server.deploy` with `ServerPC == nil` replies `{ok:false,message:"This PC isn't the server"}`.
    - With a fake `ServerPC`, `Command("deployNow", by)` is called and an error is passed through as `message`. Success replies `{ok:true,message:"Deploy started"}` (restart: `"Restarting the server"`).
    - `tray.hide` calls `Hide(session)`.
    - `Run` doesn't call `Read` with zero subscribers, calls it at least once within 5 s of a subscriber (use a fake clock or a short interval field), and puts the result in `Status.ServerPC`.
- [ ] **Step 2: Run them and check they fail.** Run `go test ./internal/traypipe ./internal/trayhub`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pending checks: a single pending slot is fine. A second check while one is pending waits on the same answer.
- [ ] **Step 4: Check it passes.** Run the same command, with `-race`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(agent): tray pipe protocol and service-side hub`.

---

### Task 5: Tray process management and the pipe server, wired into the service

**Files:**
- Create: `internal/trays/policy.go`, `internal/trays/manager_windows.go`, `internal/traypipe/server_windows.go`, `internal/winsession/launch_windows.go`, `internal/serverpc/source_windows.go` (the `trayhub.ServerPC` implementation: `Detect`, `ServiceRunning`, `Deployer`, a 3 s probe of `<server>/api/identity`, `Derive`)
- Modify: `internal/power/launch_windows.go` (use `winsession.LaunchAs`), `internal/winsession/winsession_windows.go` (export `UserOf`, add `UserSessions() []uint32`, which lists active sessions with a user), `internal/service/service_windows.go`
- Test: `internal/trays/policy_test.go`

**Interfaces:**
- Consumes: `trayhub.Hub` (Task 4), `serverpc` (Task 3), `service.AgentEvents` (Task 2).
- Produces:
  ```go
  // winsession
  func LaunchAs(session uint32, args []string) (windows.Handle, error)  // args[0] excluded: runs os.Executable() with args
  // trays (pure)
  type Policy struct { Now func() time.Time }
  func (p *Policy) ToLaunch(sessions []uint32, running map[uint32]bool) []uint32
  func (p *Policy) Launched(session uint32)
  func (p *Policy) Hidden(session uint32)
  func (p *Policy) LoggedOff(session uint32)
  // trays (windows)
  type Manager struct { Policy *Policy; Launch func(uint32) (windows.Handle, error); Sessions func() []uint32; Log client.Logger }
  func (m *Manager) Sync(); func (m *Manager) Hide(session uint32); func (m *Manager) LoggedOff(session uint32); func (m *Manager) StopAll()
  // traypipe (windows)
  func Serve(ctx context.Context, hub Handler, log Logger) error   // Handler: Subscribe/Handle as in trayhub; by = "<UserOf(session)> on <hostname> (tray)"
  ```
- Launch args: `HomeAgent.exe tray`.

- [ ] **Step 1: Write the failing tests** (`policy_test.go`):
  - Sessions `[1,2]` with none running gives `[1,2]`.
  - With 1 running, gives `[2]`.
  - `Hidden(2)` gives `[1]` only, and still `[1]` after the tray in 1 exits. After `LoggedOff(2)`, 2 is launchable again.
  - Backoff: after the first launch plus 3 relaunches within 5 min, session 1 is excluded; after the clock moves 5 min past the first of those, it's included again.
  - `LoggedOff` clears backoff.
- [ ] **Step 2: Run it and check it fails.** Run `go test ./internal/trays`. Expected: FAIL.
- [ ] **Step 3: Implement the policy**, then the Windows parts:
  - `LaunchAs` is the body of today's `power.Launch`, generalised; `power.Launch` now calls it.
  - `Manager` keeps `session → handle` and a goroutine per handle that waits for the process to exit, then calls `Sync`.
  - `StopAll` terminates every handle.
  - `Serve` creates the pipe with the SDDL from Global Constraints, one goroutine per client, gets the client session through `kernel32!GetNamedPipeClientSessionId`, pushes every `Subscribe` value as a `status` reply, and answers requests with `Handle`. Malformed lines are logged and skipped. Closing ctx closes all pipes.
  - In `service_windows.go`:
    - Accept `svc.AcceptSessionChange`.
    - On `svc.SessionChange`, read `EventType`; `WTS_SESSION_LOGOFF` (6) → `LoggedOff(sessionID)`, then `Sync()` for every event.
    - In `run()`: build the `Hub` (`SendCheck: func(v int) bool { return send(protocol.UpdateCheck{Version: v}) }`; `ServerPC` set only when `serverpc.Detect()` is true), set `agent.Events = hub`, and start `hub.Run`, `traypipe.Serve` and `Manager.Sync()` before `c.Run`.
    - On exit, `Manager.StopAll()`.
    - Pass the session-change events from `Execute` to `run` over a channel.
- [ ] **Step 4: Check it passes.** Run `go test ./... && GOOS=windows go vet ./...`. Expected: PASS, and the power tests are still green.
- [ ] **Step 5: Commit** with the message `feat(agent): service launches trays and serves the tray pipe`.

---

### Task 6: Tray model: menu, notifications and pipe client

**Files:**
- Create: `internal/tray/menu.go`, `internal/tray/watch.go`, `internal/traypipe/client_windows.go`
- Test: `internal/tray/menu_test.go`, `internal/tray/watch_test.go`

**Interfaces:**
- Consumes: `traypipe.Status`, `Request`, `Reply` (Task 4).
- Produces:
  ```go
  type ItemID int  // IDStatus, IDServerStatus, IDOpenHome, IDOpenDeploys, IDRestart, IDDeploy, IDOpenPC, IDCheck, IDHide
  type Item struct { ID ItemID; Label string; Disabled, Separator bool }
  func Menu(s traypipe.Status) []Item
  func Tooltip(s traypipe.Status) string
  func Dimmed(s traypipe.Status) bool                         // !Connected || (ServerPC != nil && State != "running")
  func Target(s traypipe.Status, id ItemID) string            // URL for open items ("" otherwise)
  type Watch struct{ /* pending: "deploy" | "restart" */ }
  func (w *Watch) Started(kind string)
  func (w *Watch) Next(s traypipe.Status) (title, text string, ok bool)
  // client (windows)
  func Dial(ctx context.Context) (*Conn, error)                // retries for 10 s
  func (c *Conn) Send(r traypipe.Request) error
  func (c *Conn) Read() (traypipe.Reply, error)               // io.EOF when the service goes away
  ```

- [ ] **Step 1: Write the failing tests.**
  - `Menu` for an agent PC, connected, v14, gives the exact item list from the spec: status (disabled) `HomeAgent 14 · Connected`, separator, `Open Home`, `Open this PC in Home`, separator, `Check for updates`, separator, `Hide until next sign-in`.
  - Disconnected gives `HomeAgent 14 · Not connected — retrying`, and `Check for updates` stays enabled (the hub answers).
  - On the server PC with `{State:"running",Sha:"94c48fc1a…"}`, the first items are `Server · Running 94c48fc`, `Open Home`, `Open Deploys page`, `Restart server…`, `Deploy latest now…`, separator, then the agent items **without** a second `Open Home`.
  - `busy` gives `Server · Deploying abc1234`, and Restart and Deploy are disabled. `stopped`, `not-responding` and `deployer-down` map to the Global Constraints copy.
  - `Target(IDOpenPC)` is `http://192.168.0.100:4000/devices/dev1`, with a trailing slash in `Server` handled. `Target(IDOpenDeploys)` is `…/admin/deploys`.
  - `Tooltip` gives `Home — connected · server running`.
  - Watch: `Started("deploy")`, then a busy status gives no message, then `running sha X` gives `("Deploy finished","Running X")`. Ending in `stopped` gives `("Deploy ended","The server is stopped — see the Deploys page")`. Restart gives `("Server restarted","Running X")`. Without `Started`, there are no messages.
- [ ] **Step 2: Run them and check they fail.** Run `go test ./internal/tray`. Expected: FAIL.
- [ ] **Step 3: Implement** `menu.go` and `watch.go` (pure), and `client_windows.go` (`CreateFile` on the pipe, a buffered line reader capped at `MaxLine`).
- [ ] **Step 4: Check it passes.** Run `go test ./internal/tray && GOOS=windows go vet ./internal/traypipe`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(agent): tray menu model and pipe client`.

---

### Task 7: The tray UI, `tray` mode and icons

**Files:**
- Create: `internal/tray/win/window_windows.go` (message-only-ish hidden window, loop), `icon_windows.go` (`Shell_NotifyIconW` add/modify/delete, balloon, load icons), `menu_windows.go` (`CreatePopupMenu` from `[]tray.Item`, `TrackPopupMenu`), `run_windows.go` (`Run() int`: mutex, dial, reader goroutine → `PostMessage(WM_APP+2)`, dispatch clicks), `apps/agent/winres/icon.png`, `icon-off.png`
- Modify: `cmd/homeagent/args.go` (+ `modeTray`, `"tray"` takes no flags), `main_windows.go` (`case modeTray: os.Exit(win.Run())`), `main_test.go` (`parseArgs([]string{"tray"})` gives `modeTray`; `tray --x` errors), `winres/winres.json` (`RT_GROUP_ICON`: `APP` → `icon.png`, `OFF` → `icon-off.png`)

**Interfaces:**
- Consumes: Task 6 (`Menu`, `Tooltip`, `Dimmed`, `Target`, `Watch`, `Dial`, `Conn`), `traypipe.Request` IDs from Task 4.
- Behaviour that must hold:
  - A single instance per session uses the mutex `Local\HomeAgentTray`; if it already exists, exit 0.
  - Left-click (`NIN_SELECT`/`WM_LBUTTONUP`) opens `Target(IDOpenHome)` via `ShellExecuteW("open")`. Right-click (`WM_CONTEXTMENU`) shows `Menu(status)` after `SetForegroundWindow`.
  - Restart and Deploy first show `MessageBoxW` `MB_YESNO|MB_ICONQUESTION`: `Restart the Home server now?` / `Deploy the latest version now?`. On Yes, send the request with a new id, then `Watch.Started`.
  - A `result` reply shows a balloon (title `Home`, text = message; `NIIF_WARNING` when `!ok`). `Watch.Next` messages are shown as balloons too.
  - Each `status` reply updates the tooltip and the icon (`OFF` when `Dimmed`).
  - On `RegisterWindowMessage("TaskbarCreated")`, re-add the icon.
  - On Hide, send `tray.hide`, then `NIM_DELETE` and exit 0. When `Read` returns EOF, `NIM_DELETE` and exit 0.
  - With no resource icons (a dev build without `rsrc`), fall back to `IDI_APPLICATION`.
  - Icons are a simple 256×256 house glyph: `icon.png` in the app accent colour, `icon-off.png` the same shape in 50% grey. Draw them with a throwaway Go program using `image/png`; don't commit the generator.

- [ ] **Step 1: Write the failing test** for the `tray` mode in `main_test.go`.
- [ ] **Step 2: Run it and check it fails.** Run `go test ./cmd/homeagent`. Expected: FAIL.
- [ ] **Step 3: Implement** the args mode, the `win` package, and the icons and `winres.json`.
- [ ] **Step 4: Check it builds.** Run `go test ./... && GOOS=windows go vet ./... && go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.json --out cmd/homeagent/rsrc && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o HomeAgent.exe ./cmd/homeagent`. Expected: PASS and the exe builds. Delete the generated `rsrc*.syso` and `HomeAgent.exe` afterwards if `.gitignore` doesn't cover them.
- [ ] **Step 5: Commit** with the message `feat(agent): tray icon UI`.

---

### Task 8: Docs and the hands-on check

**Files:**
- Modify: `docs/HOME-AGENT.md` (the tray: what it shows; the pipe and who can use it; any signed-in user on the server PC can restart or deploy), `docs/RUNNING.md` (install HomeAgent on the server PC through the adopt-this-PC download to get the server tray), `apps/agent/README.md` (layout rows for `traypipe`, `trayhub`, `trays`, `tray`, `serverpc`)

- [ ] **Step 1: Write the docs** above.
- [ ] **Step 2: Hands-on check** on the dev PC. Build the exe as in Task 7 and install it over the current agent. Check:
  - the icon appears after a sign-out and back in;
  - the menu shows the version and Connected;
  - Open Home and Open this PC in Home open the right URLs;
  - Check for updates says "Up to date (version N)";
  - Hide removes the icon until the next sign-in;
  - restarting Explorer brings the icon back;
  - `Restart-Service HomeAgent` makes the icon disappear and come back.
- [ ] **Step 3: On the server PC** (after CI publishes the agent and it's adopted there), check:
  - the Server line says `Running <sha7>`;
  - Restart server… asks for confirmation, then shows "Restarting the server" and later "Server restarted";
  - Deploy latest now… while a deploy is running shows the deployer's "Busy: …" text;
  - the Deploys page history shows `<user> on <PC> (tray)`.
- [ ] **Step 4: Commit** with the message `docs: tray icons`.
