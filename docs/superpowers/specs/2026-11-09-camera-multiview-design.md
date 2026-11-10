# Camera Multi-view — Design

*Date: 2026-11-09 · Status: reviewed, awaiting approval · Builds on: Stage 2 cameras (`apps/server/src/cameras/`, `apps/web/src/device/camera/`) and the routines sharing model (`docs/superpowers/specs/2026-11-09-routines-design.md`)*

## 1. Intent

Today each camera is watched on its own device page. The user wants what the Swann recorder's portal offers: **several cameras live at once in a grid** (1, 2, 4, 6, 8 or 16 channels). They want to pick any cameras on the spot, or open **saved groups** like "Front of house" or "All outside".

## 2. Goals

- A new **Cameras** page (`/cameras`), linked from the app header for everyone. The layout is the one the user picked (mockup option B):
  - **Side panel:** saved groups first, then every camera the user can see, each with a checkbox. On phones the panel folds into a drawer.
  - **Grid area:** a layout picker (**1, 2, 4, 6, 8, 16**) and a full-screen button.
- **Pick on the spot:** ticking cameras puts them in the grid, in the order they were ticked.
- **Saved groups:** choosing a group fills the grid with its cameras, in its order, using its preferred layout.
- **Save as group** turns the current selection and layout into a new group. **Update group** (shown while an editable group is highlighted and the view differs from it) saves the current cameras, order and layout into that group. The group dialog renames, reorders cameras, removes cameras, sets the preferred layout, shares and deletes.
- **Sharing follows routines exactly.** Anyone can create **personal** groups. The admin creates **shared** groups and picks which users see them. Admins see and edit every group. Users can view shared groups but not edit them.
- **Access is always enforced.** A viewer only ever sees, and only ever gets streams for, cameras they can access (admins: all). A camera they lose access to silently drops out of their view of a group.
- **Paging:** when more cameras are selected than the layout holds, the grid pages, with previous/next arrows and "page 1 of 2". Empty slots stay dark.
- **Phones** (xs breakpoint): at most **4** tiles per page, whatever layout is chosen.
- **Grid tiles stream the light sub-stream** when the camera has one (Swann channels do), so 16 tiles stay smooth. **Tapping a tile** opens that one camera full screen at full quality, and closing returns to the grid.
- **Tiles:** each shows the camera name. If a feed drops, the tile shows a small status and **keeps retrying** with a backoff (not just once). The rest of the grid is unaffected.

## 3. Non-goals

- Automatic page cycling (Swann's "sequence" mode): deferred.
- Recordings and playback: Stage 2b.
- Audio in the grid. Tiles are muted, and full-screen single view behaves like today's device page.
- PTZ or any camera control from the grid.
- Custom tile sizes or spans inside the grid. Every tile is equal, NVR-style.
- Remembering the last on-the-spot selection across visits. *(Builder may keep it per browser in localStorage as a convenience; not required.)*

## 4. Anti-goals

- **A grid leaking a camera.** The server must refuse a sub-stream for a camera the caller can't access, exactly as it does for the main stream today. Group membership never grants access.
- **The grid bringing down the streaming helper.** 16 main-quality streams at once must not be what a 16-grid does.
- **One dead camera spoiling the view.** Errors stay inside their own tile.
- **Changing the device page.** The single-camera player keeps its current behaviour.

## 5. Constraints

- Stack as elsewhere: Prisma/Postgres, Apollo GraphQL, React 19 + MUI 9, Apollo client + codegen. Small files and components, one concern each, with pure logic tested in `lib/`.
- **Streams today:** the server registers two go2rtc streams per camera, `live` and `sub` (`apps/server/src/cameras/streams/stream-names.ts`). Swann channels have a `subPath` (`swann-streams.ts`). Tuya cloud cameras have only one stream. The web player (`apps/web/src/device/camera/useLiveStream.ts`, WebRTC with MSE fallback) always asks for the main stream via the camera HTTP/WS endpoints in `apps/server/src/cameras/http/`, which check access with the session (`auth.ts`) and track viewers (`streams/viewers.ts`).
- **Tuya cloud cameras** allocate a temporary cloud URL per stream (`cloud-allocation.ts`). Several cloud cameras in one grid each allocate their own. They show their normal stream in a tile, since they have no sub-stream.
- Camera access: `canAccessDevice` (`apps/server/src/services/grants.ts`). Visible cameras: devices of kind `CAMERA` from the `devices` query.
- Sharing semantics, audience rules and multi-admin behaviour mirror routines (routines spec §6–7, calls 3, 19, 20). Reuse the same patterns: `RoutineScope`-style `PERSONAL | SHARED`, an audience table, and `editable`.

## 6. Decisions made with the user

1. Layouts are 2, 4, 6, 8 and 16 channels, like Swann's portal. *(1 was added as my call, for a single large view; see §7.)*
2. Both saved groups and on-the-spot picking.
3. Group sharing follows the routines rules.
4. Screen layout: Swann-style side panel with groups and camera checkboxes, grid on the right, drawer on phones (mockup B).
5. The playback above (sub-streams in tiles, tap for full quality, paging, phone cap of 4, keep retrying, no auto-cycle) was accepted as described.

## 7. Calls I made (flagged for review)

1. **Layout "1"** is offered in addition to the user's 2/4/6/8/16, so one camera can fill the grid area without leaving the page.
2. **Grid shapes:** 1 = 1×1, 2 = 2×1 (side by side), 4 = 2×2, 6 = 3×2, 8 = 4×2, 16 = 4×4. On narrow screens, columns shrink to fit and 4 is the most per page on phones (2×2).
3. **Group limits:** names are 1–40 characters, unique per owner (shared groups unique among shared). Up to **16 cameras** per group. A group has at least 1 camera.
4. **A group's preferred layout** is saved with it. Opening a group uses that layout, and changing the layout while viewing doesn't save unless the user edits the group.
5. **Selecting a group replaces** the ticked cameras with the group's. Ticking or unticking afterwards turns the view back into an on-the-spot selection, and the group stays highlighted until changed.
6. **Panel sections and default:** the side panel lists **My groups** then **Shared** (each by name), like routines. Opening the page selects the first group in that order, or no cameras with a short hint if there are none.
7. **Sub-stream selection:** the camera endpoints accept a stream choice (main or sub). Asking for "sub" on a camera without one serves the main stream. Access checks and viewer tracking are identical for both.
8. **Retry in tiles:** after a drop, a tile retries with backoff (2 s, 5 s, 10 s, then every 30 s) for as long as it's on screen. Off-page tiles don't stream at all.
9. **Only the visible page streams.** Changing page stops the old tiles' streams and starts the new ones.
10. **Deleting a camera** removes it from every group. A group left with no cameras stays and shows "No cameras you can see". Deleting a user deletes their personal groups and audience rows (same as routines).
11. **Admins' "Other users" groups** appear in a collapsed **Other users** section at the bottom of the side panel (admins only), showing the owner's name. Admins can open them live and edit them; edits are checked against the **owner's** camera access, and the dialog's camera list offers only the owner's cameras (routines call 20).
12. **Navigation:** a "Cameras" header link for everyone. If the user can see no cameras, the page says so and offers nothing else.
13. **Full screen pauses the grid.** While one camera is open full screen, the grid's tile streams stop, and they resume when it closes. This keeps the number of simultaneous connections to the recorder and the Tuya cloud down; the Swann recorder has 4 wired channels today, so a grid opens at most 4 Swann sub-streams.
14. **Changing a group's cameras** goes through the same server checks as creating one: every camera must exist, be a camera, and be accessible to the owner (admin: all).

## 8. Left to the builder

- Data model (e.g. `CameraGroup`, `CameraGroupMember` with position, `CameraGroupAudience`), migration, GraphQL names.
- How the endpoints take the stream choice (query parameter or path) and the matching change in the web player hooks, keeping the device page unchanged.
- Component breakdown of the page, panel, drawer, grid, tile, pager, full-screen view and group dialog.
- Exact grid styling and the full-screen mechanics, within the existing theme.
- Test strategy following existing patterns (`api-harness.ts`; vitest + Testing Library with `test/testClient`).
