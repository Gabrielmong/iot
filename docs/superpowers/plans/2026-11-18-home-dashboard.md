# Home Dashboard and Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A curated Home page at `/` (devices from any room plus widgets, never auto-filled), All devices at `/all`, rooms at `/rooms` on phones, and seven new widget kinds with per-instance settings.

**Architecture:** Home is layout tab `home` in the existing `UserDashboardLayout` / `DefaultDashboardLayout` storage and arrange mode. Widget layout items gain a `widgetId` (instance id) and an optional `targetId` (the routine, camera device or room a widget points at). Reconcile skips appending unplaced devices on Home. Widgets render through one dispatcher and decide their own availability from data the viewer already loads.

**Tech Stack:** Server: Apollo GraphQL, Prisma 7, vitest. Web: React 19, MUI 9, Apollo Client 4 (codegen preset client, `fragmentMasking: false`), react-router, dnd-kit, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-18-home-dashboard-design.md`

## Global Constraints

- Tab keys: `home`, `all`, or a room id. The `all` stored key is unchanged.
- Tile sizes: `S1x1`, `W2x1`, `T1x2`, `L2x2` only.
- Widget kinds: `WEATHER SUN ROUTINE CAMERA ROOM CLOCK RAIN_SOON MOON OFFLINE`. `ROUTINE`, `CAMERA`, `ROOM` require `targetId`; the others must not have one.
- Start sizes: WEATHER W2x1, SUN S1x1, ROUTINE S1x1, CAMERA L2x2, ROOM S1x1, CLOCK W2x1, RAIN_SOON W2x1, MOON S1x1, OFFLINE S1x1.
- Stored items without `widgetId` (`{ widget: 'WEATHER', size }`) load with `widgetId` = the kind.
- Home never appends unplaced devices; rooms and All still do.
- Widgets whose target is missing or not visible: hidden in normal view, "Not available" tile in arrange mode, kept in the saved layout.
- At most 2 live camera widgets per screen; live only while in the viewport and the page is visible.
- OFFLINE counts visible devices with `kind !== 'COMPUTER'`, `status === 'OK'`, `state.online === false`.
- RAIN_SOON: first hour in the next 12 with `rainChance >= 50` or condition RAIN / DRIZZLE / STORM.
- Copy: page title "Home", button "Edit Home", empty state "Nothing on Home yet" + button "Add to Home"; nav labels "Home", "All devices", "Rooms"; unavailable tile "Not available".
- Small files, one responsibility each (repo norm). Web commands run from `apps/web`: `pnpm codegen`, `pnpm exec vitest run <paths>`, `pnpm exec tsc --noEmit -p tsconfig.app.json`. Server: `pnpm exec vitest run <paths>` from `apps/server`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A layout saved before this change** (`{ widget: 'WEATHER', size }`, no id) → loads, arranges, saves again without duplicate-widget errors. Test in Tasks 1 and 2.
2. **A device on Home that the user loses access to, or that is deleted** → disappears from Home; a newly adopted device never appears on Home. Test in Tasks 2 and 3.
3. **An admin default Home with a routine/camera/room widget a guest can't see** → hidden for the guest outside arrange mode, "Not available" inside it, and still in the guest's saved copy. Test in Task 5.
4. **Three camera widgets on one screen, then switching page** → only two stream, the third shows a play button; leaving the page stops all streams. Test in Task 8.
5. **Old URLs**: `/rooms/all` → `/all`; `/rooms` on desktop → `/all`; phone Back from a room goes to `/rooms`. Test in Task 3.

---

### Task 1: Server — widget instances and the Home tab

**Files:**
- Modify: `apps/server/src/services/layout-items.ts`, `apps/server/src/services/dashboard-layouts.ts`, `apps/server/src/graphql/schema.graphql`, `apps/server/src/graphql/resolvers/layouts.ts` (only if mapping needs it)
- Test: `apps/server/test/layout-items.test.ts` (create or extend), and the existing layout API test (find with `grep -l saveDashboardLayout apps/server/test`)

**Interfaces:**
- Produces (GraphQL): `enum WidgetKind { WEATHER SUN ROUTINE CAMERA ROOM CLOCK RAIN_SOON MOON OFFLINE }`, `type LayoutItem { deviceId: ID widget: WidgetKind widgetId: ID targetId: ID size: TileSize! }`, `input LayoutItemInput` with the same fields. `widgetId` is non-null in responses for widget items.
- Produces (TS): `LayoutItem = { deviceId; size } | { widget: WidgetKind; widgetId: string; targetId?: string; size }`; `HOME_TAB = "home"` exported from `dashboard-layouts.ts`.

- [ ] **Step 1: Write failing tests**
  - `toLayoutItems` keeps `widgetId` and `targetId`; an input widget without `widgetId` gets `widgetId` = kind.
  - `validateLayoutItems` rejects: ROUTINE/CAMERA/ROOM without `targetId` ("This widget needs a target"); CLOCK with a `targetId`; two items with the same `widgetId` ("Duplicate widget in layout"); and allows two ROUTINE widgets with different ids.
  - API: `saveDashboardLayout(tab: "home", …)` succeeds; `dashboardLayouts` returns a stored legacy item `{ widget: "WEATHER", size: "W2x1" }` (insert raw JSON) with `widgetId: "WEATHER"`.
- [ ] **Step 2: Run** `pnpm exec vitest run test/layout-items.test.ts <api test>` → FAIL.
- [ ] **Step 3: Implement.** Normalise legacy items on read in `effectiveLayouts`/`resetLayout` (fill `widgetId`). `requireTab` accepts `HOME_TAB`. Widget items are kept regardless of target visibility (spec).
- [ ] **Step 4: Run** the same tests → PASS; then `pnpm exec vitest run` in `apps/server` → all pass.
- [ ] **Step 5: Commit** `feat(server): widget instances with targets and the home layout tab`.

### Task 2: Web — layout entries with widget instances

**Files:**
- Modify: `apps/web/src/dashboard/lib/reconcileLayout.ts`, `lib/arrangeOps.ts`, `layout/useArrange.ts`, `layout/data/documents.ts`, `layout/data/useDashboardLayouts.ts`, `widgets/widgetKinds.ts`, `layout/ArrangeGrid.tsx`, `layout/SortableTile.tsx`, `layout/RemoveWidgetButton.tsx`, `DeviceGrid.tsx` (prop types only)
- Test: `lib/reconcileLayout.test.ts`, `lib/arrangeOps.test.ts`, `layout/data/useDashboardLayouts.test.tsx`

**Interfaces:**
- Produces:
  - `type WidgetEntry = { widget: WidgetKind; widgetId: string; targetId?: string; size: TileSize }`; `LayoutEntry = { deviceId: string; size } | WidgetEntry`.
  - `ArrangedTile = { key; size } & ({ device } | { widget: WidgetKind; widgetId: string; targetId?: string })`.
  - `widgetKey(widgetId: string) => 'widget:' + widgetId`.
  - `reconcileLayout(entries, devices, defaults = [], options: { appendUnplaced?: boolean } = {})` — `appendUnplaced` defaults to true.
  - `addWidget(list, kind, targetId?: string, newId = () => crypto.randomUUID()): LayoutEntry[]` (prepends at `WIDGET_START_SIZE[kind]`); `removeEntry(list, key)` replaces `removeWidget`.
  - `useArrange(tab, devices, onError, defaults, options?: { appendUnplaced?: boolean })` returns `addWidget(kind, targetId?)`, `removeEntry(key)`, `addDevice(deviceId)` (appends at S1x1); `widgetsToAdd` is removed (Task 5 owns the menu).
  - `widgetKinds.ts`: `WIDGET_KINDS` (all nine, in menu order), `WIDGET_LABEL`, `WIDGET_START_SIZE`, `WIDGET_TARGET: Partial<Record<WidgetKind, 'routine' | 'camera' | 'room'>>`.

- [ ] **Step 1: Write failing tests**
  - reconcile: `appendUnplaced: false` returns only placed devices; two ROUTINE widgets with different ids both kept with keys `widget:<id>`.
  - arrangeOps: `addWidget(list, 'ROUTINE', 'r1', () => 'w1')` prepends `{ widget: 'ROUTINE', widgetId: 'w1', targetId: 'r1', size: 'S1x1' }`; `removeEntry(list, 'widget:w1')` removes it.
  - useDashboardLayouts: a stored item `{ widget: 'WEATHER', widgetId: 'WEATHER', targetId: null, size }` maps to an entry without `targetId`; `save` sends `widgetId`/`targetId`.
- [ ] **Step 2: Run** `pnpm codegen && pnpm exec vitest run src/dashboard` → new tests FAIL.
- [ ] **Step 3: Implement**; update existing tests and `ArrangeMode.test.tsx` call sites to the new names.
- [ ] **Step 4: Run** `pnpm exec vitest run src/dashboard` and tsc → PASS / clean.
- [ ] **Step 5: Commit** `feat(web): widget instances in dashboard layouts`.

### Task 3: Web — Home page, All page, Rooms page, navigation

**Files:**
- Create: `apps/web/src/pages/HomePage.tsx`, `apps/web/src/pages/AllDevicesPage.tsx`, `apps/web/src/pages/RoomsPage.tsx`, `apps/web/src/dashboard/HomeEmptyState.tsx`
- Modify: `AppRoutes.tsx`, `pages/DashboardPage.tsx` (room route only), `dashboard/Dashboard.tsx`, `dashboard/lib/roomTabs.ts` (`HOME_TAB`), `dashboard/lib/dashboardView.ts`, `dashboard/RoomHeader.tsx`, `dashboard/widgets/defaultWidgets.ts`, `layout/nav/navItems.ts`, `layout/nav/NavList.tsx`, `layout/nav/NavRooms.tsx` (comment), `weather/WeatherStrip.tsx` usage
- Test: `pages/HomePage.test.tsx`, `AppRoutes` routing test (extend the existing routing test or `DashboardPage.test.tsx`), `layout/nav/NavList.test.tsx`, `dashboard/Dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 2 `useArrange(..., { appendUnplaced })`.
- Produces: `HOME_TAB = 'home'`; `dashboardView(devices, rooms, selectedTab)` returns all visible devices for `HOME_TAB`; `Dashboard` props `{ isAdmin; room: string; showBack?: boolean }` where `room === HOME_TAB` means Home; `defaultWidgets(tab, weather)` returns Weather W2x1 for `HOME_TAB` (and still for `all`) when weather works.
- Routes: `/` HomePage, `/all` AllDevicesPage (Dashboard room `all`), `/rooms` RoomsPage (room grid on phones; `<Navigate to="/all" replace />` on desktop), `/rooms/all` → `<Navigate to="/all" replace />`, `/rooms/:roomId` unchanged.
- Nav: `MAIN_LINKS` = Home `/` (exact), All devices `/all` (alsoActive `/devices/`, rooms listed under it when `showRooms`), Rooms `/rooms` (only when `!showRooms`, i.e. phones), then Weather, Cameras, Routines.

- [ ] **Step 1: Write failing tests**
  - Home with a saved home layout `[deviceA]` and devices A, B: shows A only, heading "Home", button "Edit Home".
  - Home with no layout and weather NOT_CONFIGURED: "Nothing on Home yet" and "Add to Home", which enters arrange mode.
  - Home hides the routine row and keeps "All off" acting on Home's devices only.
  - `/rooms/all` lands on All devices; `/rooms` on desktop lands on All devices; phone `/rooms` shows the room grid; RoomHeader Back links to `/rooms`.
  - NavList: phone shows Home, All devices, Rooms; desktop shows Home, All devices (rooms under it), no Rooms entry.
  - Phone Home shows the weather strip unless Home has a Weather widget.
- [ ] **Step 2: Run** `pnpm exec vitest run src/pages src/layout src/dashboard` → FAIL.
- [ ] **Step 3: Implement.** Dashboard derives `isHome = room === HOME_TAB` and passes `{ appendUnplaced: !isHome }`; header name "Home"; arrange button label "Edit Home" on Home (ArrangeBar gets an optional `startLabel`).
- [ ] **Step 4: Run** the tests and tsc → PASS / clean.
- [ ] **Step 5: Commit** `feat(web): home page, all devices page and rooms page`.

### Task 4: Web — add devices to Home

**Files:**
- Create: `apps/web/src/dashboard/layout/AddDeviceButton.tsx`, `apps/web/src/dashboard/layout/AddDeviceDialog.tsx`, `apps/web/src/dashboard/lib/devicesToAdd.ts`
- Modify: `dashboard/Dashboard.tsx` (show on Home while arranging); device tiles on Home get a remove control in arrange mode (reuse `RemoveWidgetButton`, renamed `RemoveTileButton` with label "Remove X from Home")
- Test: `lib/devicesToAdd.test.ts`, `layout/AddDeviceDialog.test.tsx`

**Interfaces:**
- Consumes: Task 2 `addDevice(deviceId)`, `removeEntry(key)`.
- Produces: `devicesToAdd(all: readonly Device[], tiles: readonly ArrangedTile[]): { room: string; devices: Device[] }[]` — visible devices not already placed, grouped by room name (no room → "No room"), rooms in `sortOrder`, devices by name.

- [ ] **Step 1: Write failing tests:** grouping/sorting/excluding placed; dialog lists groups, picking "Porch light" calls `onAdd('d-porch')` and closes; Remove on a Home device tile removes it from the draft only.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, tsc clean.
- [ ] **Step 5: Commit** `feat(web): add and remove devices on Home`.

### Task 5: Web — widget framework (dispatch, availability, add menu with targets)

**Files:**
- Create: `apps/web/src/dashboard/widgets/WidgetBody.tsx` (switch by kind), `widgets/useWidgetData.ts`, `widgets/lib/widgetAvailable.ts`, `widgets/UnavailableWidget.tsx`, `widgets/WidgetTargetDialog.tsx`
- Modify: `widgets/WidgetTile.tsx` (frame + per-kind tap: `href` for navigation kinds, none for CLOCK/MOON, own buttons for ROUTINE), `widgets/AddWidgetButton.tsx` (all kinds; kinds in `WIDGET_TARGET` open `WidgetTargetDialog`), `DeviceGrid.tsx` (filter with `widgetAvailable`), `layout/ArrangeGrid.tsx` / `TileFace.tsx` (unavailable widgets show `UnavailableWidget`)
- Test: `widgets/lib/widgetAvailable.test.ts`, `widgets/AddWidgetButton.test.tsx`, extend `layout/ArrangeMode.test.tsx`

**Interfaces:**
- Produces:
  - `type WidgetData = { weather?: Weather; routines: readonly { id: string; name: string; running: boolean }[]; cameras: readonly Device[]; rooms: readonly Room[]; devices: readonly Device[] }` from `useWidgetData()` (reuses `useWeather`, `useRoutines`, `useDevices`, `useRooms`; cameras = devices with `kind === 'CAMERA'`).
  - `widgetAvailable(tile: WidgetTile, data: WidgetData): boolean` — target kinds need their target in data; WEATHER/RAIN_SOON follow the existing weather rule; SUN/MOON need `weather.sun`; CLOCK/OFFLINE always.
  - `WidgetTargetDialog({ kind, data, onPick(targetId), onClose })` — lists routines / cameras / rooms by name.
- [ ] **Step 1: Write failing tests:** availability per kind (incl. routine missing → false); add menu lists all nine labels; choosing "Routine button" opens the picker and adds `{ widget: 'ROUTINE', targetId }`; arrange mode shows "Not available" for a ROUTINE widget whose routine isn't in data, normal view hides it, and saving keeps it (Review Focus 3).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; new kinds render a placeholder body until Tasks 6–8. **Step 4: Run** → PASS, tsc clean.
- [ ] **Step 5: Commit** `feat(web): widget framework with targets and availability`.

### Task 6: Web — Clock, Moon, Rain soon, Devices offline widgets

**Files:**
- Create: `widgets/ClockWidget.tsx`, `widgets/MoonWidget.tsx`, `widgets/lib/moon.ts`, `widgets/RainSoonWidget.tsx`, `widgets/lib/rainSoon.ts`, `widgets/OfflineWidget.tsx`, `widgets/OfflineDialog.tsx`, `widgets/lib/offlineDevices.ts`, `widgets/useNow.ts` (ticks every minute; every second not needed)
- Modify: `apps/web/package.json` (add `"suncalc": "1.9.0"` and `"@types/suncalc": "^1.9.2"`, same versions as the server), `widgets/WidgetBody.tsx`
- Test: `widgets/lib/moon.test.ts`, `widgets/lib/rainSoon.test.ts`, `widgets/lib/offlineDevices.test.ts`, `widgets/OfflineWidget.test.tsx`

**Interfaces:**
- `moonPhase(date: Date): { name: string; fraction: number }` — names: New moon, Waxing crescent, First quarter, Waxing gibbous, Full moon, Waning gibbous, Last quarter, Waning crescent (from suncalc `getMoonIllumination(date).phase`, eighths centred on the four main phases).
- `daylightLeft(sun, now): string` — "3 h 20 min of daylight left" before sunset, "Sunrise in 6 h" after sunset / before sunrise, "" when no times.
- `rainSoon(hourly, now): { at: string; chance: number } | 'now' | null` — `'now'` when the hour covering now qualifies; text: "Raining now" / "Rain likely around 3 PM (70%)" / "No rain in the next 12 h".
- `offlineDevices(devices): Device[]` — the Global Constraints rule, sorted by name. Widget: "All devices online" or "3 devices offline"; tap opens `OfflineDialog` listing names linking to `/devices/:id`.
- [ ] **Step 1: Write failing tests** for each lib (moon: 2026-11-24 → a known phase name from suncalc; rainSoon: chance 60 at +2 h → that hour; RAIN condition at 30% → qualifies; nothing → null) and the offline widget text/dialog.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`pnpm install` after the package change). **Step 4: Run** → PASS, tsc clean.
- [ ] **Step 5: Commit** `feat(web): clock, moon, rain soon and devices offline widgets`.

### Task 7: Web — Routine button and Room summary widgets

**Files:**
- Create: `widgets/RoutineWidget.tsx`, `widgets/RoomWidget.tsx`
- Modify: `widgets/WidgetBody.tsx`, `widgets/WidgetTile.tsx` (ROUTINE: the tile is the button)
- Test: `widgets/RoutineWidget.test.tsx`, `widgets/RoomWidget.test.tsx`

**Interfaces:**
- Consumes: `useRunRoutine(onError)`, the stop mutation (`STOP_ROUTINE` in `routines/data/documents.ts`; add `useStopRoutine` if none exists), `roomSummaries(devices, rooms)`.
- ROUTINE: name + ▶; tap runs (`aria-label "Run <name>"`); while running shows "Running…" and a Stop button (`aria-label "Stop <name>"`).
- ROOM: room name, "2 on" (or "All off"), and "1 offline" when any (offline rule from Task 6); tap → `/rooms/:id`.
- [ ] **Step 1: Write failing tests:** tapping Run sends `runRoutine(id)`; a running routine shows Stop which sends the stop mutation; room widget text and link.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, tsc clean.
- [ ] **Step 5: Commit** `feat(web): routine button and room summary widgets`.

### Task 8: Web — Camera widget with live slots

**Files:**
- Create: `widgets/CameraWidget.tsx`, `widgets/live/LiveSlots.tsx` (context provider + `useLiveSlot(key)`), `widgets/live/liveSlots.ts` (pure slot logic), `widgets/useInViewport.ts`
- Modify: `DeviceGrid.tsx` (wrap in `LiveSlotsProvider`), `widgets/WidgetBody.tsx`
- Test: `widgets/live/liveSlots.test.ts`, `widgets/CameraWidget.test.tsx`

**Interfaces:**
- `liveSlots` pure ops: `request(state, key, max = 2)` grants if under max; `take(state, key)` (user tap) grants, evicting the oldest live key; `release(state, key)`.
- `useLiveSlot(key, wanted: boolean): { live: boolean; take: () => void }` — `wanted` = in viewport and `useDocumentVisible()`; releases when not wanted or unmounted.
- `CameraWidget({ device, size })`: when live, `<TileVideo deviceId cloud={device.connection === 'CLOUD'} onPhase>`; otherwise camera name and a "Play <name>" button that calls `take`. Tap elsewhere → `/cameras` (pass the camera in router state as CamerasView expects, or plain `/cameras` if it has no such hook).
- [ ] **Step 1: Write failing tests:** slot logic (third request denied; take evicts oldest; release frees); three CameraWidgets in a provider with IntersectionObserver mocked visible → two `video` elements and one "Play" button; unmount → slots freed (Review Focus 4).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, tsc clean.
- [ ] **Step 5: Commit** `feat(web): live camera widget, two at a time`.

### Task 9: Docs and full verification

**Files:** Modify `docs/RUNNING.md` (acceptance checklist: Home, Edit Home, add device/widget, All devices, Rooms on phone).

- [ ] **Step 1:** Add the checklist lines.
- [ ] **Step 2: Run** `pnpm test` from the repo root → all pass (known flaky: GroupDialogs "keeps the current view", api-tuya-quiet "overlapping syncs" — rerun alone).
- [ ] **Step 3: Run** `pnpm build` → succeeds.
- [ ] **Step 4: Commit** `docs: home dashboard`.
