# Camera Multi-view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/cameras` page that shows several cameras live in a 1/2/4/6/8/16 grid, picked on the spot or from saved (personal or admin-shared) camera groups.

**Architecture:** The camera endpoints get a `quality=sub` option that streams the registry's light stream (`thumb` name: the sub-stream, else main). Camera groups are a small Prisma/GraphQL feature that copies the routines sharing rules (personal/shared, audience, `editable`, owner-access checks). The web app adds `apps/web/src/cameras/` with pure grid and selection logic, a tile player that keeps retrying, the grid, pager and full-screen view, a side panel/drawer, and group dialogs.

**Tech Stack:** TypeScript; server: Apollo Server 5, Prisma 7/Postgres, express + ws camera endpoints, vitest; web: React 19, MUI 9, Apollo Client 4 + codegen, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-09-camera-multiview-design.md`

## Global Constraints

- Layouts: **1, 2, 4, 6, 8, 16**. Shapes (cols×rows): 1 = 1×1, 2 = 2×1, 4 = 2×2, 6 = 3×2, 8 = 4×2, 16 = 4×4. On phones (xs) a page holds at most **4** tiles, shaped like layout 4 (layouts 1 and 2 keep their own shapes).
- Groups: names **1–40** characters after trimming, unique (case-insensitive) per owner for personal groups and among shared groups for shared ones. **1–16** cameras each, no duplicates. Members must be adopted `CAMERA` devices the **owner** can access (shared groups: the admin making the change).
- Sharing exactly as routines: USERs make PERSONAL groups only. Admins make SHARED groups with an audience of USER-role users. Admins see and edit everything. Others' personal groups are admin-only, under "Other users". Scope can't change after creation.
- Viewers only ever get cameras they can access. Group camera lists are filtered per viewer on the server.
- Tile retry backoff after a failure: **2 s, 5 s, 10 s, then 30 s** repeatedly, reset once playing. A session that ended (`ended`) does not retry.
- Grid tiles are muted, request `quality=sub`, and only the current page streams. Full screen stops all tile streams until it closes.
- Small files and components, one concern each, with pure logic in `lib/` and tests.
- Commands: `pnpm --filter @home/server test -- <file>`, `pnpm --filter @home/web exec vitest run <path>`, `pnpm --filter @home/web exec tsc -b`, `pnpm --filter @home/web lint`.

## Review Focus

1. **Camera access revoked mid-view.** The camera vanishes from the panel and grid on the next `devicesChanged` refetch, and its endpoints refuse it. Tested in Task 3 (groups list filtered) and Task 8 (grid built only from visible cameras).
2. **Selection shrinks below the current page** (unticking, or switching to a smaller group). The page index clamps to the last page and never shows an empty page. Tested in Task 5.
3. **A Tuya cloud camera asked for `quality=sub`** (it has no sub-stream). The main stream is served, not an error. Tested in Task 1.
4. **A group whose cameras are all invisible to the viewer** shows "No cameras you can see", not an empty grid or an error. Tested in Task 8.
5. **Full screen while tiles are retrying.** No tile timers fire or streams start while full screen is open, and the grid restarts cleanly on close. Tested in Task 7.

---

### Task 1: Sub-stream choice on the camera endpoints

**Files:**
- Modify: `apps/server/src/cameras/http/webrtc-route.ts`, `apps/server/src/cameras/http/mse-route.ts`
- Create: `apps/server/src/cameras/http/stream-quality.ts`
- Test: `apps/server/test/camera-endpoints.test.ts` (extend)

**Interfaces:**
- Produces:
  - `export type StreamQuality = "main" | "sub"`
  - `export function qualityOf(url: string | undefined): StreamQuality` reads the `quality` query parameter. Anything but `sub` is `main`, and it never throws.
  - `export const streamFor = (names: { live: string; thumb: string }, q: StreamQuality) => (q === "sub" ? names.thumb : names.live)`
  - WebRTC: `POST /api/cameras/:id/webrtc?quality=sub`. MSE: `/api/cameras/:id/mse?quality=sub` (the MSE handler reads `req.url`).

- [ ] **Step 1: Write the failing tests:**
  - `webrtc with quality=sub answers from the light stream` (`webrtcAnswer` called with the sub name).
  - `mse with quality=sub pipes the light stream` (`mseUrl` called with the sub name).
  - `quality=sub on a camera without a sub-stream uses the main stream` (fake `ensure` returning `thumb === live`).
  - `access checks are unchanged for quality=sub` (ungranted USER → 404).
  - Unit: `qualityOf("/x?quality=sub") === "sub"`, `qualityOf("/x?quality=SUB") === "main"`, and `qualityOf(undefined) === "main"`.
- [ ] **Step 2: Run** `pnpm --filter @home/server test -- test/camera-endpoints.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): sub-stream choice on camera endpoints`

---

### Task 2: Camera group tables

**Files:**
- Modify: `apps/server/prisma/schema.prisma`, `apps/server/test/helpers.ts` (truncate list)
- Create: migration `camera_groups` (generated)
- Test: `apps/server/test/camera-group-models.test.ts`

**Interfaces:**
- Produces:
  - `CameraGroup { id cuid, name, scope RoutineScope, ownerId String? (→User "CameraGroupOwner", Cascade), createdById String? (→User "CameraGroupCreator", SetNull), layout Int, createdAt, updatedAt, members CameraGroupMember[], audience CameraGroupAudience[] }`. It reuses `enum RoutineScope`.
  - `CameraGroupMember { groupId (Cascade), deviceId (→Device Cascade), position Int, @@id([groupId, deviceId]) }`
  - `CameraGroupAudience { groupId (Cascade), userId (→User Cascade), @@id([groupId, userId]) }`

- [ ] **Step 1: Write the failing tests:**
  - `deleting a camera removes it from groups`
  - `deleting a user deletes their personal groups and audience rows`
- [ ] **Step 2: Run** `pnpm --filter @home/server test -- test/camera-group-models.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Add the models, run `pnpm --filter @home/server exec prisma migrate dev --name camera_groups`, and extend the TRUNCATE list.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): camera group tables`

---

### Task 3: Camera groups API

**Files:**
- Create: `apps/server/src/camera-groups/validate.ts`, `store.ts`, `members.ts`; `apps/server/src/graphql/resolvers/camera-groups.ts`; `apps/server/src/graphql/camera-group-mappers.ts`
- Modify: `apps/server/src/graphql/schema.graphql`, `apps/server/src/graphql/resolvers/index.ts`, `apps/server/src/graphql/resolvers/subscriptions.ts`, `apps/server/src/graphql/pubsub.ts`, `apps/server/src/devices/topics.ts`
- Test: `apps/server/test/api-camera-groups.test.ts`

**Interfaces:**
- Consumes: `canSeeRoutine`, `canEditRoutine` and `onDashboardOf` from `apps/server/src/routines/access.ts` (same facts shape: `{ scope, ownerId, audience }`); `parseName`; `visibleDevices`.
- Produces GraphQL:
  ```graphql
  type CameraGroup { id: ID!  name: String!  scope: RoutineScope!  owner: User  layout: Int!  cameraIds: [ID!]!  audience: [ID!]!  editable: Boolean! } # cameraIds: in order, only cameras the viewer can see; audience: [] unless admin
  input CameraGroupInput { name: String!  scope: RoutineScope!  layout: Int!  cameraIds: [ID!]!  audience: [ID!] }
  # Query
  cameraGroups: [CameraGroup!]!       # own personal + shared visible (admins: own + all shared); personal first, then shared, each by name
  otherCameraGroups: [CameraGroup!]!  # admin; other users' personal groups
  # Mutation
  createCameraGroup(input: CameraGroupInput!): CameraGroup!
  updateCameraGroup(id: ID!, input: CameraGroupInput!): CameraGroup!   # scope can't change
  deleteCameraGroup(id: ID!): Boolean!
  # Subscription
  cameraGroupsChanged: Boolean!
  ```
- Produces (`validate.ts`, pure): `parseGroupInput(input): { name; layout; cameraIds }`. It throws `badInput` for: layout not in `[1,2,4,6,8,16]` → "Pick a layout of 1, 2, 4, 6, 8 or 16"; 0 or more than 16 cameras → "A group needs 1 to 16 cameras"; duplicates → "A camera can appear only once"; and a bad name (via `parseName(name, "Group name")`).
- Produces (`members.ts`): `checkCameras(prisma, ids, checkAs)`. Unknown, non-adopted or non-`CAMERA` ids → `badInput("Unknown camera")`. A camera `checkAs` can't access → `forbidden("No access to <name>")`.

- [ ] **Step 1: Write the failing API tests**, modelled on `api-routines.test.ts`:
  - `a user creates, reads, updates and deletes a personal group` (camera order kept, layout returned)
  - `rejects a bad layout, too many cameras, duplicates and non-cameras`
  - `a user can't add a camera they can't access` → FORBIDDEN
  - `a user can't create a shared group` → FORBIDDEN
  - `shared groups reach only their audience; users can't edit them` (`editable: false`, `audience: []`)
  - `cameraIds are filtered to what the viewer can see` (Review Focus 1)
  - `admin sees others' personal groups only in otherCameraGroups and edits them against the owner's access`
  - `duplicate names per owner are rejected (case-insensitive)`
  - `scope can't change on update`
  - `lists personal groups before shared, each by name`
  - `cameraGroupsChanged fires on create`
- [ ] **Step 2: Run** `pnpm --filter @home/server test -- test/api-camera-groups.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Updates replace members (with positions from array order) and the audience in one transaction.
- [ ] **Step 4: Run** the test, then the full server suite `pnpm --filter @home/server test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(server): camera groups API`

---

### Task 4: Tile-ready player (quality + persistent retry)

**Files:**
- Create: `apps/web/src/cameras/lib/retryDelay.ts` (+ test), `apps/web/src/cameras/tile/useKeepRetrying.ts`
- Modify: `apps/web/src/device/lib/cameraPaths.ts`, `apps/web/src/device/camera/useLiveStream.ts`, `useWebRtcPlayer.ts`, `useMsePlayer.ts`
- Test: `apps/web/src/cameras/lib/retryDelay.test.ts`, `apps/web/src/device/lib/cameraPaths.test.ts` (create)

**Interfaces:**
- Produces:
  - `webrtcPath(deviceId, quality: 'main' | 'sub' = 'main')` and `mseSocketUrl(deviceId, loc?, quality = 'main')`. They add `?quality=sub` only for sub.
  - `useLiveStream(deviceId, videoRef, cloud = false, quality: 'main' | 'sub' = 'main')`. The device page call is unchanged.
  - `retryDelay(failures: number): number` returns 2000, 5000, 10000, then 30000 for failures ≥ 4.
  - `useKeepRetrying(phase: PlayerPhase): number` returns a `generation` key that increments after `retryDelay(n)` whenever `phase` is `unavailable` or `cloudUnavailable`. `n` resets when `playing`, and there's no retry on `ended`. Timers clear on unmount.

- [ ] **Step 1: Write the failing tests:**
  - `retryDelay` values for 1–6 failures.
  - `cameraPaths` with and without sub.
- [ ] **Step 2: Run** `pnpm --filter @home/web exec vitest run src/cameras/lib src/device/lib/cameraPaths.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The quality is threaded through to both transports.
- [ ] **Step 4: Run** those tests plus `src/device`. Expected: PASS (device page tests unchanged).
- [ ] **Step 5: Commit** `feat(web): sub-stream quality and keep-retrying for camera tiles`

---

### Task 5: Grid and selection logic

**Files:**
- Create: `apps/web/src/cameras/lib/gridLayout.ts`, `selection.ts` (each + test)

**Interfaces:**
- Produces (`gridLayout.ts`):
  ```ts
  export const LAYOUTS = [1, 2, 4, 6, 8, 16] as const; export type Layout = (typeof LAYOUTS)[number]
  export function gridShape(layout: Layout, phone: boolean): { cols: number; rows: number; perPage: number }
  export function pageCount(total: number, perPage: number): number   // ≥ 1
  export function clampPage(page: number, total: number, perPage: number): number
  export function pageItems<T>(items: readonly T[], page: number, perPage: number): T[]
  ```
- Produces (`selection.ts`):
  ```ts
  export type Selection = { cameraIds: string[]; layout: Layout; groupId: string | null }
  export function toggleCamera(s: Selection, id: string): Selection // appends or removes; keeps groupId
  export function selectGroup(group: { id: string; cameraIds: string[]; layout: number }): Selection
  export function differsFromGroup(s: Selection, group: { cameraIds: string[]; layout: number } | null): boolean
  export function visibleSelection(s: Selection, visibleIds: ReadonlySet<string>): string[] // order kept
  export function initialSelection(groups: { mine: Group[]; shared: Group[] }): Selection // first of mine, else shared, else empty with layout 4
  ```

- [ ] **Step 1: Write the failing tests:**
  - every shape for desktop and phone (16 on phone → 2×2, perPage 4);
  - paging of 6 items in 4 → pages `[0..3]`, `[4,5]`;
  - `clampPage(1, 3, 4) === 0` (Review Focus 2);
  - toggle order;
  - `differsFromGroup` when order, set or layout changes;
  - `visibleSelection` drops invisible cameras;
  - `initialSelection` preference order.
- [ ] **Step 2: Run** `pnpm --filter @home/web exec vitest run src/cameras/lib`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): camera grid and selection logic`

---

### Task 6: Camera groups data layer

**Files:**
- Create: `apps/web/src/cameras/data/documents.ts`, `useCameraGroups.ts`, `useSaveCameraGroup.ts`, `useDeleteCameraGroup.ts`, `apps/web/src/cameras/types.ts`, `apps/web/src/test/cameraGroupFixtures.ts`
- Test: `apps/web/src/cameras/data/useCameraGroups.test.tsx`

**Interfaces:**
- Produces:
  - Fragment `CameraGroupFields` (all fields plus `owner { id name role }`).
  - Operations `CameraGroups`, `OtherCameraGroups`, `CreateCameraGroup`, `UpdateCameraGroup`, `DeleteCameraGroup`, `CameraGroupsChanged`.
  - `useCameraGroups(isAdmin): { mine: CameraGroup[]; shared: CameraGroup[]; others: CameraGroup[]; loading }`. It refetches in the background on `cameraGroupsChanged` (like `useRoutines`).
  - `useSaveCameraGroup()` returns `{ save(id | null, input) → Promise<string>, saving }`.
  - `useDeleteCameraGroup()` returns `remove(id)`. Errors go through `routineErrorMessage` (reuse).

- [ ] **Step 1: Write the failing test:** splits into mine/shared by scope, and refetches on `cameraGroupsChanged`.
- [ ] **Step 2: Run** `pnpm --filter @home/web exec vitest run src/cameras/data`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): camera groups data layer`

---

### Task 7: Grid, tiles, pager and full screen

**Files:**
- Create: `apps/web/src/cameras/grid/CameraGrid.tsx`, `GridToolbar.tsx` (layout picker + pager + full-screen button), `apps/web/src/cameras/tile/CameraTile.tsx`, `TileVideo.tsx`, `apps/web/src/cameras/grid/FullCamera.tsx`
- Test: `apps/web/src/cameras/grid/CameraGrid.test.tsx`

**Interfaces:**
- Consumes: Tasks 4–5; `CameraPlayer` (full screen, main quality); `opensDetailsOnTap`/cloud info from the `Device` (`streamSource === 'CLOUD'` → `cloud`).
- Produces:
  - `CameraGrid({ cameras: Device[], layout, onLayout })` owns page state (clamped), renders `GridToolbar`, then `perPage` slots. Slots past the cameras are dark placeholders.
  - Tapping a tile opens `FullCamera` (a full-height MUI `Dialog`, `fullScreen` on xs) with `CameraPlayer`. **While it's open, no `CameraTile` is mounted** (Review Focus 5).
  - `CameraTile({ device })` shows the name overlay and a status chip ("Reconnecting…" while retrying, "Unavailable" between tries). `TileVideo` remounts its `<video>` and `useLiveStream(..., 'sub')` with `key={generation}` from `useKeepRetrying`.
  - The grid area's full-screen button uses `toggleFullScreen` (`device/lib/fullScreen`).

- [ ] **Step 1: Write the failing tests** (stub `useLiveStream` via `vi.mock` to control phases):
  - a 4-layout with 6 cameras shows 4 tiles and "Page 1 of 2", and next shows 2 tiles plus 2 empty slots;
  - the layout picker changes the count;
  - tapping a tile opens the full view with that camera's name, and no tiles render meanwhile; closing restores them (Review Focus 5);
  - tiles request `'sub'`;
  - a tile at `unavailable` restarts after 2 s (fake timers).
- [ ] **Step 2: Run** `pnpm --filter @home/web exec vitest run src/cameras/grid`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): camera grid with tiles, paging and full view`

---

### Task 8: Cameras page, side panel and navigation

**Files:**
- Create: `apps/web/src/pages/CamerasPage.tsx`, `apps/web/src/cameras/CamerasView.tsx`, `apps/web/src/cameras/panel/CameraPanel.tsx`, `GroupList.tsx`, `CameraChecklist.tsx`, `PanelDrawer.tsx`
- Modify: `apps/web/src/AppRoutes.tsx` (`/cameras`), `apps/web/src/layout/AppHeader.tsx` ("Cameras" before "Routines")
- Test: `apps/web/src/cameras/CamerasView.test.tsx`, `apps/web/src/layout/AppHeader.test.tsx` (extend)

**Interfaces:**
- Consumes: Tasks 5–7; `useDevices` (cameras = `kind === 'CAMERA'`).
- Produces:
  - `CamerasView({ isAdmin })` holds `Selection` (starting with `initialSelection`) and builds the grid from `visibleSelection`.
  - The side panel (md and up) or a drawer (xs/sm, opened by a "Cameras & groups" button) has:
    - **My groups**, **Shared**, and (admins, collapsed) **Other users** with the owner's name;
    - then a **Cameras** checklist.
  - The highlighted group is `selection.groupId`.
  - No visible cameras at all → "You don't have any cameras yet." A selected group with no visible cameras → "No cameras you can see" (Review Focus 4). Nothing selected → "Pick cameras or a group".

- [ ] **Step 1: Write the failing tests:**
  - it opens on the first personal group with its layout;
  - ticking a camera adds it to the grid and keeps the group highlighted;
  - picking a shared group replaces the cameras;
  - a group with only invisible cameras shows the message (Review Focus 4);
  - a USER sees no Other users section;
  - the header has a "Cameras" link to `/cameras`.
- [ ] **Step 2: Run** `pnpm --filter @home/web exec vitest run src/cameras/CamerasView.test.tsx src/layout`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): cameras page with groups panel`

---

### Task 9: Save, update and manage groups

**Files:**
- Create: `apps/web/src/cameras/groups/SaveGroupDialog.tsx`, `GroupSettingsDialog.tsx`, `GroupCameraOrder.tsx`, `GroupActions.tsx`, `apps/web/src/cameras/lib/groupInput.ts` (+ test)
- Modify: `apps/web/src/cameras/CamerasView.tsx`
- Test: `apps/web/src/cameras/groups/GroupDialogs.test.tsx`

**Interfaces:**
- Consumes: Task 6 hooks; `SelectField` (layout), `AudienceChecklist` (from routines editor) for shared groups.
- Produces:
  - `groupInput(draft): CameraGroupInput` and `groupErrors(draft): string[]` mirror the server rules with the same messages.
  - `GroupActions` shows **Save as group** (when 1+ cameras are ticked), **Update group** (when the highlighted group is `editable` and `differsFromGroup`), and **Group settings** (when the highlighted group is editable).
  - `SaveGroupDialog` takes a name, plus a **Shared** switch and audience for admins.
  - `GroupSettingsDialog` covers name, preferred layout, camera order (move up/down, remove), audience (shared, admin) and **Delete** with confirmation. For another user's group (admin), the save is checked server-side against the owner.

- [ ] **Step 1: Write the failing tests:**
  - Save as group sends `CreateCameraGroup` with the ticked order and current layout.
  - Update group appears after a change and sends `UpdateCameraGroup`.
  - Settings reorders, removes and saves.
  - Delete confirms, then sends `DeleteCameraGroup`.
  - A USER has no Shared switch.
  - A server error message shows in the dialog.
  - `groupErrors` covers 0 or 17 cameras and an empty name.
- [ ] **Step 2: Run** `pnpm --filter @home/web exec vitest run src/cameras/groups src/cameras/lib/groupInput.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full web suite, typecheck and lint: `pnpm --filter @home/web test`, `pnpm --filter @home/web exec tsc -b`, `pnpm --filter @home/web lint`. Expected: all pass, with no warnings.
- [ ] **Step 5: Commit** `feat(web): save, update and manage camera groups`

---

### Task 10: Verification

- [ ] **Step 1:** `pnpm test` (repo root). Expected: everything passes.
- [ ] **Step 2:** `pnpm build`. Expected: success.
- [ ] **Step 3:** Hand-check list for the user (not run here; it needs the real cameras):
  - a 4-grid of the Swann channels;
  - a mix with a cloud camera;
  - paging;
  - full screen and back;
  - phone width;
  - a dropped camera reconnecting.
