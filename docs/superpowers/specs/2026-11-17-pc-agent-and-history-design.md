# PCs: history, wake feedback, and the HomeAgent (power + live stats)

Date: 2026-11-17 · Status: draft for approval

## Why

PCs in the app can only be woken today, and their On/Off state comes from a port probe that many Windows
PCs block (Gandalf PC shows Off while in use: Public network profile, SMB blocked, RDP off). The owner
wants PCs to be first-class: see when they were on, get real feedback after waking, put them to sleep /
shut them down / restart them from the app, and see live stats, without making each PC heavier.

## Goals

**Phase 1: server only (no install on the PC)**
1. **On/off history**: every On↔Off change of a PC is stored; the details page shows "On since 18:42" /
   "Last on yesterday 23:10" and a 24 h / 7 day timeline.
2. **Wake feedback**: after Wake, the server follows the wake and reports *Waking… → On after 23 s* or
   *Didn't wake in 2 min* (with a hint pointing at the setup checklist). Replaces the client-side timer.
3. **Wake → Remote Desktop**: a button that wakes the PC (if needed) and, once port 3389 answers, opens an
   `rdp://full%20address=s:<ip>` link. Shown only once the server has seen 3389 answer at least once.

**Phase 2: the HomeAgent**
4. **Adopt this PC**: opened in the app *on the PC itself*, it downloads the agent with a one-time pairing
   code; running it installs a Windows service that pairs with the server and creates (or attaches to)
   the PC's device with name, IP and MAC filled in.
5. **Power actions**: Sleep, Shut down, Restart, with a countdown warning on the PC that the person there
   can cancel.
6. **Live stats**: CPU %, RAM, GPU load/temp (NVIDIA when available), disk free per fixed drive, network
   up/down rate, uptime, signed-in user and idle time.
7. **Permissions** per PC: *See & wake* (today's grant), *Live stats*, *Power actions*.

## Non-goals

- Remote view / screenshots, file transfer, running commands, media control, notifications. (Later
  ideas; the agent must not grow a general "run anything" channel.)
- macOS / Linux agents. Windows 10/11 x64 only.
- Agent access for guests: guests never see PCs (existing rule) and never get stats or power.
- Code signing the agent (no certificate). SmartScreen will warn on first run; documented.

## Anti-goals (would be a failure even if it works)

- An agent that is noticeably heavy: target **< 20 MB RAM idle, ~0 % CPU idle, < 10 MB on disk**.
- Any way for an app user to run arbitrary code on a PC through the agent.
- A shutdown/restart that kills someone's work without warning when they are at the PC.
- Requiring firewall changes on the PC.

## Constraints

- LAN only, plain HTTP server at 192.168.0.100 (no TLS today). Stack: TS / React+MUI / Apollo GraphQL /
  Prisma+Postgres; the agent is the one deliberate exception (Go), because a Node agent would be ~70 MB
  and far heavier at runtime.
- Small files, separation of concerns (project rule).
- Releases ship like the Android app: GitHub Actions builds, the deployer syncs the artifact into
  `C:\HomeControl\shared\…`, the server serves it.

## Approaches considered

**Agent language** (picked: **Go**)
| | Go | Rust | C# .NET AOT | Node SEA |
|---|---|---|---|---|
| Size / idle RAM | ~6–8 MB / ~10–15 MB | ~2–4 / ~3–6 | ~8–12 / ~20–30 | ~70 / ~40–60 |
| Notes | mature service + stats libs, fast CI cross-compile from Linux | smallest, slow builds, harder to maintain | best Windows APIs, but WinForms/WPF not AOT-friendly | matches the stack; fails "small" |

Go was picked: light enough, simple to build next to the Android job, easy to maintain.

**Connection** (my call): the agent dials **out** to the server over a WebSocket, rather than the server
connecting in. No inbound firewall rule on any PC; a live socket is also the best "PC is on" signal.

**Countdown UI** (my call): a service runs in session 0 and can't draw on the desktop, so the same exe has
a `prompt` mode the service launches in the active user session (`WTSQueryUserToken` +
`CreateProcessAsUser`), showing a native Windows Task Dialog with a countdown and a Cancel button.

## Design

### Phase 1 (server only)

**History storage**: new table `PowerEvent { id, deviceId → Device (cascade), on Boolean, at DateTime,
source enum PROBE|AGENT|WAKE }`. Written by the device manager when a COMPUTER's cached `on` changes (not on
every probe). Kept 30 days (daily cleanup on the existing sweep timer). GraphQL: `Device.powerHistory(since)`
for COMPUTER devices, readable by anyone who can see the device.

**Wake feedback**: `setDeviceState(on:true)` on a COMPUTER starts a server-side *wake watch* (per device,
replaces any running one): it probes every 3 s for up to 2 min, publishing a `wake` field on the device
(`WAKING` / `WOKE` with seconds / `FAILED` / `UNCONFIRMED`) over the existing device-state subscription. `useWaking`'s
timer is replaced by this field. A PC with no IP: watch can't probe → state stays "Wake sent" as today.
With an agent paired, the watch ends when the agent connects.

**PCs the probe can't see** (decided with the owner): a PC is *confirmable* once any probe port has
answered at least once (`config.probeSeen = true`) or it has an agent. Until then, a wake ends as
`UNCONFIRMED` ("Wake sent, can't confirm"), never `FAILED`; its status line says "Status unknown" rather
than Off; and its history is not recorded or shown (with a hint: allow the server through the firewall,
or adopt the PC with the agent). No ping/ARP fallback (unreliable with ARP offload on sleeping NICs).

**Wake → Remote Desktop**: the probe already tries 3389; record per device `config.rdpSeen = true` the
first time 3389 answers (needs a probe that reports *which* port answered). Button on the details page
(and tile menu) when `rdpSeen`: wakes if Off, waits for the wake watch, then opens the `rdp://` link.
Works where the client OS handles `rdp://` (Windows with the Remote Desktop app, Android RD client).

### Phase 2 (HomeAgent)

**Adopt this PC flow**
```
App on the PC → Admin › Devices › Add › "Adopt this PC"
  server creates AgentEnrollment { code (random 128-bit), createdBy, expiresAt = now+30 min, usedAt? }
  browser downloads  /agent/HomeAgent-<code8>.exe
     (the exe has the server URL + code appended in a small trailer the agent reads at start;
      the binary itself is the published one, unchanged otherwise)
  user runs it (UAC prompt) → agent copies itself to C:\Program Files\HomeAgent\, registers the
     "HomeAgent" service (auto start, LocalSystem), starts it, exits
  service → POST /agent/enroll { code, hostname, macs[], ips[], os, agentVersion }
     server: code valid & unused → finds an existing WOL device with a matching MAC, else creates
     one (brand WOL, kind COMPUTER, adopted, name = hostname); stores a per-agent token (hashed) in
     Device.secret; marks enrollment used → returns { deviceId, token }
  agent stores token in C:\ProgramData\HomeAgent\agent.json (ACL: SYSTEM + Administrators only)
```
Admin-only (the person adopting is signed in as an admin on that PC). Adopting a PC that already has an
agent replaces its token (re-pair). A Remove of the device tells a connected agent to uninstall itself;
also `HomeAgent.exe uninstall` locally.

**MAC addresses** (my call): the agent reports every physical adapter (virtual ones such as Hyper-V,
VPN, WSL and loopback are filtered by the agent) and picks a **wake MAC**: the wired adapter that is up,
else the first wired adapter, else Wi-Fi. The device keeps `externalId` = its existing MAC (manually
added PCs) or the wake MAC (PCs created by enrollment); `config.mac` stays the single MAC the WOL driver
wakes and is set to the agent's wake MAC; `config.macs` lists every reported MAC and is only used to
match "attach to existing" at enrollment. The Edit computer dialog keeps editing `config.mac` only and
must merge (not overwrite) `config`.

**Removal → self-uninstall** (decided with the owner): removing a PC that has an agent writes an
`AgentRemoval { tokenHash, createdAt }` record that outlives the device. Whenever an agent connects (now
or later), a token matching a removal record gets `uninstall`; the agent removes its service and files,
acks, and the record is deleted. Records expire after 90 days. A connected agent gets `uninstall` at once.

**Token rejected without a removal record** (my call): the agent never uninstalls on its own, so a DB
restore or key change can't wipe every agent; it retries once an hour and logs to the Windows event log.
Only an explicit Remove triggers self-uninstall. `HomeAgent.exe uninstall` (or Apps & features) also
removes it locally.

**Connection**: `ws://<server>/agent/ws` with `Authorization: Bearer <token>`. Agent sends a hello
(version, hostname, IPs, MACs), then a heartbeat every 30 s. Reconnect with backoff (1 s → 60 s).
Server marks the PC On while the socket is up; on drop it falls back to the existing port probe (which
may say Off for firewalled PCs, correctly so when the PC is asleep/off). IP/MAC changes in hello update
the device (MAC only added, never removed, as WoL needs it).

**Messages** (JSON, versioned `v:1`; a closed set — no generic exec):
- server → agent: `stats.start {intervalMs}`, `stats.stop`, `power {action: sleep|shutdown|restart, id,
  requestedBy}`, `power.cancel {id}`, `uninstall`.
- agent → server: `hello`, `heartbeat`, `stats {…}`, `power.state {id, phase: countdown|cancelled|
  executing|skipped, secondsLeft?}`.

**Stats only when watched**: the server sends `stats.start` (2 s interval) when the first viewer with
*Live stats* permission subscribes to that PC's stats, and `stats.stop` 10 s after the last leaves. No
stats are stored (live only). GraphQL subscription `pcStats(deviceId)`.

**Power actions**: GraphQL `pcPower(deviceId, action)`. Agent behaviour:
- Someone signed in and session unlocked → launch prompt mode in that session: "‹User› is restarting
  this PC in 60 s" with **Cancel** and **Do it now**. Cancel → `power.state cancelled`; app shows
  "Restart cancelled at the PC" to the requester.
- Nobody signed in, or locked → act immediately.
- Sleep uses `SetSuspendState`; shutdown/restart `InitiateSystemShutdownEx` (force apps after the
  countdown).
- Sleep/shutdown also allowed as routine actions (PowerChoice gains Sleep / Shut down for PCs with an
  agent); routine-triggered actions show "Routine ‹name›" as requester.

**Permissions**: `DeviceGrant` gains `stats Boolean @default(false)` and `power Boolean @default(false)`.
Admins implicitly have all. Guests: unchanged (never PCs). Device access dialog for COMPUTER devices shows
the two extra checkboxes. Personal routines may only use power actions on PCs their owner has `power` on
(checked at save and at run).

**Distribution**: `agent.yml` workflow builds `GOOS=windows GOARCH=amd64` on Ubuntu, publishes release
`agent-v<1000+run_number>` with `HomeAgent.exe`. Deployer syncs it to `C:\HomeControl\shared\agent\`
(like the APK). The server serves it with the per-enrollment trailer. **Auto-update**: hello carries the
agent version; when older than the published one the server sends `update {url, sha256}`; the agent
downloads, verifies the hash, swaps the exe and restarts its service (via a short-lived helper process).

**UI**
- Details page (COMPUTER): status + "On since…", Wake / Remote Desktop buttons, a power row (Sleep · Shut
  down · Restart, with a confirm dialog) when the user has *Power*, a stats card (gauges for CPU/RAM/GPU,
  disk bars, net rates, user + idle) when *Live stats*, and the history timeline.
- Tile: unchanged look; status line uses the wake feedback.
- Admin › Devices › Add: new "Adopt this PC" entry with a short explanation (run on the PC you want to
  add; SmartScreen: "More info → Run anyway").

## Left to the builder

- Go libraries (e.g. `golang.org/x/sys/windows/svc`, `gopsutil`, `nhooyr.io/websocket`/`coder/websocket`),
  GPU via NVML when present, otherwise omitted.
- Exact stats payload shape, gauge visuals, timeline component.
- Trailer format for the code (as long as the published exe hash stays verifiable minus the trailer).
- How the WebSocket endpoint is mounted next to the existing GraphQL WS server.

## Rollout

Phase 1 ships first and is useful alone. Phase 2 lands behind the "Adopt this PC" entry; existing
manually added PCs keep working unchanged and can be adopted later (matched by MAC).
