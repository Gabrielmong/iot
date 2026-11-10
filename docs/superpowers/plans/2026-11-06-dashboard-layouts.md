# Custom Dashboard Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every user drag dashboard cards into their own order and resize them (1×1, 2×1, 1×2, 2×2) per tab, on top of an admin-set default stored on the server.

**Architecture:** The server stores per-tab arrangements in two Prisma tables (user overrides and admin defaults) and exposes them through one GraphQL query and two mutations, filtered by device access. The web app reconciles the arrangement with the live device list using pure `lib/` functions, renders it in the existing CSS grid with `grid-auto-flow: dense` and size spans, and adds an arrange mode built on dnd-kit that edits a draft for the current tab only.

**Tech Stack:** Prisma + Postgres and GraphQL (`@graphql-tools/schema`) on the server. On the web: React 19, MUI 9, Apollo 4, framer-motion 14.6.0, `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0` and `@dnd-kit/utilities@3.2.2`. Vitest on both sides.

**Spec:** `docs/superpowers/specs/2026-11-06-dashboard-layouts-design.md`

## Global Constraints

- Sizes are exactly `S1x1`, `W2x1`, `T1x2` and `L2x2`, where `W2x1` is 2 columns × 1 row and `T1x2` is 1 column × 2 rows. Nothing larger.
- A tab key is `"all"` or a room id.
- Effective arrangement: the user's override, else the admin default, else none (server order at 1×1).
- Grid breakpoints are unchanged: xs 2, sm 3, md 4, lg 6 columns (`apps/web/src/dashboard/lib/gridColumns.ts`).
- Arrange mode acts on the current tab only, and the room tabs are disabled while arranging.
- While arranging, taps never toggle a device or open its page.
- An admin's "Save as default for everyone" also deletes that admin's own override for the tab, in the same transaction.
- Validation: each `deviceId` appears at most once, and there are at most 500 items. Unknown or inaccessible device ids are dropped silently, not rejected.
- Copy:
  - Buttons: "Arrange", "Done", "Cancel", "Reset to default", "Save for me", "Save as default for everyone".
  - Save error: "Couldn't save the layout."
- Small files with one job each. Pure logic lives in `lib/` with unit tests (project rule).
- New npm packages are pinned to exact versions at least two weeks old.

## Review Focus

1. **Live device updates while arranging.** State ticks and `devicesChanged` refetches must not wipe or reorder the draft. Expected: the draft keeps its order and sizes, and tiles show live state. Test in Task 5.
2. **A device removed, moved to another room, or newly added during or between arranges.** Expected: removed or moved devices vanish from the draft and from the save, and new ones append at 1×1. Test in Tasks 2 and 5.
3. **A USER sending `asDefault: true`, or a default that contains devices the user can't access.** Expected: FORBIDDEN for the first. For the second, the default is returned with only accessible items. Test in Task 1.
4. **Saving for a room that was deleted meanwhile, or a tab key that is neither `"all"` nor a room.** Expected: BAD_USER_INPUT, the snackbar shows "Couldn't save the layout.", and the user stays in arrange mode. Test in Tasks 1 and 5.
5. **An admin who saved "for me" and then saves "as default".** Expected: the admin then sees the default (`isDefault: true`). Test in Task 1.

---

### Task 1: Server — layout storage, GraphQL API

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (add two models and a `User` back-relation)
- Create: migration via `pnpm --filter @home/server db:migrate --name dashboard_layouts`
- Create: `apps/server/src/services/dashboard-layouts.ts`
- Create: `apps/server/src/services/layout-items.ts`
- Create: `apps/server/src/graphql/resolvers/layouts.ts`
- Modify: `apps/server/src/graphql/resolvers/index.ts`, `apps/server/src/graphql/schema.graphql`
- Modify: `apps/server/src/services/rooms.ts` (`deleteRoom` also deletes layouts whose `tab` is that room id, in both tables)
- Test: `apps/server/test/api-dashboard-layouts.test.ts`, `apps/server/test/layout-items.test.ts`

**Interfaces:**
- Produces this SDL (appended to `schema.graphql`):
  ```graphql
  enum TileSize { S1x1 W2x1 T1x2 L2x2 }
  type LayoutItem { deviceId: ID!  size: TileSize! }
  input LayoutItemInput { deviceId: ID!  size: TileSize! }
  type DashboardLayout { tab: ID!  items: [LayoutItem!]!  isDefault: Boolean! }
  # Query
  dashboardLayouts: [DashboardLayout!]!   # effective per tab for the caller; tabs with no layout at all are omitted
  # Mutation
  saveDashboardLayout(tab: ID!, items: [LayoutItemInput!]!, asDefault: Boolean = false): DashboardLayout!  # asDefault ⇒ admin
  resetDashboardLayout(tab: ID!): DashboardLayout   # deletes caller's override; returns the default now in effect, or null
  ```
- Prisma models:
  ```prisma
  model UserDashboardLayout {
    userId    String
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    tab       String
    items     Json
    updatedAt DateTime @updatedAt
    @@id([userId, tab])
  }
  model DefaultDashboardLayout {
    tab       String   @id
    items     Json
    updatedAt DateTime @updatedAt
  }
  ```
  Two tables instead of a nullable `userId`. This settles the spec's "default-row uniqueness" question without needing a partial index.
- `layout-items.ts`: `export type LayoutItem = { deviceId: string; size: "S1x1" | "W2x1" | "T1x2" | "L2x2" }` and `export function validateLayoutItems(items: LayoutItem[]): LayoutItem[]`. It throws `badInput("Duplicate device in layout")` on a repeated id and `badInput("Too many items")` above 500. Otherwise it returns `items` unchanged.
- `dashboard-layouts.ts`:
  - `effectiveLayouts(prisma, user: Pick<User,"id"|"role">): Promise<ApiLayout[]>`
  - `saveLayout(prisma, user, tab: string, items: LayoutItem[], asDefault: boolean): Promise<ApiLayout>`
  - `resetLayout(prisma, user, tab): Promise<ApiLayout | null>`
  - `type ApiLayout = { tab: string; items: LayoutItem[]; isDefault: boolean }`
  - Access filtering uses `visibleDevices(prisma, user)` from `src/services/device-rows.ts` (the same set the `devices` query returns).
  - Tab check: `"all"` or an existing `Room.id`, else `badInput("Unknown tab")`.
  - `saveLayout` with `asDefault` upserts the default row and deletes the caller's override, in one `$transaction`.
- Resolvers use `requireUser`, plus `requireAdmin` when `asDefault` is true, from `src/graphql/guards.ts`.

- [ ] **Step 1: Write failing unit tests** in `test/layout-items.test.ts`:
  - `validateLayoutItems([{deviceId:"a",size:"S1x1"},{deviceId:"a",size:"L2x2"}])` throws a BAD_USER_INPUT error.
  - 501 items throw; 500 items pass.
  - Valid input is returned unchanged.
- [ ] **Step 2: Write failing API tests** in `test/api-dashboard-layouts.test.ts`, following `test/api-device-grants.test.ts` (`ApiHarness.start()`, `h.user`, `h.device`, `h.ok`, `codes`):
  - `"returns no layouts before anything is saved"`: `dashboardLayouts` returns `[]`.
  - `"saves and reads back a user's own layout"`: Ann (granted d1 and d2) saves `all` → `[d2:L2x2, d1:S1x1]`. The query returns `[{tab:"all", items:[…same order…], isDefault:false}]`.
  - `"serves the admin default to users without an override, filtered by access"`:
    - The admin saves the default `all` = `[d1:L2x2, d2:W2x1, d3:S1x1]`. Ann is granted only d1 and d3.
    - Ann gets `items [d1:L2x2, d3:S1x1]` with `isDefault:true`.
  - `"forbids a USER from saving a default"`: `codes(...)` returns `["FORBIDDEN"]`.
  - `"drops unknown and inaccessible device ids on save"`: Ann saves `[d1, "nope", d9-not-granted]`, and the stored and returned items are `[d1]`.
  - `"rejects an unknown tab and duplicate ids"`: both give `["BAD_USER_INPUT"]`. A room id that exists is accepted.
  - `"reset returns the default in effect, or null"`.
  - `"saving as default replaces the admin's own override"`: the admin saves "for me", then "as default". The query then returns `isDefault:true` with the default's items.
  - `"deleting a room deletes its layouts"`, and `"deleting a user deletes their layouts"` (via the cascade).
- [ ] **Step 3: Run them and confirm they fail.**
  - Run: `pnpm --filter @home/server test -- layout`
  - Expected: FAIL (module, model or field not found).
- [ ] **Step 4: Implement the models and migration, `layout-items.ts`, `dashboard-layouts.ts`, the SDL, `resolvers/layouts.ts` (spread into `index.ts`), and the `deleteRoom` cleanup.**
- [ ] **Step 5: Run the server suite.**
  - Run: `pnpm --filter @home/server test`
  - Expected: all PASS, including `test/schema.test.ts`.
- [ ] **Step 6: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): per-tab dashboard layouts with admin defaults"
  ```

---

### Task 2: Web — pure layout logic

**Files:**
- Create: `apps/web/src/dashboard/lib/tileSize.ts`, `apps/web/src/dashboard/lib/reconcileLayout.ts`, `apps/web/src/dashboard/lib/arrangeOps.ts`
- Test: `apps/web/src/dashboard/lib/tileSize.test.ts`, `reconcileLayout.test.ts`, `arrangeOps.test.ts`

**Interfaces:**
- `tileSize.ts`:
  - `export type TileSize = 'S1x1' | 'W2x1' | 'T1x2' | 'L2x2'`
  - `export const TILE_SIZES: readonly TileSize[] = ['S1x1','W2x1','T1x2','L2x2']`
  - `export function tileSpan(size: TileSize): { cols: 1 | 2; rows: 1 | 2 }`
  - `export const TILE_SIZE_LABEL: Record<TileSize, string>`, with values `'1×1'`, `'2×1'`, `'1×2'`, `'2×2'`
- `reconcileLayout.ts`:
  - `export type LayoutEntry = { deviceId: string; size: TileSize }`
  - `export type ArrangedTile = { device: Device; size: TileSize }`
  - `export function reconcileLayout(entries: readonly LayoutEntry[] | undefined, devices: readonly Device[]): ArrangedTile[]`, following spec 7.1 steps 1–3. `devices` are the tab's visible tiles, already in server order.
- `arrangeOps.ts` works on `LayoutEntry[]`:
  - `moveEntry(list, activeId: string, overId: string): LayoutEntry[]` uses arrayMove semantics and returns `list` unchanged for unknown ids.
  - `resizeEntry(list, deviceId, size): LayoutEntry[]`
  - `toEntries(tiles: readonly ArrangedTile[]): LayoutEntry[]`

- [ ] **Step 1: Write failing tests.**
  - `tileSpan('W2x1')` returns `{cols:2, rows:1}` and `tileSpan('T1x2')` returns `{cols:1, rows:2}`.
  - `reconcileLayout(undefined, [a,b])` returns `[{a,S1x1},{b,S1x1}]`.
  - `reconcileLayout([{b,L2x2},{gone,S1x1},{a,W2x1}], [a,b,c])` returns `[b:L2x2, a:W2x1, c:S1x1]`.
  - A device that moved rooms (absent from `devices`) is dropped.
  - `moveEntry([a,b,c], 'c', 'a')` returns `[c,a,b]`. `moveEntry(list,'x','a')` returns `list`.
  - `resizeEntry` changes only the named entry.
- [ ] **Step 2: Run and confirm they fail.**
  - Run: `pnpm --filter @home/web test -- dashboard/lib`
  - Expected: FAIL (modules missing).
- [ ] **Step 3: Implement the three files.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/dashboard/lib
  git commit -m "feat(web): layout reconciliation and arrange operations"
  ```

---

### Task 3: Web — layout data hook

**Files:**
- Create: `apps/web/src/dashboard/layout/data/documents.ts`, `apps/web/src/dashboard/layout/data/useDashboardLayouts.ts`
- Test: `apps/web/src/dashboard/layout/data/useDashboardLayouts.test.tsx`

**Interfaces:**
- Consumes: Task 1's SDL (codegen reads `../server/src/graphql/schema.graphql`) and `LayoutEntry` from Task 2.
- Documents: `query DashboardLayouts`, `mutation SaveDashboardLayout($tab, $items, $asDefault)` and `mutation ResetDashboardLayout($tab)`. Each selects `tab items { deviceId size } isDefault`.
- Produces `export function useDashboardLayouts()`, which returns:
  ```ts
  {
    layoutFor: (tab: string) => { entries: LayoutEntry[]; isDefault: boolean } | undefined
    save: (tab: string, entries: LayoutEntry[], asDefault: boolean) => Promise<boolean>   // false on error
    reset: (tab: string) => Promise<boolean>
  }
  ```
  - Fetch policy `cache-and-network`.
  - After a successful save or reset, refetch `DashboardLayouts`.
  - Errors never throw out of `save` or `reset`.

- [ ] **Step 1: Write failing tests** using `createTestClient`, `reply` and `failWith` from `src/test/testClient.ts`:
  - `layoutFor('all')` returns the replied entries. An unknown tab returns `undefined`.
  - `save` sends `{tab, items, asDefault}` and resolves `true`.
  - `failWith('BAD_USER_INPUT')` resolves `false`.
- [ ] **Step 2: Run `pnpm --filter @home/web test -- useDashboardLayouts` and confirm it FAILS.**
- [ ] **Step 3: Implement both files, then run `pnpm --filter @home/web codegen`.**
- [ ] **Step 4: Run the tests and `pnpm --filter @home/web typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/dashboard/layout apps/web/src/gql
  git commit -m "feat(web): dashboard layouts query and mutations"
  ```

---

### Task 4: Web — sized grid showing the effective layout

**Files:**
- Modify: `apps/web/src/dashboard/DeviceGrid.tsx`, `apps/web/src/dashboard/AnimatedTile.tsx`, `apps/web/src/dashboard/Dashboard.tsx`
- Modify: `apps/web/src/dashboard/tile/DeviceTile.tsx` and `TileBody.tsx` (fill the cell height), `apps/web/src/device/camera/CameraThumb.tsx` (add a `fill?: boolean` prop: `height: 100%` with no aspect ratio)
- Create: `apps/web/src/dashboard/lib/gridRows.ts`, holding `export const gridRowHeight = { xs: '150px', sm: '160px' }`
- Test: `apps/web/src/dashboard/DeviceGrid.test.tsx`, and update `apps/web/src/dashboard/Dashboard.test.tsx` if one exists (otherwise create it)

**Interfaces:**
- Consumes: `ArrangedTile` and `reconcileLayout` (Task 2), `tileSpan` (Task 2), and `useDashboardLayouts` (Task 3).
- `DeviceGrid` props become `{ tiles: readonly ArrangedTile[]; isAdmin; onToggle; onOpenDetails }`.
- The grid adds `gridAutoFlow: 'dense'` and `gridAutoRows: gridRowHeight`.
- `AnimatedTile` gains a `size: TileSize` prop and sets `gridColumn: span N` and `gridRow: span N` from `tileSpan`.
- `Dashboard` computes `reconcileLayout(layouts.layoutFor(tab)?.entries, tilesForTab)`.

- [ ] **Step 1: Write failing tests.**
  - `DeviceGrid` renders a `L2x2` tile whose cell has `style` or computed `grid-column: span 2` and `grid-row: span 2`.
  - `Dashboard` with a `DashboardLayouts` reply of `[{tab:'all', items:[b:L2x2, a:S1x1]}]` renders the tiles in the order b, a.
  - With no layout for the tab, the tiles keep server order.
- [ ] **Step 2: Run `pnpm --filter @home/web test -- DeviceGrid Dashboard` and confirm it FAILS.**
- [ ] **Step 3: Implement.** Tiles fill their cell (`height: 100%`). The camera tile thumbnail grows to fill the remaining height (`CameraThumb fill`). The existing `DeviceTile.test.tsx` assertions must keep passing.
- [ ] **Step 4: Run the full web suite, `pnpm --filter @home/web test`.** Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): render dashboard tiles with per-tab sizes and order"
  ```

---

### Task 5: Web — arrange mode

**Files:**
- Modify: `apps/web/package.json` to add the exact pins `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0` and `@dnd-kit/utilities@3.2.2`
- Create: `apps/web/src/dashboard/layout/useArrangeDraft.ts`, `ArrangeBar.tsx`, `ArrangeGrid.tsx`, `SortableTile.tsx`, `SizePicker.tsx`, `ConfirmResetDialog.tsx`
- Modify: `apps/web/src/dashboard/Dashboard.tsx`, `apps/web/src/dashboard/RoomTabs.tsx` (add a `disabled?: boolean` prop that disables every `Tab`)
- Test: `apps/web/src/dashboard/layout/useArrangeDraft.test.ts`, `apps/web/src/dashboard/layout/ArrangeMode.test.tsx`

**Interfaces:**
- Consumes: `moveEntry`, `resizeEntry`, `toEntries` and `reconcileLayout` (Task 2), `useDashboardLayouts` (Task 3), and the sized `DeviceGrid` and `AnimatedTile` (Task 4).
- `useArrangeDraft()` returns:
  ```ts
  {
    draft: LayoutEntry[] | null
    start: (tiles: readonly ArrangedTile[]) => void
    move: (activeId: string, overId: string) => void
    resize: (deviceId: string, size: TileSize) => void
    stop: () => void
  }
  ```
  The draft holds ids and sizes only. While arranging, the grid shows `reconcileLayout(draft, liveTilesForTab)`, which satisfies Review Focus items 1 and 2. A save sends `toEntries` of that reconciled list.
- `ArrangeGrid` takes `{ tiles: ArrangedTile[]; onMove; onResize }`.
  - Uses `DndContext` with these sensors:
    - `PointerSensor` with `activationConstraint: { distance: 6 }`, for the mouse.
    - `TouchSensor` with `{ delay: 200, tolerance: 8 }`.
    - `KeyboardSensor` with `sortableKeyboardCoordinates`.
  - Uses `SortableContext` with the strategy `() => null`, so no sortable transforms are applied. Reordering happens live in `onDragOver` → `onMove(active.id, over.id)`, and framer-motion's `layout` animates the reflow.
  - A `DragOverlay` shows the lifted card at scale 1.03 with a shadow.
- `SortableTile` renders the `DeviceTile` inside an `inert` wrapper so the tile's own controls get no taps and no focus. On top sits an absolutely positioned overlay that carries the sortable listeners and attributes, has `aria-label={`Move ${device.name}`}`, and shows a dashed amber outline. `SizePicker` sits above the overlay.
- `SizePicker` takes `{ value: TileSize; onChange }`. It is a `role="radiogroup"` with `aria-label="Card size"` and four `role="radio"` buttons labelled with `TILE_SIZE_LABEL`.
- `ArrangeBar` takes `{ arranging; isAdmin; canReset; onStart; onCancel; onSave(asDefault: boolean); onReset }`.
  - When idle, it shows the "Arrange" button.
  - When arranging, it shows "Cancel", "Reset to default" (when `canReset`, i.e. `layoutFor(tab)?.isDefault === false`), and either "Done" (users) or "Save for me" plus "Save as default for everyone" (admins).
- Reset opens `ConfirmResetDialog`, which uses `admin/common/ConfirmDialog` with the confirm label "Reset to default". Reset exits arrange mode.
- On a save failure, the existing `ErrorSnackbar` shows "Couldn't save the layout." and the draft is kept.

- [ ] **Step 1: Add the dnd-kit packages** with `pnpm --filter @home/web add @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2`.
- [ ] **Step 2: Write failing tests.**
  - `useArrangeDraft`: after `start`, `move` and `resize`, the draft reflects them, and `stop` clears it.
  - `ArrangeMode.test.tsx` renders `Dashboard` with the test client:
    - `"blocks taps on tiles while arranging"`: click "Arrange", click a light tile, and `SetDeviceState` is never called.
    - `"disables room tabs while arranging"`.
    - `"resizes a card and saves the tab"`: choose the `2×2` radio on device a, click "Done", and `SaveDashboardLayout` receives `{tab:'all', items:[{deviceId:a,size:'L2x2'},…], asDefault:false}`. Arrange mode exits.
    - `"reorders with the keyboard"`: focus "Move b", press Space, ArrowLeft, Space, then Done. The items start with b.
    - `"keeps the draft and shows an error when saving fails"`: `failWith('BAD_USER_INPUT')`, and the text "Couldn't save the layout." appears with the "Done" button still present.
    - `"keeps the draft when devices update live"`: resize a, push a `deviceState` subscription event for b, and a is still `2×2`.
    - `"admins choose Save as default for everyone"`, which sends `asDefault:true`.
    - `"reset asks first, then resets the tab"`: `ResetDashboardLayout` is called with `{tab:'all'}` only after the confirm.
    - `"Cancel discards the draft"`.
- [ ] **Step 3: Run `pnpm --filter @home/web test -- layout` and confirm it FAILS.**
- [ ] **Step 4: Implement** the files listed above and wire them into `Dashboard`. `ArrangeBar` sits right of the `RoomTabs`, in a flex row.
- [ ] **Step 5: Run `pnpm --filter @home/web test`, `pnpm --filter @home/web typecheck` and `pnpm --filter @home/web lint`.** Expected: all PASS, no lint warnings.
- [ ] **Step 6: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): arrange mode with drag, resize, save, reset"
  ```

---

### Task 6: End-to-end check

- [ ] **Step 1: Apply the migration and run both suites.**
  - Run: `pnpm --filter @home/server db:migrate`, `pnpm --filter @home/server test` and `pnpm --filter @home/web test`
  - Expected: all PASS.
- [ ] **Step 2: Production build.**
  - Run: `pnpm --filter @home/web build` and `pnpm --filter @home/server build`
  - Expected: both succeed.
- [ ] **Step 3: Manual check in the running app.** As admin: arrange "All" with two 2×2 cameras, then "Save as default for everyone". As a second user: confirm you see it, change Rancho, then reset it. Narrow the window to the phone width and confirm the same arrangement reflows into 2 columns. Record what was checked in the final report.
