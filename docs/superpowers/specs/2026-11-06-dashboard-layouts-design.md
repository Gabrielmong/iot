# Custom Dashboard Layouts — Design

*Date: 2026-11-06 · Status: reviewed, awaiting approval · Builds on: the Stage 2 dashboard (`apps/web/src/dashboard/`) and the UI polish pass (framer-motion, tile glow)*

## 1. Intent

The dashboard is a fixed grid of equal tiles in server order. With ten cameras, lights and plugs mixed together, the important things (the garage camera, the street camera) are the same size as a lamp, and nobody can put them where they want.

This adds **arrangeable dashboards**: cards can be dragged into any order and resized up to 2×2, separately for each tab. The admin's arrangement is everyone's default; each person can then make their own.

## 2. Goals

- Drag and drop cards to reorder them, on desktop (mouse) and on a touch tablet or phone.
- Resize each card to one of four sizes: **1×1, 2×1 (wide), 1×2 (tall), 2×2**.
- **Every tab has its own arrangement**: "All" and each room tab (Gabriel's Room, Rancho, Sala 2, …).
- **The admin's arrangement is the default for everyone**, per tab.
- **Each user can override the default** per tab, and **reset that tab to the default**.
- Arrangements are stored on the server, so they follow the user to every screen they sign in on.
- One arrangement works on every screen width: the 6-column desktop, the 3–4 column tablet and the 2-column phone.

## 3. Non-goals

- Sizes bigger than 2×2 (the user capped it at 2×2).
- Free x/y placement with empty space left on purpose. Cards always pack together.
- Separate arrangements per screen size or per physical screen.
- Admin "locking" a layout so users can't change it.
- Arranging the admin pages or the device details page.
- Hiding cards from a tab. Every visible device stays on the dashboard.

## 4. Anti-goals

- **Switching a device by accident while arranging.** In arrange mode, tapping a card must never toggle it or open its page.
- **A layout revealing devices a user can't access.** The server only returns arrangement entries for devices the user can see, and the client never shows a card for a device it wasn't sent.
- **A stale arrangement breaking the dashboard.** Removed devices, devices moved to another room, new devices and lost access must all degrade quietly. There must be no errors, no blank cards and no missing devices.
- **Losing the everyday feel.** Outside arrange mode the dashboard behaves exactly as now: tap toggles, long-press and ⋯ open details, and the existing animations and glow stay.

## 5. Constraints

- Monorepo: `apps/web` (React 19, MUI 9, Apollo 4, framer-motion 14.6.0, Vite) and `apps/server` (GraphQL schema in `src/graphql/schema.graphql`, Prisma on Postgres, migrations in `apps/server/prisma/migrations`).
- Grid breakpoints stay as in `apps/web/src/dashboard/lib/gridColumns.ts`: xs 2, sm 3, md 4, lg 6 columns.
- Project rule: small files and components with separated concerns. Pure logic goes in `lib/` with tests, and each component does one job.
- Users only see devices they have grants for (admins see all). Tabs only list rooms that contain at least one device the user can see (`roomTabs`).
- Power-strip parents are hidden when their outlets are shown (`visibleTiles`). Arrangements apply to the visible tiles.

## 6. Decisions made with the user

1. **Sizes:** 1×1, 2×1, 1×2, 2×2. Nothing larger.
2. **Default and override:** the admin's arrangement is the default; each user can customize their own.
3. **Per tab:** each room tab has its own arrangement, and so does "All".
4. **Arrange mode** (as shown in the mockup the user accepted): an **Arrange** button next to the tabs switches the current tab into arrange mode. Cards get a dashed outline. Dragging reorders them, and each card shows a size picker. **Done** saves. **Reset to default** returns this tab to the admin's arrangement. While arranging, taps do nothing to the device.
5. **One arrangement for every width:** an arrangement is an **ordered list plus a size per card**. The grid fills rows in order and lets smaller cards fill gaps (CSS `grid-auto-flow: dense`). The same arrangement therefore reflows on a phone instead of needing its own layout.
6. **No holes over exact order:** because gaps are filled, a small card can appear slightly earlier on screen than its place in the list, and this can differ between screen widths. **The user accepted these small order shifts** in exchange for a grid with no holes. Drag drop positions and keyboard moves work on the list order.

## 7. Behaviour

### 7.1 Data model (per tab)

An arrangement is a list of `{ deviceId, size }` in display order, where `size ∈ {S1x1, W2x1, T1x2, L2x2}`. The tab key is either `all` or a room id.

There are two layers:

- **Default:** one arrangement per tab, saved by an admin.
- **User override:** one arrangement per user per tab.

**What a user sees for a tab:** their override if they have one, otherwise the default, otherwise server order at 1×1 (today's behaviour). The chosen arrangement is then reconciled with the user's visible devices for that tab:

1. Keep entries whose device is visible in that tab, in their stored order.
2. Drop entries for devices that are gone, inaccessible, hidden (power-strip parent) or no longer in that room.
3. Append visible devices that have no entry, at 1×1, in the current server order.

This reconciliation is pure client logic (`lib/`, unit-tested). The server applies the access filter itself (anti-goal 4.2) and does not need to reconcile rooms.

### 7.2 Arrange mode

- **Arrange** button: shown at the right of the tab bar for every signed-in user. It enters arrange mode for the **current tab only**. *(Builder-check call: the room tabs are disabled while arranging, so Done, Cancel and Reset always act on exactly one tab and there is no multi-tab draft state.)*
- **While arranging:**
  - Cards show a dashed amber outline and a size picker of four small buttons, with the current size highlighted.
  - The tile's own tap, long-press and ⋯ menu are disabled.
  - Camera tiles keep refreshing their thumbnails.
- **Drag:**
  - Mouse: drag anywhere on the card.
  - Touch: press and hold briefly (about 200 ms) then drag, so the page still scrolls.
  - Keyboard: focus a card, press Space to pick it up, use the arrow keys to move it and Space to drop it.
  - The other cards slide out of the way using the existing framer-motion layout animation.
- **Bar actions:**
  - **Done** saves the edited tabs.
  - **Cancel** discards the edits.
  - **Reset to default** deletes the user's override for the current tab, after a confirm, and exits.
  - **For admins:** Done becomes two choices, **Save for me** and **Save as default for everyone**, and Reset to default is still available. Saving as default does not touch other users' overrides. *(Builder-check call: saving as default also deletes the admin's own override for that tab in the same transaction, so the admin sees exactly what everyone else gets.)*
- **Feedback:** on a save failure the existing error snackbar shows "Couldn't save the layout." and the user stays in arrange mode with their edits. On success, arrange mode exits.

### 7.3 Server

- **New Prisma models:**
  - `DashboardLayout`: `id`, `userId?` (null means the default), `tab` (`'all'` or a room id), `items Json` (an array of `{ deviceId, size }`) and `updatedAt`. It has a unique constraint on (`userId`, `tab`). The default row with `userId = null` needs a partial unique index or an explicit sentinel. Choose one and note it in the migration.
  - Cascade: deleting a user deletes their layouts. Deleting a room leaves its rows orphaned, and they are pruned on write or ignored. Device removals are handled by the reconciliation in 7.1.
- **GraphQL:**
  - Query `dashboardLayouts: [DashboardLayout!]!` returns the effective arrangement per tab for the current user, override first and default otherwise, with items filtered to devices the user can access. Each layout includes `tab`, `items { deviceId size }` and `isDefault: Boolean!`, which tells the UI whether Reset has anything to do.
  - Mutation `saveDashboardLayout(tab, items, asDefault: Boolean = false)`. `asDefault: true` requires ADMIN. Validation: each `deviceId` appears at most once, every size is a known value, and there are at most 500 items. Unknown or inaccessible device ids are silently dropped, not rejected.
  - Mutation `resetDashboardLayout(tab)` deletes the caller's override for that tab.
- **Guards:** reuse the existing auth and role guards in `src/graphql/guards.ts`.

### 7.4 Web

- **Libraries:** `@dnd-kit/core` and `@dnd-kit/sortable` for drag and drop (pointer, touch and keyboard sensors). Pin to a release at least two weeks old, as was done for framer-motion.
- **Grid:** `DeviceGrid` keeps its CSS grid and gains `grid-auto-flow: dense` and a fixed row height. The card size maps to `grid-column: span 1|2` and `grid-row: span 1|2`. On the 2-column phone, a 2-wide card spans the full width.
- **Tile content at larger sizes:** a camera's thumbnail fills the larger card. A light or plug at 2×1, 1×2 or 2×2 shows the same content as now with more room. No new per-size designs for now (builder's call to keep it simple).
- **Animations:** the existing `AnimatedTile` layout animation drives reflow. While a card is dragged it lifts with a slight scale and shadow.
- **Suggested file split** (builder may adjust): `lib/reconcileLayout.ts`, `lib/tileSize.ts`, `layout/useDashboardLayout.ts` (query, mutations, per-tab draft state), `layout/ArrangeBar.tsx`, `layout/SizePicker.tsx`, `layout/SortableTile.tsx`, `layout/ArrangeButton.tsx`.

## 8. Success looks like

- The user makes the garage and street cameras 2×2 at the top of "All", and the Rancho tab differently. Both look right on the PC, and the phone shows the same arrangement (allowing the small gap-filling shifts from decision 6).
- A second user who never arranged anything sees the admin's arrangement.
- That user rearranges Rancho, sees their version on the tablet too, and "Reset to default" brings back the admin's.
- Adding a new device, removing one, or moving one to another room never breaks a tab.
- In arrange mode, no device ever switches.

## 9. Left to the builder

- Exact row height and how a 1×1 tile's height relates to today's (about 112–130 px).
- How the default-row uniqueness is enforced in Postgres (see 7.3).
- Whether the arrangement query is fetched with the devices query or on its own, and whether it refetches on `devicesChanged`.
- Visual details of the size picker and arrange bar, within the existing theme (amber accent, 10px corners).
- Test coverage: unit tests for reconciliation and size mapping, resolver tests for access filtering and the admin-only default, and component tests for arrange mode blocking taps and for save, cancel and reset.
