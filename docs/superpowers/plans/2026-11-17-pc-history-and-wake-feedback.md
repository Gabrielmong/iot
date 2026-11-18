# PC History & Wake Feedback (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PCs get stored On/Off history, server-tracked wake feedback, a Wake → Remote Desktop button, and honest "can't confirm" states for PCs the probe has never seen — all server-side, nothing installed on the PC.

**Architecture:** The WOL link learns per PC whether any probe port ever answered (`config.probeSeen`) and whether RDP did (`config.rdpSeen`), and reports no `on` while unconfirmable. A new `devices/computers/` module holds `PowerHistory` (Postgres `PowerEvent` rows on On↔Off changes, 30-day retention) and `WakeTracker` (in-memory wake progress, published over the existing `deviceState` subscription). GraphQL `Device` gains `computer: ComputerInfo` and `powerHistory(since)`; the web replaces the 5 s client timer with the server's wake status and adds a history card and RDP button.

**Tech Stack:** TypeScript, Prisma 7 + Postgres, Apollo GraphQL (+ graphql-ws), React + MUI, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-pc-agent-and-history-design.md` (Phase 1 sections only; Phase 2 gets its own plan).

## Global Constraints

- Small files, one responsibility each (project rule); new server code for PCs lives in `apps/server/src/devices/computers/`.
- History: only On↔Off changes are stored, kept **30 days**; only for COMPUTER devices.
- Wake watch: probe every **3 s** for up to **2 min**; result shown **60 s** after it ends, then cleared.
- Wake statuses exactly: `WAKING`, `WOKE` (with seconds), `FAILED`, `UNCONFIRMED`.
- UI copy exactly: "Waking…", "On after {n} s", "Didn't wake", "Wake sent, can't confirm", "Status unknown", "On since {HH:MM}", "Last on {day} {HH:MM}".
- A PC is *confirmable* when `config.probeSeen === true`. Unconfirmable PCs: wake ends `UNCONFIRMED` (never `FAILED`), status line "Status unknown", no history recorded or shown.
- No ping/ARP fallback.
- RDP link format: `rdp://full%20address=s:<ip>`; shown only when `config.rdpSeen === true` and the PC has an IP.
- Guests never see PCs (unchanged).
- Discovery config merge for adopted devices only adds missing fields (`discovery-service.ts` `mergeConfig`) — rely on it; never overwrite `probeSeen`/`rdpSeen` back to false.

## Review Focus

1. **Server restart** with a PC whose last stored event is On and that is still on → no duplicate On event (dedupe against the last stored row). Test in Task 3.
2. **Wake pressed on a PC that is already on** → `WOKE` with 0 s immediately, no 2-min watch. Test in Task 4.
3. **Wake pressed twice** within the watch → the second restarts the watch, only one timer runs, no stale `FAILED` from the first. Test in Task 4.
4. **PC removed** during a wake watch → watch cancelled, nothing published for the removed id. Test in Task 4.
5. **Non-admin with a grant** opens the details page → RDP button works although `Device.ip` is null for them (`ComputerInfo.rdpAddress` carries it). Test in Task 4.

---

### Task 1: Probe that reports which ports answered

**Files:**
- Modify: `packages/protocols/src/net/tcp-probe.ts`
- Modify: `packages/protocols/src/index.ts`
- Test: `packages/protocols/src/net/tcp-probe.test.ts`

**Interfaces:**
- Produces: `probeOpenPorts(host: string, ports: readonly number[], timeoutMs: number): Promise<number[]>` (answered ports, in the order given). `probeTcp` becomes `(await probeOpenPorts(...)).length > 0`.

- [ ] **Step 1: Write the failing test** `probeOpenPorts returns only the ports that accept` — start two local `net.createServer()` listeners on ephemeral ports, close a third; `expect(await probeOpenPorts('127.0.0.1', [a, closed, b], 500)).toEqual([a, b])`.
- [ ] **Step 2: Run** `cd packages/protocols && npx vitest run src/net/tcp-probe.test.ts` — Expected: FAIL (`probeOpenPorts` not exported).
- [ ] **Step 3: Implement** `probeOpenPorts` with the existing `tryConnect`; rewrite `probeTcp` on top; export from `index.ts`.
- [ ] **Step 4: Run** the same command — Expected: PASS (old `probeTcp` tests too).
- [ ] **Step 5: Commit** `feat(protocols): probe which TCP ports answer`

### Task 2: WOL link learns `probeSeen` / `rdpSeen` and watches wakes

**Files:**
- Modify: `apps/server/src/devices/drivers/wol-link.ts`
- Modify: `apps/server/src/devices/drivers/wol.ts`
- Create: `apps/server/src/devices/computers/computer-config.ts`
- Test: `apps/server/test/drivers-wol.test.ts`

**Interfaces:**
- Consumes: `probeOpenPorts` (Task 1).
- Produces:
  - `computer-config.ts`: `probeSeen(d: { config: unknown }): boolean`, `rdpSeen(d: { config: unknown }): boolean`, `RDP_PORT = 3389`.
  - `WolLink` type `Probe` becomes `(host, ports, timeoutMs) => Promise<number[]>`.
  - `WolLink.watchWake(): void` — polls every `WAKE_POLL_MS = 3000` until the PC answers or `WAKE_WATCH_MS = 120_000` passes; a second call restarts it; `stop()` cancels it.
  - `WolDriver.setState(on:true)` calls `watchWake()` instead of `pollNow()`.

Behaviour of a probe result for a PC with an IP:
| answered | confirmable (seen before or now) | reported state |
|---|---|---|
| ≥1 port | yes | `{ online: true, on: true }` |
| none | yes | `{ online: true, on: false }` |
| none | no | `{ online: true }` (no `on`) |

On the first answer ever, report `ctx.discovered({ brand: "WOL", externalId: record.externalId, ip, config: { probeSeen: true } })`; on the first time 3389 is among the answered ports, the same with `{ rdpSeen: true }` (one call may carry both). The link keeps its own `seen` / `rdpSeen` flags (initialised from the record) so it reports each once.

- [ ] **Step 1: Write failing tests** in `drivers-wol.test.ts`:
  - `an unconfirmed PC whose probe fails reports no on` → `lastState == { online: true }`.
  - `the first answer marks the PC probeSeen, once` → probe returns `[445]` twice; `discoveredDevices` has exactly one entry with `config: { probeSeen: true }`; `lastState == { online: true, on: true }`.
  - `RDP answering marks rdpSeen` → probe `[3389]` → discovered config `{ probeSeen: true, rdpSeen: true }`.
  - `a confirmed PC whose probe fails is off` → record `config: { mac, probeSeen: true }`, probe `[]` → `{ online: true, on: false }`.
  - `waking polls every 3 s until the PC answers` (fake timers) → after `setState({on:true})` the probe runs at +3 s, +6 s; once it returns `[445]` no further fast polls before the normal 10 s interval.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run test/drivers-wol.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the table above, `computer-config.ts` helpers, and `watchWake` (use `RetryTimer` rescheduling every 3 s; stop on answer, timeout or `stop()`).
- [ ] **Step 4: Run** the same — Expected: PASS; also `npx vitest run test/api-computers.test.ts test/api-guest-computers.test.ts` still PASS.
- [ ] **Step 5: Commit** `feat(server): WOL link learns probe/RDP reachability and fast-polls after a wake`

### Task 3: Power history storage

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (+ migration `pc_power_events`)
- Create: `apps/server/src/devices/computers/power-history.ts`
- Modify: `apps/server/src/devices/adopted-set.ts` (add `brandOf`)
- Modify: `apps/server/src/devices/manager.ts` (`onState` hook)
- Modify: `apps/server/test/helpers.ts` (add `"PowerEvent"` to TRUNCATE)
- Test: `apps/server/test/power-history.test.ts`

**Interfaces:**
- Produces:
  - Prisma `model PowerEvent { id String @id @default(cuid()); deviceId String; device Device @relation(onDelete: Cascade); on Boolean; at DateTime; source PowerSource @default(PROBE); @@index([deviceId, at]) }`, `enum PowerSource { PROBE AGENT }`.
  - `class PowerHistory { constructor(prisma, now: () => Date); record(deviceId: string, on: boolean, source?: PowerSource): Promise<void>; since(deviceId: string, since: Date): Promise<{ on: boolean; at: Date }[]> }`.
    - `record` skips when the latest stored event for the device has the same `on`; after inserting, deletes that device's events older than 30 days (`HISTORY_DAYS = 30`).
    - `since` returns events with `at >= since` **plus** the latest one before `since` (the state at the window start), oldest first.
  - `AdoptedSet.brandOf(id: string): Brand | undefined`.
  - Manager: in `onState`, when `brandOf(id) === "WOL"` and `typeof state.on === "boolean"` and it differs from the previous cached `on`, queue `history.record(id, state.on)` on `this.writes`. Manager exposes `readonly history: PowerHistory`.

- [ ] **Step 1: Write failing tests** `power-history.test.ts` (uses `resetDb`):
  - `stores only changes` → record true, true, false → 2 rows.
  - `dedupes against the stored row after a restart` → new `PowerHistory` instance, record true after a stored true → still 1 row.
  - `prunes events older than 30 days` → clock at day 0 record true, move 31 days, record false → only the new row.
  - `since includes the state at the window start` → events at 08:00 (on) and 12:00 (off), `since(10:00)` → `[08:00 on, 12:00 off]`.
  - In `api-computers.test.ts`: `a computer's probe changes are recorded` → harness WOL fake reports on then off → `h.manager.history.since(...)` has 2 events; a PLUG's changes record nothing.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run test/power-history.test.ts test/api-computers.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** schema + `npx prisma migrate dev --name pc_power_events`, `PowerHistory`, `brandOf`, manager hook, TRUNCATE list.
- [ ] **Step 4: Run** same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): store PC on/off history`

### Task 4: Wake tracker and `Device.computer` / `Device.powerHistory` in GraphQL

**Files:**
- Create: `apps/server/src/devices/computers/wake-tracker.ts`
- Create: `apps/server/src/devices/computers/computer-info.ts`
- Modify: `apps/server/src/devices/manager.ts`
- Modify: `apps/server/src/graphql/schema.graphql`, `apps/server/src/graphql/mappers.ts`, `apps/server/src/graphql/resolvers/devices.ts`, `apps/server/src/graphql/resolvers/subscriptions.ts`
- Test: `apps/server/test/wake-tracker.test.ts`, `apps/server/test/api-computers.test.ts`

**Interfaces:**
- Consumes: `probeSeen`, `rdpSeen` (Task 2); `PowerHistory` (Task 3).
- Produces:
  - `type WakeProgress = { status: "WAKING" | "WOKE" | "FAILED" | "UNCONFIRMED"; seconds: number | null }`.
  - `class WakeTracker { constructor(opts: { now: () => number; onChange: (deviceId: string) => void; watchMs?: number /*120_000*/; showMs?: number /*60_000*/ }); start(deviceId: string, opts: { hasIp: boolean; confirmable: boolean; alreadyOn: boolean }): void; sawOn(deviceId: string): void; cancel(deviceId: string): void; get(deviceId: string): WakeProgress | null; stopAll(): void }`
    - `start`: no IP → `UNCONFIRMED` at once; `alreadyOn` → `WOKE` 0 s; else `WAKING` and a timer that ends in `FAILED` (confirmable) or `UNCONFIRMED`. Restarting replaces the old timer.
    - `sawOn` while `WAKING` → `WOKE` with whole seconds since start.
    - Every ended state clears after `showMs`. Every change calls `onChange`.
  - `type ComputerInfo = { confirmable: boolean; rdpAddress: string | null; wake: WakeProgress | null }`; `computerInfo(row: Device, wake: WakeProgress | null): ComputerInfo | null` (null unless `kind === "COMPUTER"`; `rdpAddress = rdpSeen(row) && row.ip ? row.ip : null`).
  - Manager: `readonly wakes: WakeTracker`; `setState` on a COMPUTER with `on: true` calls `wakes.start(...)` after the driver call succeeds; `onState` with `on === true` calls `wakes.sawOn`; `onChange` force-publishes `DEVICE_STATE` with the cached state; `removeDevice` cancels; `stop()` calls `stopAll()`. `manager.computerInfo(row)` wraps `computerInfo(row, wakes.get(row.id))`.
  - GraphQL:
    ```graphql
    enum WakeStatus { WAKING WOKE FAILED UNCONFIRMED }
    type WakeProgress { status: WakeStatus!  seconds: Int }
    type ComputerInfo { confirmable: Boolean!  rdpAddress: String  wake: WakeProgress } # rdpAddress: the PC's IP once Remote Desktop answered; shown to anyone who can see the PC
    type PowerEvent { on: Boolean!  at: String! }
    # Device gains:  computer: ComputerInfo   powerHistory(since: String!): [PowerEvent!]!
    ```
    `toApiDevice` takes `computer: ComputerInfo | null` as a fifth argument (both call sites pass `ctx.manager.computerInfo(row)`). `Device.powerHistory` is a field resolver: `[]` unless the parent is a COMPUTER and confirmable; else `manager.history.since(id, new Date(since))` mapped to ISO strings. Invalid `since` → BAD_USER_INPUT.

- [ ] **Step 1: Write failing tests** `wake-tracker.test.ts` (fake clock + timers): `no IP is unconfirmed at once`, `already on wakes in 0 s`, `sawOn reports seconds` (start, +23 s, sawOn → `{WOKE, 23}`), `timeout fails a confirmable PC`, `timeout is unconfirmed for an unconfirmable PC`, `restart replaces the running watch` (start, +100 s, start, +30 s → still WAKING), `results clear after 60 s`, `cancel stops without onChange`.
  In `api-computers.test.ts`: `wake progress reaches subscribers` (wake a confirmed PC with IP, fake probe answers → subscription sees `computer.wake.status` WAKING then WOKE), `a granted user gets rdpAddress though ip is null`, `powerHistory is empty for an unconfirmable PC`, `powerHistory rejects a bad since`.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run test/wake-tracker.test.ts test/api-computers.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** tracker, info, manager wiring, schema, mappers, resolvers.
- [ ] **Step 4: Run** those, then the full server suite `npx vitest run` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(server): wake progress and PC info over GraphQL`

### Task 5: Web — server wake status replaces the client timer

**Files:**
- Modify: `apps/web/src/dashboard/data/documents.ts` (fragment adds `computer { confirmable rdpAddress wake { status seconds } }`), then `pnpm --filter @home/web codegen`
- Create: `apps/web/src/dashboard/lib/computerStatus.ts`
- Modify: `apps/web/src/dashboard/lib/stateLine.ts`, `apps/web/src/dashboard/tile/DeviceTile.tsx`, `apps/web/src/dashboard/tile/ComputerTileAction.tsx`, `apps/web/src/device/computer/ComputerCard.tsx`
- Delete: `apps/web/src/dashboard/tile/useWaking.ts`
- Test: `apps/web/src/dashboard/lib/computerStatus.test.ts`, `stateLine.test.ts`, `DeviceTile.test.tsx`, `ComputerCard.test.tsx`

**Interfaces:**
- Produces: `computerStatus(d: Device): string | null` — wake text when `computer.wake` is set (`WAKING` → "Waking…", `WOKE` → "On after {seconds} s", `FAILED` → "Didn't wake", `UNCONFIRMED` → "Wake sent, can't confirm"), else null. `stateLine` for a computer with `state.on == null` returns "Status unknown". Tile and card show `computerStatus(d) ?? stateLine(d)`; `ComputerTileAction` takes `waking: boolean` from `wake?.status === 'WAKING'`. When `FAILED`, the card links "Check the setup checklist" (admins: scrolls to the existing `WakeSetupChecklist`).

- [ ] **Step 1: Write failing tests**: `computerStatus` table test for the four statuses + null; `stateLine` → "Status unknown"; DeviceTile shows "Waking…" from a device with `wake: { status: 'WAKING' }` and no timer; ComputerCard shows "Didn't wake" + checklist link for admins.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/dashboard src/device/computer` — Expected: FAIL.
- [ ] **Step 3: Implement**; remove `useWaking` and its imports.
- [ ] **Step 4: Run** same + `npx tsc --noEmit -p .` + `pnpm lint` — Expected: PASS, no errors.
- [ ] **Step 5: Commit** `feat(web): show server-tracked wake progress for PCs`

### Task 6: Web — Remote Desktop button

**Files:**
- Create: `apps/web/src/device/computer/RemoteDesktopButton.tsx`, `apps/web/src/device/computer/rdpLink.ts`, `apps/web/src/device/computer/useWakeThenOpen.ts`
- Modify: `apps/web/src/device/computer/ComputerCard.tsx`
- Test: `apps/web/src/device/computer/rdpLink.test.ts`, `RemoteDesktopButton.test.tsx`

**Interfaces:**
- Consumes: `computer.rdpAddress`, `computer.wake`, `usePatchDevice`.
- Produces: `rdpLink(address: string): string` → `rdp://full%20address=s:${address}`. `useWakeThenOpen(device): { start(): void; pending: boolean }` — if `state.on` → open at once (`window.location.assign`); else patch `{ on: true }` and open when `wake.status` becomes `WOKE`; give up silently on `FAILED`/`UNCONFIRMED`. Button "Remote Desktop" rendered only when `rdpAddress` is non-null; disabled + "Waking…" while pending.

- [ ] **Step 1: Write failing tests**: `rdpLink('192.168.0.150') === 'rdp://full%20address=s:192.168.0.150'`; button hidden without `rdpAddress`; with the PC on, click calls `location.assign` with the link; with the PC off, click patches `{ on: true }` and opens only after a rerender with `wake.status = 'WOKE'`.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/device/computer` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): wake-then-Remote-Desktop button for PCs`

### Task 7: Web — history card

**Files:**
- Create: `apps/web/src/device/computer/history/powerSegments.ts`, `PowerHistoryCard.tsx`, `PowerTimeline.tsx`, `powerSummary.ts`, `usePowerHistory.ts`
- Modify: `apps/web/src/device/data/documents.ts` (query `PowerHistory($id: ID!, $since: String!) { device(id: $id) { id powerHistory(since: $since) { on at } } }`), codegen; `apps/web/src/device/DeviceLayout.tsx` (render the card under `ComputerCard` for computers)
- Test: `powerSegments.test.ts`, `powerSummary.test.ts`, `PowerHistoryCard.test.tsx`

**Interfaces:**
- Produces:
  - `powerSegments(events: { on: boolean; at: string }[], from: Date, to: Date): { start: Date; end: Date; on: boolean | null }[]` — clipped to `[from, to]`; time before the first event is `on: null` (unknown).
  - `powerSummary(events, state: { on: boolean | null }, now: Date): string | null` — on: "On since HH:MM" (from the latest On event; prefix weekday name when not today); off: "Last on {Today|Yesterday|weekday} HH:MM" (latest Off event's time); null with no events.
  - `usePowerHistory(deviceId, range: '24h' | '7d')` — queries with `since = now − range`; refetches when `device.state.on` changes.
  - `PowerHistoryCard({ device })`: unconfirmable → hint "History needs the server to reach this PC: allow it through the firewall, or adopt the PC with the agent."; else summary + 24 h / 7 days toggle + `PowerTimeline` (horizontal bar, green on / grey off / hatched unknown).
- [ ] **Step 1: Write failing tests**: `powerSegments` (clip, unknown prefix, consecutive events), `powerSummary` ("On since 18:42", "Last on Yesterday 23:10", null), card shows the hint when `confirmable: false`.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/device/computer/history` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** same + `npx tsc --noEmit -p .` + `pnpm lint` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): PC on/off history card`

### Task 8: Docs

**Files:**
- Modify: `docs/WAKE-ON-LAN.md` (section "Online status" explains confirmable PCs, "Status unknown", and the scoped firewall rule `New-NetFirewallRule -DisplayName "Home server presence check (SMB)" -Direction Inbound -Protocol TCP -LocalPort 445 -RemoteAddress 192.168.0.100 -Action Allow`); `apps/web/src/device/computer/wakeSetupSteps.ts` (new step: "Let the home server see the PC: allow port 445 (or Remote Desktop) from the server") — keep the two in step as the doc says.
- Test: `apps/web/src/device/computer/ComputerCard.test.tsx` (checklist shows the new step).

- [ ] **Step 1: Write failing test** — checklist contains "Let the home server see the PC".
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/device/computer` — Expected: FAIL.
- [ ] **Step 3: Update** both files.
- [ ] **Step 4: Run** same, then `pnpm test` at the root — Expected: all PASS.
- [ ] **Step 5: Commit** `docs: PC presence check and history`
