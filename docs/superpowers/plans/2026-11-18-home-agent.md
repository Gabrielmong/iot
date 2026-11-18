# HomeAgent (PC power + live stats) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tiny Windows agent (Go) that a PC gets through "Adopt this PC", which lets the app sleep / shut down / restart the PC behind a cancellable countdown, show live stats, gate both by per-PC permissions, and uninstall itself when the PC is removed.

**Architecture:** The agent is a Windows service that dials **out** to the server over a WebSocket (`/agent/ws`) with a per-agent bearer token obtained by redeeming a one-time enrollment code carried in a trailer appended to the downloaded exe. The server keeps an `AgentHub` of live connections; presence marks the PC On, power and stats requests are relayed as a closed set of JSON messages, and stats flow only while someone with *Live stats* is watching. CI builds the exe on Ubuntu; the deployer syncs it next to the APK; the server serves it (with the trailer) and offers updates.

**Tech Stack:** Go 1.23 (`golang.org/x/sys/windows` svc/mgr/eventlog, `github.com/coder/websocket`, `github.com/shirou/gopsutil/v4`, `github.com/tc-hib/go-winres` for the manifest), TypeScript server (ws, Apollo, Prisma), React+MUI web.

**Spec:** `docs/superpowers/specs/2026-11-17-pc-agent-and-history-design.md` (Phase 2 sections). Phase 1 is merged on `main`.

## Global Constraints

- Agent targets: **< 20 MB RAM idle, ~0 % CPU idle, < 10 MB on disk**; Windows 10/11 x64 only; `CGO_ENABLED=0`.
- No generic "run anything" channel: the message set below is closed; unknown `t` is ignored and logged.
- Never require a firewall change on the PC (agent dials out only).
- Paths: install `C:\Program Files\HomeAgent\HomeAgent.exe`; state `C:\ProgramData\HomeAgent\agent.json` (ACL: SYSTEM + Administrators only); service name `HomeAgent`, auto start, LocalSystem.
- Enrollment code: random 128-bit, base64url, stored only as SHA-256; expires **30 min**; single use; admin only. Download name `HomeAgent-<first 8 chars of code>.exe`.
- Agent token: random 256-bit, base64url; server stores SHA-256 hex in `Device.agentTokenHash` (unique).
- Reconnect backoff **1 s → 60 s**; heartbeat **every 30 s**; token rejected without a removal record → retry **once an hour**, log to Windows event log, never self-uninstall.
- `AgentRemoval` records expire after **90 days**.
- Stats: `stats.start {intervalMs: 2000}` on the first permitted viewer; `stats.stop` **10 s** after the last leaves; never stored.
- Power countdown **60 s**; prompt copy: "‹User› is restarting this PC in 60 s" (sleep: "putting this PC to sleep", shut down: "shutting down this PC"), buttons **Cancel** and **Do it now**. Nobody signed in or session locked → act immediately. App copy after a cancel at the PC: "Restart cancelled at the PC" (Sleep/Shut down likewise).
- Permissions: `DeviceGrant.stats`, `DeviceGrant.power` (default false); admins implicitly all; guests never see PCs.
- Routines may use **Sleep** and **Shut down** (not Restart) on PCs with an agent; requester shown as "Routine ‹name›"; personal routines need the owner's `power` on that PC at save and at run.
- Releases: workflow `Agent` publishes `agent-v<1000+run_number>` with assets `HomeAgent.exe` and `agent.json` = `{"version": n, "sha256": "<hex>"}`; deployer syncs to `C:\HomeControl\shared\agent\`; server env `AGENT_DIR`.
- Small files, separation of concerns (project rule).

### Wire protocol (v1) — the Go ↔ TS contract

Every message is one JSON object `{"v":1,"t":"<type>", ...}`.

| Direction | `t` | Fields |
|---|---|---|
| agent → server | `hello` | `version:int, hostname, ips:[string], macs:[string], wakeMac, os` |
| agent → server | `heartbeat` | — |
| agent → server | `stats` | `cpu` (0–100), `ramUsed`, `ramTotal` (bytes), `gpu?: {name, load, tempC}`, `disks:[{mount, free, total}]`, `netUp`, `netDown` (bytes/s), `uptimeS`, `user?`, `idleS?` |
| agent → server | `power.state` | `id, phase: "countdown"\|"cancelled"\|"executing"\|"skipped", secondsLeft?` |
| agent → server | `uninstall.ack` | — |
| server → agent | `stats.start` | `intervalMs` |
| server → agent | `stats.stop` | — |
| server → agent | `power` | `id, action: "sleep"\|"shutdown"\|"restart", requestedBy, seconds` (60) |
| server → agent | `power.cancel` | `id` |
| server → agent | `uninstall` | — |
| server → agent | `update` | `version, url, sha256` |

HTTP: `POST /agent/enroll` body `{code, hostname, macs, wakeMac, ips, os, agentVersion}` → `200 {deviceId, token}` · `410` code unknown/used/expired · `400` malformed. WS `GET /agent/ws` with `Authorization: Bearer <token>`: unknown token → HTTP `401` before upgrade; token in an `AgentRemoval` → upgrade, send `uninstall`.

Exe trailer: `<json {"server":"http://host:port","code":"..."}><uint32 LE json length><"HOMEAGT1">` appended at the end of the published exe.

## Review Focus

1. **Enrollment code reused or expired** (double-click the exe twice, or run it an hour later) → second redeem gets 410 and the agent says so in the event log and exits; no second device. Test in Task 1.
2. **Adopting a PC that was added by hand** (same MAC, different notation/case, or the MAC is a secondary adapter) → attaches to that device, keeps its name/grants/history, sets `config.mac` to the wake MAC. Test in Task 1.
3. **Two sockets with the same token** (agent restart racing the old socket's close) → the newest wins; the old one's close doesn't mark the PC Off. Test in Task 3.
4. **A user loses `power` or `stats` (or the grant) while watching/countdown** → stats stop for them within one event; a new `pcPower` is refused; a running countdown is unaffected. Test in Tasks 5–7.
5. **Device removed while the agent is offline** → removal record waits; when the agent next connects (days later) it gets `uninstall`, and only after `uninstall.ack` is the record deleted. Test in Task 3.

---

## Server

### Task 1: Agent schema, tokens and enrollment

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (+ migration `agent`): `Device.agentTokenHash String? @unique`, `Device.agentVersion Int?`; `model AgentEnrollment { id, codeHash String @unique, createdById → User (cascade), expiresAt, usedAt? }`; `model AgentRemoval { tokenHash String @id, createdAt @default(now()) }`; `DeviceGrant.stats Boolean @default(false)`, `DeviceGrant.power Boolean @default(false)`.
- Create: `apps/server/src/agent/tokens.ts`, `apps/server/src/agent/enrollment.ts`, `apps/server/src/agent/enroll-route.ts`, `apps/server/src/graphql/resolvers/agents.ts`
- Modify: `apps/server/src/graphql/schema.graphql`, `resolvers/index.ts`, `server.ts` (mount route), `test/helpers.ts` (TRUNCATE new tables)
- Test: `apps/server/test/agent-enrollment.test.ts`

**Interfaces:**
- Produces: `newSecret(bytes: 16 | 32): string` (base64url), `sha256Hex(s: string): string`; `createEnrollment(prisma, userId, now): Promise<{ code: string; expiresAt: Date }>`; `redeemEnrollment(deps, input: EnrollInput, now): Promise<{ deviceId: string; token: string } | "gone">`; `ENROLL_PATH = "/agent/enroll"`.
- GraphQL: `createAgentEnrollment: AgentEnrollment!` (admin) → `type AgentEnrollment { downloadUrl: String!  expiresAt: String! }` with `downloadUrl = /agent/download/<code>`.

Redeem: in one transaction, find unused unexpired enrollment by hash (else `"gone"`), mark used, find a WOL COMPUTER whose `externalId` or `config.mac` or any of `config.macs` equals one of `input.macs` (normalised via `parseMac`), else create `{brand WOL, kind COMPUTER, adopted true, name hostname, externalId wakeMac}`. Set `ip = ips[0]`, `config = {...old, mac: wakeMac, macs: union(old.macs, macs)}`, `agentTokenHash`, `agentVersion`. Then `manager.refresh()` / publish devicesChanged. A PC that already had an agent gets its token replaced (re-pair).

Ruling vs spec: the spec says the token hash lives in `Device.secret`; that column is encrypted-at-rest and not indexable, so the hash gets its own unique column `agentTokenHash` instead. Also modify `services/computers.ts` `updateComputer` so an IP change resets only `probeSeen`/`rdpSeen` and keeps `config.macs` (the Edit dialog merges, never overwrites).

- [ ] **Step 1: Write failing tests**: editing an adopted PC's IP keeps `config.macs`; `createAgentEnrollment` is admin-only (`FORBIDDEN` for a user) and returns a `/agent/download/` URL expiring in 30 min; POST enroll creates a COMPUTER named after the hostname with `config.mac = wakeMac` and returns a token whose hash is stored; the same code again → 410; an expired code (clock +31 min) → 410; enroll with `macs` containing `AA-BB-CC-DD-EE-01` attaches to an existing device `aa:bb:cc:dd:ee:01` (same id, name and grants kept, `config.mac` becomes the wake MAC); malformed body → 400.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run test/agent-enrollment.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** (schema + `npx prisma migrate dev --create-only --name agent` + `prisma generate`; route registered in `createHttpApp`'s `api` map; body limit 16 KB).
- [ ] **Step 4: Run** same, then `npx tsc --noEmit -p .` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): agent enrollment`

### Task 2: Serving the agent exe

**Files:**
- Create: `apps/server/src/agent/agent-store.ts`, `apps/server/src/agent/trailer.ts`, `apps/server/src/agent/download-route.ts`
- Modify: `apps/server/src/config.ts` (`agentDir` from `AGENT_DIR`), `server.ts`, `main.ts`
- Test: `apps/server/test/agent-download.test.ts`

**Interfaces:**
- Produces: `readAgentInfo(dir?: string): { version: number; sha256: string; exePath: string } | null` (like `readApkInfo`; reads `HomeAgent.exe` + `agent.json` per request); `trailer(payload: { server: string; code: string }): Buffer`; routes `GET /agent/download/:code` (valid unused code → exe + trailer, `Content-Disposition: attachment; filename="HomeAgent-<code8>.exe"`, server = `http://<Host header>`; else 410; no exe published → 503 "The agent isn't available yet") and `GET /agent/HomeAgent.exe` (plain published exe, for updates).

- [ ] **Step 1: Write failing tests**: download with a valid code returns the exe bytes followed by a trailer that decodes to `{server: "http://<host>", code}` with the `HOMEAGT1` magic; used/unknown code → 410; missing `AGENT_DIR` files → 503; `/agent/HomeAgent.exe` returns the bytes unchanged and its SHA-256 equals `agent.json.sha256`.
- [ ] **Step 2: Run** `npx vitest run test/agent-download.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** (stream the file, then write the trailer).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): serve the agent with its pairing trailer`

### Task 3: Agent WebSocket, hub, removal and updates

**Files:**
- Create: `apps/server/src/agent/protocol.ts`, `apps/server/src/agent/hub.ts`, `apps/server/src/agent/agent-socket.ts`, `apps/server/src/agent/removals.ts`
- Modify: `server.ts` (`routeUpgrades` gets the `/agent/ws` route), `services/devices.ts` (`removeDevice` → removal record + `uninstall`), `services/deps.ts` (`agents: AgentHub`), `main.ts`, test harness
- Test: `apps/server/test/agent-socket.test.ts`

**Interfaces:**
- Produces: `parseAgentMessage(raw: string): AgentMessage | null` (closed union per the protocol table); `class AgentHub extends EventEmitter` with `attach(deviceId, socket): void` (replaces an older socket for that device and closes it without emitting `disconnected`), `send(deviceId, msg: ServerMessage): boolean`, `isConnected(deviceId): boolean`, `info(deviceId): { version: number } | null`, events `connected(deviceId)`, `disconnected(deviceId)`, `message(deviceId, msg)`; `recordRemoval(prisma, tokenHash)`, `pendingRemoval(prisma, tokenHash, now): Promise<boolean>` (deletes and returns false when older than 90 days).

Behaviour: on `hello` update `ip` (first IP), add new MACs to `config.macs` (never remove), store `agentVersion`; if `readAgentInfo().version > hello.version` send `update {version, url: "/agent/HomeAgent.exe", sha256}`. Close a socket that sends no message for 90 s. On `uninstall.ack` delete the removal record.

- [ ] **Step 1: Write failing tests** (real `ws` client against the harness): bad token → 401 before upgrade; good token + hello → `hub.isConnected` true and device `ip`/`config.macs` updated; an older agent version gets `update`; a second socket with the same token replaces the first and closing the first doesn't emit `disconnected`; remove the device while connected → agent receives `uninstall`; remove while offline, then connect days later with the old token → upgrade succeeds, `uninstall` sent, record deleted only after `uninstall.ack`; a 91-day-old removal record → 401 and the record is gone; an unknown `t` is ignored (socket stays open).
- [ ] **Step 2: Run** `npx vitest run test/agent-socket.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + full server suite — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): agent connections, removal and update offers`

### Task 4: Agent presence drives the PC's state

**Files:**
- Modify: `apps/server/src/devices/drivers/wol.ts`, `wol-link.ts` (an `isAgentConnected(deviceId)` input: while true the link reports `{online:true,on:true}` and skips the probe), `devices/manager.ts` (`agentChanged(deviceId)` → re-sync WOL / report), `devices/computers/computer-info.ts` (`confirmable = probeSeen || hasAgent`; `agent: { connected: boolean; version: number | null } | null`), `devices/computers/power-history.ts` callers (source `AGENT` when the change came from presence; add `WAKE` to `enum PowerSource` in the Task 1 migration and record it when a wake watch ends `WOKE` from the probe), `graphql/schema.graphql` (`type AgentInfo { connected: Boolean!  version: Int }`, `ComputerInfo.agent: AgentInfo`)
- Test: `apps/server/test/agent-presence.test.ts`

**Interfaces:**
- Consumes: `AgentHub` events (Task 3).
- Produces: `ComputerInfo.agent`; presence → `state.on = true` within one event; on disconnect the probe resumes (next poll decides).

- [ ] **Step 1: Write failing tests**: an agent connecting marks a probe-silent PC On and publishes it; a running wake watch ends `WOKE`; disconnect → next probe result wins (fake probe returns nothing → `on:false` only if `probeSeen`, else unknown); a PC with only an agent (never probed) is `confirmable`; history records the On with source `AGENT`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + full server suite — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): agent presence marks PCs on`

### Task 5: Per-PC permissions

**Files:**
- Create: `apps/server/src/services/computer-grants.ts`
- Modify: `services/device-grants.ts` (`setDeviceGrants` keeps `stats`/`power` for users who stay granted: diff instead of delete-all/create-all), `graphql/guards.ts` (`requirePcPermission(ctx, deviceId, "stats" | "power"): Promise<User>`), `devices/computers/computer-info.ts` + resolvers (`ComputerInfo.canStats`, `canPower` for the viewer), schema (`type ComputerGrant { userId: ID!  stats: Boolean!  power: Boolean! }`, `computerGrants(deviceId: ID!): [ComputerGrant!]!` admin, `setComputerGrants(deviceId: ID!, grants: [ComputerGrantInput!]!): [ComputerGrant!]!` admin — only for users already granted the PC; others → BAD_USER_INPUT)
- Test: `apps/server/test/api-computer-grants.test.ts`

**Interfaces:**
- Produces: `pcPermissions(prisma, user, deviceId): Promise<{ see: boolean; stats: boolean; power: boolean }>` (admin: all true; guest: all false); `grantEvents.emit("grantsChanged", deviceId)` on flag changes.

- [ ] **Step 1: Write failing tests**: admin sees `canStats/canPower` true; a granted user false until `setComputerGrants` sets them; re-saving `setDeviceGrants` with the same users keeps the flags; dropping a user drops their flags; setting flags for an ungranted user → BAD_USER_INPUT; non-admin calling either → FORBIDDEN.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): per-PC stats and power permissions`

### Task 6: Power actions

**Files:**
- Create: `apps/server/src/agent/power.ts`, `apps/server/src/graphql/resolvers/pc-power.ts`
- Modify: schema (`enum PcPowerAction { SLEEP SHUTDOWN RESTART }`, `enum PcPowerPhase { SENT COUNTDOWN CANCELLED EXECUTING SKIPPED }`, `type PcPowerState { id: ID!  deviceId: ID!  action: PcPowerAction!  phase: PcPowerPhase!  secondsLeft: Int  requestedBy: String! }`, `pcPower(deviceId: ID!, action: PcPowerAction!): PcPowerState!`, `pcPowerCancel(deviceId: ID!, id: ID!): Boolean!`, `subscription pcPowerState(deviceId: ID!): PcPowerState!`), pubsub topic `PC_POWER`
- Test: `apps/server/test/api-pc-power.test.ts`

**Interfaces:**
- Produces: `requestPower(deps, deviceId, action, requestedBy: string): PcPowerState` (throws `DEVICE_UNREACHABLE` "The PC's agent isn't connected" when offline); agent `power.state` → `PC_POWER` publish; latest state per device kept 60 s for late subscribers.

- [ ] **Step 1: Write failing tests**: with `power` permission → agent receives `power {action:"restart", seconds:60, requestedBy:"Bob"}` and the caller gets `phase SENT`; agent reports `countdown` then `cancelled` → subscriber sees both; `pcPowerCancel` sends `power.cancel`; no agent → `DEVICE_UNREACHABLE`; granted user without `power` → FORBIDDEN; subscription requires *see* permission and is dropped when the grant is revoked.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): sleep, shut down and restart PCs through the agent`

### Task 7: Live stats

**Files:**
- Create: `apps/server/src/agent/stats-broker.ts`, `apps/server/src/graphql/resolvers/pc-stats.ts`
- Modify: schema (`type PcStats { cpu: Float!  ramUsed: Float!  ramTotal: Float!  gpu: GpuStats  disks: [DiskStats!]!  netUp: Float!  netDown: Float!  uptimeS: Int!  user: String  idleS: Int }`, `GpuStats { name: String!  load: Float!  tempC: Float! }`, `DiskStats { mount: String!  free: Float!  total: Float! }`, `subscription pcStats(deviceId: ID!): PcStats!`), pubsub topic `PC_STATS`
- Test: `apps/server/test/stats-broker.test.ts`, `apps/server/test/api-pc-stats.test.ts`

**Interfaces:**
- Produces: `class StatsBroker { constructor(hub, { stopDelayMs = 10_000 }); watch(deviceId): () => void }` — first watcher sends `stats.start {intervalMs:2000}`, last release schedules `stats.stop` in 10 s (cancelled by a new watcher); an agent reconnecting while watched gets `stats.start` again.

- [ ] **Step 1: Write failing tests** (fake timers for the broker): first watch → one `stats.start`; second watch → nothing; both released → `stats.stop` after exactly 10 s; re-watch at 9 s → no stop; reconnect while watched → `stats.start`. API: user without `stats` → FORBIDDEN; with it → receives the agent's numbers; revoking `stats` ends that subscription.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): live PC stats while someone watches`

### Task 8: Routines can sleep / shut down PCs

**Files:**
- Modify: `apps/server/src/routines/steps.ts` (`DeviceAction.pcPower?: "SLEEP" | "SHUTDOWN"`), `action-rules.ts` (COMPUTER: `on:true` xor `pcPower`, `pcPower` only with `agentTokenHash`), `devices.ts`/`checkDevices` (personal routine: owner needs `power` on that PC), `runner.ts` (run `pcPower` via `requestPower(..., "Routine ‹name›")`; offline agent → problem `UNREACHABLE`; owner lost `power` → `NO_ACCESS`), schema (`DeviceAction.pcPower: PcPowerAction`, `DeviceActionInput.pcPower`)
- Test: `apps/server/test/api-routines-pc-power.test.ts`

- [ ] **Step 1: Write failing tests**: saving SLEEP on a PC without an agent → BAD_USER_INPUT "‹name› has no agent"; RESTART in a routine → BAD_USER_INPUT; a personal routine by a user without `power` → FORBIDDEN at save; run sends `power {action:"sleep", requestedBy:"Routine Night"}`; agent offline at run → run PARTIAL with UNREACHABLE.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + full server suite — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): routines can sleep and shut down PCs`

## Agent (Go)

> Prerequisite (once, dev PC): `winget install GoLang.Go` (Go ≥ 1.23). Windows-only code lives in `_windows.go` files; portable logic has tests that also run on Ubuntu CI.

### Task 9: Module, trailer, state file, adapters, protocol

**Files:**
- Create: `apps/agent/go.mod` (module `homeagent`), `apps/agent/internal/trailer/trailer.go`, `internal/state/state.go` (+ `acl_windows.go`), `internal/netinfo/netinfo.go` (+ `adapters_windows.go`), `internal/protocol/protocol.go`, `apps/agent/README.md`
- Test: `trailer_test.go`, `state_test.go`, `netinfo_test.go`, `protocol_test.go`

**Interfaces:**
- Produces: `trailer.Read(path string) (Config{Server, Code string}, error)` (`ErrNoTrailer`); `state.Load(path) (State{Server, DeviceID, Token string}, error)`, `state.Save(path, State) error`; `netinfo.Adapter{Name, MAC string; Wired, Up, Virtual bool; IPs []string}`, `netinfo.Choose(adapters []Adapter) (wakeMAC string, macs []string, ips []string)` (filters virtual; wake = wired+up, else first wired, else Wi-Fi); `protocol.Encode(msg any) []byte`, `protocol.Decode([]byte) (Message, error)` with one struct per table row.

- [ ] **Step 1: Write failing tests**: trailer round-trip with a file built by the TS `trailer()` byte layout, and `ErrNoTrailer` on a plain file; state save/load round-trip; `Choose` picks the up wired adapter over an up Wi-Fi, skips `Hyper-V`/`vEthernet`/`WSL`/loopback/VPN (`Virtual:true`), falls back to Wi-Fi; protocol decodes every server message in the table and rejects `v != 1`.
- [ ] **Step 2: Run** `cd apps/agent && go test ./...` — Expected: FAIL.
- [ ] **Step 3: Implement** (adapters via `GetAdaptersAddresses`, virtual = type not Ethernet/802.11 or description matches the virtual list).
- [ ] **Step 4: Run** `go test ./... && GOOS=windows go vet ./...` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(agent): Go module with trailer, state, adapters and protocol`

### Task 10: Enroll and the connection loop

**Files:**
- Create: `apps/agent/internal/client/enroll.go`, `internal/client/conn.go`, `internal/client/backoff.go`, `internal/client/handler.go`
- Test: `enroll_test.go`, `conn_test.go`, `backoff_test.go` (against `httptest` servers)

**Interfaces:**
- Produces: `client.Enroll(ctx, server, code string, info Hello) (deviceID, token string, err error)` (`ErrCodeGone` on 410); `client.Run(ctx, cfg Config{Server, Token string}, h Handler, hello func() Hello)` — dials `/agent/ws` with the bearer token, sends hello then heartbeats every 30 s, dispatches decoded messages to `Handler` (`OnStatsStart(ms)`, `OnStatsStop()`, `OnPower(Power)`, `OnPowerCancel(id)`, `OnUninstall()`, `OnUpdate(Update)`), exposes `Send(msg)`; reconnects with backoff 1 s → 60 s (doubling, reset after 30 s connected); HTTP 401 → wait 1 h, log `"server rejected the agent token"` via an injected logger.

- [ ] **Step 1: Write failing tests**: enroll posts the documented body and returns the token, 410 → `ErrCodeGone`; Run sends hello first and a heartbeat after 30 s (injected clock/ticker), dispatches `power`; backoff sequence 1,2,4,…,60,60 and reset; a 401 waits 1 h (injected sleeper) and never calls `OnUninstall`.
- [ ] **Step 2: Run** `go test ./internal/client/...` — Expected: FAIL.
- [ ] **Step 3: Implement** with `github.com/coder/websocket`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(agent): enrollment and server connection`

### Task 11: Stats collector

**Files:**
- Create: `apps/agent/internal/stats/collector.go`, `internal/stats/nvidia.go`, `internal/stats/session_windows.go`
- Test: `collector_test.go`, `nvidia_test.go`

**Interfaces:**
- Produces: `stats.Collector{}.Sample(ctx) protocol.Stats` — CPU % since last sample, RAM, fixed drives only, net rate from byte deltas over elapsed time, uptime (gopsutil); GPU from `nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu --format=csv,noheader,nounits` when on PATH (parsed by `parseNvidiaSmi(out string) (*GPU, error)`), else omitted; active session user via `WTSQuerySessionInformation`, idle from `WTSSessionInfo.LastInputTime` when non-zero. Nothing runs between `stats.start` and `stats.stop` except the sampler ticker.

- [ ] **Step 1: Write failing tests**: `parseNvidiaSmi("NVIDIA GeForce RTX 3070, 37, 54\n")` → `{RTX 3070…, 37, 54}`; bad output → error; net rate = (bytes2 − bytes1) / seconds using an injected counter source; a sampler started then stopped leaves no goroutine (`goleak`-style count check).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(agent): live stats sampler`

### Task 12: Power with a countdown prompt

**Files:**
- Create: `apps/agent/internal/power/decide.go`, `internal/power/runner.go`, `internal/power/exec_windows.go` (`SetSuspendState`, `InitiateSystemShutdownExW` with force after the countdown), `internal/power/launch_windows.go` (`WTSGetActiveConsoleSessionId`, `WTSQueryUserToken`, `CreateProcessAsUser` running `HomeAgent.exe prompt --action <a> --by <name> --seconds 60`), `internal/prompt/prompt_windows.go` (`TaskDialogIndirect` with a 1 s timer updating the text; exit code 0 = go, 1 = cancelled), `apps/agent/winres/winres.json` (comctl32 v6 manifest)
- Test: `decide_test.go`, `runner_test.go`

**Interfaces:**
- Produces: `power.Decide(s Session{SignedIn, Locked bool}) Mode` (`Prompt` | `Now`); `power.Runner{Exec, Launch, Clock}.Handle(p protocol.Power, report func(protocol.PowerState))` — reports `countdown` with `secondsLeft` every 10 s, `cancelled` on prompt exit 1 or `Cancel(id)` (kills the prompt), `executing` then executes on exit 0/timeout, `skipped` when another action is already running.
- Copy: dialog text "‹User› is restarting this PC in ‹n› s" / "is putting this PC to sleep in" / "is shutting down this PC in"; buttons "Cancel", "Do it now".

- [ ] **Step 1: Write failing tests**: `Decide` → `Now` when nobody is signed in or locked; Runner with a fake launcher returning 1 → reports `countdown` then `cancelled`, never calls Exec; returning 0 → `executing` and Exec called once with the action; `Cancel(id)` during the countdown kills the prompt and reports `cancelled`; a second `power` while one runs → `skipped`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `go test ./... && GOOS=windows go build ./...` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(agent): power actions behind a cancellable countdown`

### Task 13: Service, install, uninstall, update; main

**Files:**
- Create: `apps/agent/cmd/homeagent/main.go` (modes: no args → install; `service`; `prompt …`; `uninstall`; `update-helper --from --to`), `internal/install/install_windows.go`, `internal/install/uninstall_windows.go`, `internal/service/service_windows.go` (svc.Handler wiring client + stats + power + uninstall/update handlers), `internal/update/update.go` (+ `swap_windows.go`), `internal/eventlog/log_windows.go`
- Test: `update_test.go`, `main_test.go` (mode parsing)

**Interfaces:**
- Produces: install (needs admin; relaunches elevated via `ShellExecute runas` if not): read trailer → copy self to `C:\Program Files\HomeAgent\HomeAgent.exe` (without the trailer) → write `agent.json` `{server, code}` → register + start `HomeAgent` → exit with a message box "HomeAgent is installed. You can close this." Service first start with a code: `Enroll` → save `{server, deviceId, token}` (drop the code); `ErrCodeGone` → event log "This download has already been used or expired. Download it again from the app." and stop. `OnUninstall`: send `uninstall.ack`, stop + delete the service, remove files (self-delete via `cmd /c ping -n 3 127.0.0.1 >nul & rmdir /s /q`). `update.Apply(ctx, u protocol.Update, server)`: download to a temp file, verify SHA-256 (mismatch → delete, log, keep running), spawn `update-helper` which stops the service, replaces the exe, starts it.

- [ ] **Step 1: Write failing tests**: `update.Verify` rejects a wrong hash and accepts the right one; `Apply` with a bad hash never calls the swapper; mode parsing maps args to modes and rejects unknown ones.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `go test ./... && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=1" -o HomeAgent.exe ./cmd/homeagent` — Expected: PASS; exe < 10 MB.
- [ ] **Step 5: Commit** `feat(agent): Windows service, install, self-uninstall and updates`

### Task 14: CI release and deployer sync

**Files:**
- Create: `.github/workflows/agent.yml` (on push to main touching `apps/agent/**`: Ubuntu, `actions/setup-go` 1.23, `go test ./...`, `go-winres make`, windows build as above with `main.version=$((1000+run_number))`, `sha256sum`, write `agent.json`; publish job `gh release create agent-v<n> HomeAgent.exe agent.json`), `apps/deployer/src/agent-exe.ts`
- Modify: `apps/deployer/src/github.ts` (`latestAgentRelease()`), `deployer.ts` (sync next to the APK), `config.ts` (`paths.agent = shared\agent`), the server env written by the deployer / `docs/RUNNING.md` (`AGENT_DIR=C:\HomeControl\shared\agent`)
- Test: `apps/deployer/test/agent-exe.test.ts`

**Interfaces:**
- Produces: `syncAgentExe({ dir, github, log })` mirroring `syncAndroidApk`: keeps `HomeAgent.exe` + `agent.json` at the newest `agent-v<n>`, verifies the downloaded exe's SHA-256 against `agent.json` before replacing, failures only logged.

- [ ] **Step 1: Write failing tests**: newer release replaces both files; same version does nothing; hash mismatch keeps the old pair and logs.
- [ ] **Step 2: Run** `cd apps/deployer && npx vitest run test/agent-exe.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** (workflow pinned to action SHAs like `android.yml`).
- [ ] **Step 4: Run** deployer suite — Expected: PASS.
- [ ] **Step 5: Commit** `ci: build, publish and sync the HomeAgent`

## Web

### Task 15: Adopt this PC; removal copy

**Files:**
- Create: `apps/web/src/admin/devices/computers/AdoptPcDialog.tsx`, `apps/web/src/admin/devices/computers/useAgentEnrollment.ts`
- Modify: `DeviceDialogs.tsx` / `DevicesToolbar.tsx` (Add menu entry "Adopt this PC"), `ConfirmRemoveDialog.tsx` (PC with an agent: "The agent on the PC will uninstall itself."), documents + codegen
- Test: `AdoptPcDialog.test.tsx`

Copy: title "Adopt this PC"; body "Open this on the PC you want to add. Download the agent and run it; Windows may warn that it's from an unknown publisher: choose More info › Run anyway. The PC appears here once the agent connects. The download works once, for 30 minutes."; button "Download the agent".

- [ ] **Step 1: Write failing tests**: clicking Download calls `createAgentEnrollment` and navigates to its `downloadUrl` (via `openUrl`); the remove dialog shows the uninstall sentence only when `computer.agent` is set.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/admin/devices` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + `npx tsc -b` + `pnpm lint` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): adopt this PC`

### Task 16: Access form permissions

**Files:**
- Modify: `apps/web/src/device/admin/AccessForm.tsx` (for COMPUTER devices, each granted user gets "Live stats" and "Power actions" checkboxes, saved with `setComputerGrants` after `setDeviceGrants`), `device/data/documents.ts`, `useDeviceGrants.ts`
- Test: `apps/web/src/device/admin/DeviceAdminSection.test.tsx`

- [ ] **Step 1: Write failing tests**: a PC shows the two checkboxes per granted user, a plug doesn't; saving sends `setComputerGrants` with the ticked flags; unticking a user's access removes their checkboxes.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): per-PC stats and power permissions`

### Task 17: Power actions on the PC page

**Files:**
- Create: `apps/web/src/device/computer/power/PowerActions.tsx`, `ConfirmPowerDialog.tsx`, `usePcPower.ts`, `powerStateText.ts`
- Modify: `ComputerCard.tsx` (row Sleep · Shut down · Restart when `computer.canPower && computer.agent?.connected`)
- Test: `powerStateText.test.ts`, `PowerActions.test.tsx`

**Interfaces:**
- Produces: `powerStateText(s: PcPowerState): string` — COUNTDOWN "Restarting in 45 s… (someone at the PC can cancel)", CANCELLED "Restart cancelled at the PC", EXECUTING "Restarting…", SKIPPED "Another power action is already running" (Sleep / Shut down wording per action: "Going to sleep", "Shutting down").

- [ ] **Step 1: Write failing tests**: the text table; buttons hidden without `canPower` or with the agent offline; Restart asks to confirm ("Restart Office PC? Anyone using it gets a 60 s warning.") then calls `pcPower(RESTART)`; while COUNTDOWN a "Cancel" button calls `pcPowerCancel`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): sleep, shut down and restart from the PC page`

### Task 18: Live stats card

**Files:**
- Create: `apps/web/src/device/computer/stats/PcStatsCard.tsx`, `Gauge.tsx`, `DiskBars.tsx`, `formatStats.ts`, `usePcStats.ts`
- Modify: `DeviceLayout.tsx` (card when `computer.canStats && computer.agent?.connected`)
- Test: `formatStats.test.ts`, `PcStatsCard.test.tsx`

**Interfaces:**
- Produces: `formatBytes(n)` ("7.8 GB"), `formatRate(bytesPerS)` ("1.2 MB/s"), `formatDuration(s)` ("3 d 4 h", "2 h 5 min", "45 s"). Card: gauges CPU / RAM / GPU (GPU only when present, with °C), a bar per disk ("C: 120 GB free of 476 GB"), "↑ 1.2 MB/s ↓ 3.4 MB/s", "Up 3 d 4 h", "Gabriel · idle 12 min" when present; "Waiting for stats…" before the first sample.

- [ ] **Step 1: Write failing tests**: formatter tables; the card subscribes once and shows the numbers from a mocked `pcStats` event; no GPU gauge without `gpu`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): live PC stats`

### Task 19: Routine editor; docs

**Files:**
- Modify: `apps/web/src/routines/editor/PowerChoice.tsx` (PCs with an agent: Wake · Sleep · Shut down), `ActionDialog.tsx`, routine action summary text ("Sleep Office PC"), documents/codegen; `docs/HOME-AGENT.md` (new: what it does, adopt flow, SmartScreen, permissions, uninstall, resource targets, troubleshooting: event log source `HomeAgent`), `docs/WAKE-ON-LAN.md` (link + "The app can't turn PCs off" → "…without the HomeAgent")
- Test: `apps/web/src/routines/editor/ActionDialog.test.tsx`

- [ ] **Step 1: Write failing tests**: a PC with an agent offers Sleep and Shut down (no Restart) and saves `pcPower: SLEEP`; a PC without one offers only Wake.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** + docs.
- [ ] **Step 4: Run** `pnpm test` at the root — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(web): PC sleep and shut down in routines; HomeAgent docs`

## Hand checks after deploy (not automatable)

Adopt Gandalf PC from the app (SmartScreen path), confirm it turns On in the app, check Task Manager (< 20 MB, ~0 % CPU idle), Restart with Cancel at the PC, Sleep from a phone, stats card while gaming (GPU), Remove → agent gone from Services and Program Files.
