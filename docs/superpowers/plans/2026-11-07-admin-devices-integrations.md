# Admin Devices & Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the admin Devices page into a filterable, sortable table with a "New on network" strip that offers a Test switch over an in-memory trial connection, and split Integrations into one routed sub-tab per integration showing its devices and when it last synced.

**Architecture:**
- **Server:**
  - `AdminDevice` gains `online`, `testable` and `testBlockedReason`.
  - `DeviceManager` gains in-memory **trial links**: an un-adopted device is fed to its driver alongside the adopted ones, but its state is never published or cached as adopted. Trials expire after 2 minutes idle.
  - `IntegrationStatus` gains last-synced timestamps stored as `Setting` rows.
- **Web:**
  - Pure `lib/` functions do the status, search, filter and sort.
  - The Devices page is recomposed from small components.
  - Integrations uses nested routes `/admin/integrations/:integration`.

**Tech Stack:**
- Server: Prisma/Postgres, GraphQL (`@graphql-tools/schema`), Vitest with `ApiHarness` + `FakeDriver`.
- Web: React 19, MUI 9, Apollo 4, react-router 8, framer-motion 14.6.0, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-07-admin-devices-integrations-design.md`

## Global Constraints

- **Base branch:** `dashboard-layouts`. Work happens in a git worktree on the new branch `admin-pages` (the user asked for a worktree).
- **Trial idle timeout:** exactly 2 minutes. "Offline" for an un-adopted device means no sighting (`lastSeenAt`) in the last 5 minutes.
- **Reason order and copy (final):**
  1. CAMERA: "Cameras can't be switched"
  2. TUYA without a key: "Needs the Tuya key first"
  3. KASA with status `NEEDS_CREDENTIALS`: "Needs TP-Link sign-in first"
  4. UNKNOWN: "This kind of device can't be switched"
  5. not seen in 5 min: "Device is offline"
- **Table status:** one value per device. "Needs setup" (any status ≠ OK) wins; otherwise "Online" or "Offline" from live `online`.
- **Integration slugs** are `tuya`, `kasa` and `swann`. Their labels are "Tuya cloud", "TP-Link (Kasa)" and "Swann recorder".
- **Copy:**
  - Empty states: "No devices match" (with "Clear filters"), "No devices use this yet."
  - Last synced shows "Never" when there is no timestamp.
- **Trial isolation:** trial devices never appear in `devices` / `device` queries, never publish `DEVICE_STATE` or `DEVICES_CHANGED`, and never get rows written by the trial itself.
- **Code style:** small single-purpose files, with pure logic in `lib/` and its own tests (project rule). There are no new npm dependencies.

## Review Focus

1. **Adopting a device while its trial is running.** Expected: it continues as a normal adopted link, the trial entry is gone, and no duplicate link is created. Test in Task 2.
2. **A trial whose device stops answering, or whose tab is closed.** Expected: the server drops it after 2 minutes idle, and later driver reports for it are ignored. Test in Task 2.
3. **A non-admin calling the trial mutations, or a trial on an adopted or untestable device.** Expected: FORBIDDEN, or BAD_USER_INPUT carrying the reason. Test in Task 2.
4. **Filters that hide everything, then the data changing (a device adopted from the strip).** Expected: the table updates, counts update, and "Clear filters" restores everything. Test in Task 5.
5. **An unknown `/admin/integrations/xyz`, or a bookmark to a tab.** Expected: an unknown slug redirects to the first unconfigured integration (else Tuya), and a known slug opens that tab directly. Test in Task 7.

---

### Task 0: Worktree

- [ ] **Step 1:** From the repo root, run `git worktree add ../iot-admin-pages -b admin-pages dashboard-layouts`.
- [ ] **Step 2:** In the worktree, run `pnpm install` (the root `.env` is read via `../../.env` from `apps/server`; copy the repo-root `.env` into the worktree root).
- [ ] **Step 3:** Run `pnpm --filter @home/web codegen` and `pnpm --filter @home/server test -- layout`. Expected: PASS. This proves the DB and env work in the worktree.

---

### Task 1: Server — status and test fields on AdminDevice

**Files:**
- Create: `apps/server/src/services/test-reason.ts`
- Modify:
  - `apps/server/src/graphql/schema.graphql`: on `AdminDevice` add `online: Boolean!  testable: Boolean!  testBlockedReason: String`
  - `apps/server/src/graphql/mappers.ts`: `toApiAdminDevice` takes `online: boolean` and `now: Date`
  - the `adminDevices` resolver, and every resolver that returns `AdminDevice`, to pass `ctx.manager.getState(id).online` and `ctx.deps.now()`
- Test: `apps/server/test/test-reason.test.ts`, `apps/server/test/api-admin-devices-status.test.ts`

**Interfaces:**
- Produces `export function testBlockedReason(device: Pick<Device, "kind" | "brand" | "secret" | "status" | "lastSeenAt">, now: Date): string | null`. It applies the Global Constraints order and returns null when the device is testable.
- `testable` = `!adopted && testBlockedReason(...) === null`. For adopted devices `testBlockedReason` is null and `testable` is false.

- [ ] **Step 1: Write failing unit tests**, one per reason plus testable:
  - A camera returns "Cameras can't be switched" even when its other fields are fine.
  - An UNKNOWN Tuya device without a key returns "Needs the Tuya key first".
  - A Kasa device with `NEEDS_CREDENTIALS` returns "Needs TP-Link sign-in first".
  - An UNKNOWN Kasa device that is OK returns "This kind of device can't be switched".
  - A PLUG with `lastSeenAt` 6 minutes ago returns "Device is offline". At 4 minutes it returns null.
- [ ] **Step 2: Write a failing API test.** Query `adminDevices { id online testable testBlockedReason }`:
  - An un-adopted Kasa plug seen just now gives `testable:true`.
  - An adopted device whose FakeDriver pushed `{online:true}` gives `online:true`.
  - A camera gives `testable:false` and the reason.
- [ ] **Step 3: Run `pnpm --filter @home/server test -- test-reason admin-devices-status` and confirm it FAILS.**
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run the server suite.** Expected: PASS. Commit with `feat(server): admin device online and test availability`.

---

### Task 2: Server — trial connections

**Files:**
- Create: `apps/server/src/devices/trial-set.ts`, `apps/server/src/graphql/resolvers/trials.ts`
- Modify:
  - `apps/server/src/devices/manager.ts`
  - `apps/server/src/devices/device-records.ts`: add `byIds(ids)`
  - `apps/server/src/graphql/schema.graphql`, `apps/server/src/graphql/resolvers/index.ts`
  - `apps/server/test/api-harness.ts`: pass `now: () => new Date(h.time)` to the manager
- Test: `apps/server/test/trial-set.test.ts`, `apps/server/test/api-device-trials.test.ts`

**Interfaces:**
- SDL:
  ```graphql
  type DeviceTrial { deviceId: ID!  state: DeviceState! }
  # Mutation (admin)
  startDeviceTrial(id: ID!): DeviceTrial!
  setTrialState(id: ID!, on: Boolean!): DeviceTrial!
  endDeviceTrial(id: ID!): Boolean!
  ```
- `TrialSet` (pure, clock injected):
  - `touch(id, brand, now)`
  - `remove(id)`
  - `has(id)`
  - `ids(brand): string[]`
  - `expired(now): string[]`, using a 120 000 ms idle timeout
  - `TRIAL_IDLE_MS = 120_000`
- `DeviceManager` gains an option `now?: () => Date` and these methods:
  - `startTrial(id: string): Promise<DeviceState>`
    - Validates that the device exists, is not adopted, and has `testBlockedReason === null`. Otherwise it throws BAD_USER_INPUT with the reason, or "Device is already adopted".
    - Touches the trial and syncs the brand's driver. The trial devices are passed in `driver.sync` together with the adopted ones.
    - Waits up to `commandTimeoutMs` for a state report, then returns `trialState(id)`, which is `{online:false}` if none arrived.
  - `setTrialState(id: string, on: boolean): Promise<DeviceState>`: requires an active trial (else BAD_USER_INPUT "No test running"), runs `runCommand(driver, record, {on})`, touches the trial, and returns the state.
  - `endTrial(id: string): Promise<void>`: removes the trial and re-syncs.
  - `sweepTrials(): Promise<void>`: ends expired trials. It is called by a 15 s interval started in `start()` and cleared in `stop()`. Tests call it directly.
- **Isolation rules inside the manager:**
  - `onState` for a trial id writes to a separate `trialStates` map and never calls `publishState` or `cache.set`.
  - `onStatus` for trial ids is ignored.
  - `syncDriver` drops trial ids that are now adopted. This covers Review Focus 1.

- [ ] **Step 1: Write failing `trial-set` unit tests:**
  - touch, then expired at 119 s, gives `[]`; at 120 s it gives `[id]`
  - a second touch renews the expiry
  - remove works
  - `ids` is per brand
- [ ] **Step 2: Write failing API tests** in `api-device-trials.test.ts`, using `h.drivers.KASA`:
  - `"starts a trial and returns the device's real state"`:
    - Un-adopted Kasa plug; `syncImpl` pushes `{online:true,on:true}` for it.
    - The result has `state.on === true`.
    - The last `synced` list contains the trial device.
    - No `DEVICE_STATE` was published (spy on `h.pubsub.publish`).
  - `"switches a trial device"`: `setTrialState(on:false)` gives `h.drivers.KASA.commands` ending `{deviceId, patch:{on:false}}`.
  - `"keeps trial devices out of the devices query and dashboards"`: `devices` doesn't include the device for the admin.
  - `"ends a trial on request and after 2 minutes idle"`:
    - On request: after `endDeviceTrial`, the last sync excludes the device.
    - Idle: start, `h.time += 120_000`, `await h.manager.sweepTrials()`, the last sync excludes it, and `setTrialState` gives BAD_USER_INPUT.
  - `"adopting during a trial continues as adopted"`: start the trial, then `adoptDevice`. The last sync has the device once, and `adminDevices` shows `adopted:true`.
  - `"rejects non-admins, adopted and untestable devices"`:
    - A USER gets FORBIDDEN.
    - An adopted device gets BAD_USER_INPUT.
    - A camera gets BAD_USER_INPUT with the message "Cameras can't be switched".
- [ ] **Step 3: Run `pnpm --filter @home/server test -- trial` and confirm it FAILS.**
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run the full server suite.** Expected: PASS, including the existing `device-manager*` tests. Commit with `feat(server): in-memory trial connections for un-adopted devices`.

---

### Task 3: Server — last synced timestamps

**Files:**
- Modify:
  - `apps/server/src/settings-keys.ts`: add `tuyaLastSyncAt: "tuya.lastSyncAt"`, `kasaLastSavedAt: "kasa.lastSavedAt"` and `swannLastSyncAt: "swann.lastSyncAt"`, stored like the other settings
  - `apps/server/src/services/integrations.ts`: `integrationStatus` returns the three ISO strings or null
  - `apps/server/src/services/tuya-sync.ts`, `setKasaCredentials`, `apps/server/src/services/swann.ts`: write `deps.now().toISOString()` on success
  - `apps/server/src/graphql/schema.graphql`: on `IntegrationStatus` add `tuyaLastSyncAt: String  kasaLastSavedAt: String  swannLastSyncAt: String`
- Test: `apps/server/test/api-integrations-last-sync.test.ts`

- [ ] **Step 1: Write failing tests.**
  - With nothing synced, all three are null.
  - After a successful `syncTuyaKeys` (using the harness `tuyaCloud` fake), `tuyaLastSyncAt` equals `new Date(h.time).toISOString()`.
  - Likewise after `setKasaCredentials` and `setSwannRecorder` (using the harness fakes).
  - A failing Swann probe leaves `swannLastSyncAt` null.
- [ ] **Step 2: Run `pnpm --filter @home/server test -- last-sync` and confirm it FAILS.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full server suite.** Expected: PASS. Commit with `feat(server): integration last-synced timestamps`.

---

### Task 4: Web — device list logic

**Files:**
- Create: `apps/web/src/admin/lib/deviceStatus.ts`, `apps/web/src/admin/lib/deviceQuery.ts`
- Modify: `apps/web/src/admin/data/documents.ts` (add `online testable testBlockedReason` to `AdminDeviceFields`); run codegen
- Test: `apps/web/src/admin/lib/deviceStatus.test.ts`, `apps/web/src/admin/lib/deviceQuery.test.ts`

**Interfaces:**
- `deviceStatus.ts`:
  - `export type DeviceHealth = 'online' | 'offline' | 'setup'`
  - `export function deviceHealth(d: Pick<AdminDevice,'status'|'online'>): DeviceHealth`
  - `export const HEALTH_LABEL: Record<DeviceHealth,string>` = Online / Offline / Needs setup
  - `export function healthCounts(devices): Record<DeviceHealth, number>`
- `deviceQuery.ts`:
  - `export type DeviceFilters = { search: string; room: string | 'any' | 'none'; kind: DeviceKind | 'any'; health: DeviceHealth | 'any' }`
  - `export type SortKey = 'name' | 'room' | 'model' | 'ip' | 'health' | 'lastSeen'`
  - `export type Sort = { key: SortKey; dir: 'asc' | 'desc' }`
  - `export const DEFAULT_SORT: Sort = { key: 'room', dir: 'asc' }`
  - `export function filterDevices(devices, filters): AdminDevice[]`: search is case-insensitive over name, model, ip and room name.
  - `export function sortDevices(devices, sort): AdminDevice[]`:
    - Room sorts break ties by name.
    - "No room" sorts last.
    - `lastSeen` sorts newest first when `asc` (most recent is top).
  - `export const NO_FILTERS: DeviceFilters`

- [ ] **Step 1: Write failing tests:**
  - health precedence: `NEEDS_KEY` + offline gives `setup`
  - counts
  - search for `"pepe"` matches "Cámara Pepe"; accent-insensitive is not required
  - the room `'none'` filter
  - the kind filter
  - the default sort is room then name, with no room last
  - reversing direction
- [ ] **Step 2: Run `pnpm --filter @home/web test -- admin/lib/device` and confirm it FAILS.**
- [ ] **Step 3: Implement, then run codegen.**
- [ ] **Step 4: Run the tests.** Expected: PASS. Commit with `feat(web): admin device status, filter and sort logic`.

---

### Task 5: Web — Devices page table and toolbar

**Files:**
- Create:
  - `apps/web/src/admin/devices/DevicesToolbar.tsx`: search, three `NativeSelect` filters, health count chips (clicking one sets the health filter), and the "Add Kasa by IP" button
  - `apps/web/src/admin/devices/DevicesTable.tsx`: sortable headers using MUI `TableSortLabel`, and rows animated with framer-motion `layout`
  - `apps/web/src/admin/devices/DeviceTableRow.tsx`
  - `apps/web/src/admin/devices/DeviceCompactRow.tsx`: the phone two-line row
  - `apps/web/src/admin/devices/HealthChip.tsx`
  - `apps/web/src/admin/devices/KindIcon.tsx`
  - `apps/web/src/admin/devices/useDeviceQueryState.ts`: filters and sort state
- Modify: `apps/web/src/admin/DevicesPage.tsx` (composition only), `apps/web/src/admin/AdminLayout.tsx` (widen to `maxWidth: 1200`)
- Keep: `KasaHint` (shown above the toolbar under the same condition as today), the adopt flow and `DeviceDialogs`, and `DeviceMenu` as the row's ⋯ action.
- Delete: `apps/web/src/admin/devices/DeviceSection.tsx` and `DeviceRow.tsx` once nothing imports them. `StatusChip` is replaced by `HealthChip`.
- Test: update `apps/web/src/admin/DevicesPage.test.tsx`

**Interfaces:**
- Consumes Task 4's functions.
- The table renders `role="table"` with the accessible name "Your devices".
- Phone layout: `useMediaQuery(theme.breakpoints.down('sm'))` gives `DeviceCompactRow` items in a `role="list"` named "Your devices".

- [ ] **Step 1: Update and write failing tests** in `DevicesPage.test.tsx`. Keep the existing adopt and menu tests, adjusted to the new roles.
  - `"lists adopted devices in a table sorted by room then name"`
  - `"filters by search, room, type and status, and clears filters"`: this test shows the "No devices match" row and the Clear filters button.
  - `"shows Needs setup and Offline counts and filters on click"`
  - `"sorts by a column and reverses on second click"`
  - `"uses compact rows on a phone"`: stub `window.matchMedia` to match `max-width` queries, then expect a `list` named "Your devices" and no `table`.
  - `"updates the table and counts after adopting from the strip"`, for Review Focus 4.
- [ ] **Step 2: Run `pnpm --filter @home/web test -- DevicesPage` and confirm it FAILS.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full web suite, `pnpm --filter @home/web lint` and typecheck.** Expected: PASS. Commit with `feat(web): admin devices table with search, filters and sorting`.

---

### Task 6: Web — New on network strip with Test

**Files:**
- Create:
  - `apps/web/src/admin/devices/NewDevicesStrip.tsx`
  - `apps/web/src/admin/devices/NewDeviceCard.tsx`
  - `apps/web/src/admin/devices/TestControl.tsx`
  - `apps/web/src/admin/data/useDeviceTrial.ts`
  - trial documents in `apps/web/src/admin/data/documents.ts`
- Modify: `apps/web/src/admin/DevicesPage.tsx`
- Test: `apps/web/src/admin/devices/TestControl.test.tsx`, `apps/web/src/admin/data/useDeviceTrial.test.tsx`

**Interfaces:**
- `useDeviceTrial(deviceId)` returns `{ phase: 'idle' | 'starting' | 'ready' | 'error'; on: boolean | null; error: string | null; start(): void; set(on: boolean): void }`.
  - It calls `endDeviceTrial` on unmount when the trial was started.
  - Errors use the server message, which includes the reason text.
- `TestControl` takes `{ device: AdminDevice }`.
  - When `!device.testable`, it shows a disabled "Test" button with the reason as visible caption text.
  - When idle, it shows a "Test" button. Pressing it starts the trial.
  - When ready, it shows a `Switch` labelled "Test {name}" that reflects `on`.
  - When starting, it shows a small spinner.
- `NewDeviceCard` shows the kind icon, name, brand, model and ip, then `TestControl`, then an "Adopt" button (aria-label "Adopt {name}", which the existing tests use).

- [ ] **Step 1: Write failing tests:**
  - an untestable device shows a disabled Test button with the text "Needs the Tuya key first"
  - pressing Test calls `StartDeviceTrial` and then shows a switch checked from the returned state
  - toggling calls `SetTrialState {id, on:false}`
  - unmount calls `EndDeviceTrial`
  - a start error shows the message
- [ ] **Step 2: Run `pnpm --filter @home/web test -- TestControl useDeviceTrial` and confirm it FAILS.**
- [ ] **Step 3: Implement, and wire the strip into the page.** The strip is hidden when there are no new devices.
- [ ] **Step 4: Run the web suite, lint and typecheck.** Expected: PASS. Commit with `feat(web): test new devices before adopting`.

---

### Task 7: Web — Integrations sub-tabs

**Files:**
- Create:
  - `apps/web/src/admin/integrations/IntegrationTabs.tsx`: tabs with status dots, linking to `/admin/integrations/:slug`
  - `apps/web/src/admin/integrations/IntegrationView.tsx`: description, status, last synced and the form slot
  - `apps/web/src/admin/integrations/IntegrationDevices.tsx`
  - `apps/web/src/admin/integrations/LastSynced.tsx`
  - `apps/web/src/admin/lib/integrations.ts`
- Modify:
  - `apps/web/src/AppRoutes.tsx`: `integrations` gets an index route plus `:integration`
  - `apps/web/src/admin/IntegrationsPage.tsx`
  - `apps/web/src/admin/data/documents.ts`: add the three timestamps to the Integrations query
  - `apps/web/src/admin/AdminTabs.tsx`: keep the Integrations tab selected on sub-paths (it uses `startsWith` already, so just verify)
- Test: update `apps/web/src/admin/IntegrationsPage.test.tsx`, and add `apps/web/src/admin/lib/integrations.test.ts`

**Interfaces:**
- `lib/integrations.ts`:
  - `export type IntegrationSlug = 'tuya' | 'kasa' | 'swann'`
  - `export const INTEGRATIONS: { slug; label; brand: Brand; description: string }[]`
    - Descriptions:
      - Tuya: "Smart Life devices: local keys and cloud cameras."
      - Kasa: "TP-Link Kasa plugs and switches on your network."
      - Swann: "The Swann recorder's wired cameras."
  - `export function defaultIntegration(status): IntegrationSlug`: the first unconfigured one in order tuya, kasa, swann; otherwise `'tuya'`.
  - `export function isIntegrationSlug(s: string): s is IntegrationSlug`
- `LastSynced` takes `{ at: string | null }`. It shows "Last synced 5 min ago" via the existing `formatLastSeen`, or "Last synced: Never".
- `IntegrationDevices` takes `{ brand }`. It uses `useAdminDevices`, keeps the adopted devices of that brand, and shows each as a link to `/devices/:id` with its room and `HealthChip`. When there are none, it shows "No devices use this yet."

- [ ] **Step 1: Write failing tests.**
  - In `defaultIntegration`, Tuya configured and Kasa not gives `'kasa'`; all configured gives `'tuya'`.
  - The page:
    - `/admin/integrations` redirects to the first unconfigured integration's tab, which is selected and shows its form.
    - `/admin/integrations/swann` opens Swann directly.
    - `/admin/integrations/xyz` redirects.
    - Each tab shows "Last synced: Never" or a relative time.
    - Each tab lists only its brand's adopted devices.
- [ ] **Step 2: Run `pnpm --filter @home/web test -- integrations IntegrationsPage` and confirm it FAILS.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the web suite, lint and typecheck.** Expected: PASS. Commit with `feat(web): integrations as routed sub-tabs with devices and last sync`.

---

### Task 8: Verification

- [ ] **Step 1: Apply the migration state and run both suites.**
  - Run: `pnpm --filter @home/server test` and `pnpm --filter @home/web test`
  - Expected: all PASS. (This plan adds no migration: settings are rows.)
- [ ] **Step 2: Build both apps.** Run `pnpm --filter @home/server build` and `pnpm --filter @home/web build`. Expected: both succeed.
- [ ] **Step 3: Report what can't be verified from the session** (a real device clicking during Test, and phone width in a real browser) for the user to check.
