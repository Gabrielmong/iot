# House 3D view: Sweet Home 3D import + live control

Date: 2026-11-18 · Status: draft for approval

## Why

The original design (`2026-11-05-home-control-design.md` §7.6–7.7, Phase 3) promised a 3D house that
doubles as a live control view: lights show their real colour, tapping a device controls it. It was never
built. The owner wants it now, modelled in **Sweet Home 3D** (free, accurate, already does walls, doors,
furniture at real sizes), and still wants the in-app **house builder** later.

This round therefore imports the `.sh3d` file itself (not an OBJ export) and converts it into **our own
house model**, rendered by **our own wall geometry**. That moves the builder forward: the builder will
later edit the same model with the same geometry code, and `.sh3d` becomes one way to seed it.

Prior art reviewed: Hollako/Home-Assistant-3D-Floorplan (bring-your-own GLB, click-to-place markers) and
Mastershort/neonplan3d (rooms-as-polygons model, walls generated, openings on walls, placements with
x/y/z). We borrow ideas only; no code is copied.

## Goals

1. **Import**: an admin uploads a `.sh3d`; the server converts it to our house model and unpacks its
   furniture models. Re-uploading replaces the house and **keeps device placements**.
2. **3D view** (`/house`): orbit the house, switch floors, no ceilings so rooms are visible from above.
   Walls (with door/window holes), room floors, furniture, doors and windows are shown.
3. **Live devices**: every placed device the viewer may see is shown at its spot. **Lights glow** in
   their current colour and brightness (bulb + halo + light pool on the floor). Other devices show a
   marker that glows green when on, exactly like dashboard tiles.
4. **Control**: same gestures as a dashboard tile. Tap toggles; long-press opens device details;
   devices that open on tap (cameras, etc.) open on tap.
5. **Placement (admin)**: an edit mode to place, move and remove devices by clicking in 3D. Clicking a
   Sweet Home 3D light fixture snaps the bulb to that fixture's light source.
6. **Room linking**: imported SH3D rooms auto-link to our `Room` rows by name (case-insensitive,
   trimmed); the admin can change or clear each link. This round the link is **stored for the builder
   and nothing more**; the 3D view shows each room's name as a floor label (our Room's name when
   linked, else the SH3D name). No navigation, filtering or permissions depend on it yet.
7. **Builder-ready**: the house model and wall geometry live in a pure, framework-free TypeScript
   package with exact-value unit tests, reusable by the future builder unchanged.

## Non-goals (this round)

- Editing walls, rooms, furniture or doors in the app (that is the builder).
- A 2D plan view, furniture catalogue, undo/redo of geometry.
- Real-time light casting/shadows (glow is faked; see §Rendering).
- Importing anything other than `.sh3d` (OBJ/GLB/DXF upload, RoomPlan, …).
- Model formats other than OBJ inside the `.sh3d` (DAE/3DS pieces render as a plain box of their size).
- Textures on walls/floors (colours only). Furniture keeps its own OBJ/MTL textures.
- SH3D extras: dimension lines, labels, compass, polylines, cameras, background images, sky/ground.
- Cutaway / lowered-wall view mode.

## Anti-goals

- Geometry that drifts from the source: a 4.00 m wall in Sweet Home 3D must be exactly 4.00 m here;
  walls must meet cleanly at joins.
- The dashboard getting slower or heavier because of three.js (the 3D page must load on its own).
- A re-upload silently losing device placements.
- Guests or limited users seeing devices they have no grant for, in 3D or via the house API.
- One giant viewer file. Follow the project rule: small components, small pure functions, each tested.

## Constraints

- Monorepo: pnpm, TypeScript 7, React 19 + MUI 9 + Apollo 4 (web), Express 5 + Apollo Server +
  Prisma 7/Postgres (server), vitest everywhere.
- Must run smoothly on a phone, a wall tablet, and inside the Android app (a WebView over the web app).
- Deployed releases are read-only; writable data lives in a configured folder (like `ANDROID_APK_DIR`,
  `AGENT_DIR`, set by `scripts/apply-service-settings.ps1`).
- Live device state already reaches the web app through the `DeviceState`/`DevicesChanged`
  subscriptions (`apps/web/src/dashboard/data/useDevices.ts`). The 3D view reuses that data and the
  dashboard's visual helpers (`tileGlow`, `dotColor`, `isDeviceOn`, `canToggle`, `tileOnStyle`).

## Approaches considered

| | What | Trade-off |
|---|---|---|
| a | Upload an **OBJ export** per floor; render it as-is; place devices on it | Cheapest; zero geometry work. Re-export per change; nothing reusable for the builder. |
| **b (chosen)** | Upload the **`.sh3d`**; parse `Home.xml` into our model; **generate walls ourselves**; load furniture OBJs from the file | Floors and room names come in automatically; wall geometry is the builder's core, built now. More work up front. |
| c | OBJ for display + store `.sh3d` for later | More upload steps for the owner; still nothing built toward the builder. |

The owner picked **b** because it advances the future builder.

## What the `.sh3d` contains (verified on the official example file)

- A zip. Entries: `Home` (Java-serialised, ignored), **`Home.xml`**, and numbered content entries.
  A content entry is either a single file (an OBJ model, or a JPEG/PNG image) or a folder
  (`11/com_bath3.obj`, `11/com_bath3.mtl`, `11/toalla_bump.jpg`).
- A piece's `model` attribute names the entry: `model='5'` (single OBJ file) or
  `model='95/hanging-restaurant-light.obj'` (OBJ inside a folder, next to its MTL and textures).
- **Units are centimetres; angles are radians.** Plan axes: `x` right, `y` down (screen convention);
  elevation is up.
- Elements used: `level`, `wall` (`xStart yStart xEnd yEnd thickness height heightAtEnd arcExtent
  wallAtStart wallAtEnd level leftSideColor rightSideColor topColor`), `room` (`name level floorColor
  floorVisible` + `point x y` children), `pieceOfFurniture`, `doorOrWindow` (adds `wallThickness
  wallDistance cutOutShape boundToWall`, `sash` children), `light` (adds `power`, `lightSource x y z
  color diameter` children), `furnitureGroup` (nested pieces). Common piece attributes: `id name x y
  elevation width depth height angle model modelRotation modelMirrored visible level`.
- **Single-level homes have no `level` elements**, and walls/pieces then carry no `level` attribute.
- Old files (the example is `version='5300'`) have no `id` on pieces; `level` always has an `id`.
- The DTD has typos; parse leniently, never validate against it.

**To verify with the owner's real file** (not stated by any source we could read): that piece
`elevation` is relative to its level's elevation; that `wall.height` missing means `home@wallHeight`;
the exact rule for fitting a model to `width/depth/height` after `modelRotation`. Each is isolated in
one function with a test, so a wrong assumption is a one-line fix.

## Design

### 1. `packages/house` — the house model and geometry (new, pure TS)

New workspace package `@home/house`, built like `@home/protocols` (tsc + vitest), no runtime
dependencies, no three.js, no DOM. Used by the server (import) and web (rendering), and later by the
builder.

**Our coordinate system:** metres; `x` = SH3D x, `z` = SH3D y (so the plan's "down" is +z), `y` = up.
Angles in radians around +y.

**House model** (stored as one JSON document, `version: 1`):

```ts
type Vec2 = { x: number; z: number }

type House = {
  version: 1
  floors: Floor[]
}

type Floor = {
  id: string            // stable: derived from SH3D level id ("default" when the home has no levels)
  name: string
  elevation: number     // m, bottom of the floor slab
  height: number        // m, default wall height of the level
  floorThickness: number
  walls: Wall[]
  rooms: HouseRoom[]
  openings: Opening[]   // doors & windows that cut a wall
  furniture: Piece[]    // everything else, including light fixtures and unattached doors/windows
}

type Wall = {
  id: string
  start: Vec2; end: Vec2
  thickness: number
  height: number; heightAtEnd?: number   // sloped top when present
  arc?: number                           // arcExtent (radians); straight when absent
  joinStart?: string; joinEnd?: string   // ids of the walls joined at each end
  colors: { left?: string; right?: string; top?: string }   // #rrggbb
}

type HouseRoom = {
  id: string
  name: string
  points: Vec2[]
  floorColor?: string
  floorVisible: boolean
  roomId?: string       // link to our Room row; set on import by name, editable by admin
}

type Opening = {
  id: string
  wallId: string
  offset: number        // m along the wall from `start` to the opening's centre
  width: number; height: number; sill: number   // sill = bottom of the hole above the floor
  piece: Piece          // the door/window model itself
}

type Piece = {
  id: string
  name: string
  kind: 'furniture' | 'doorOrWindow' | 'light'
  model?: string        // asset path under the house asset folder, e.g. "95/hanging-restaurant-light.obj"
  position: Vec2        // centre of the footprint
  elevation: number     // m above the floor's elevation
  size: { width: number; depth: number; height: number }
  angle: number
  modelRotation?: number[]  // 3x3 row-major, as in SH3D
  mirrored: boolean
  lightSources?: { x: number; y: number; z: number; color: string }[]  // m, relative to the piece box
}
```

`DevicePlacement` is **not** part of the document (see §3), so re-imports never touch it.

**Modules** (one concern each, each with its own test file):

- `sh3d/parseHomeXml.ts`: XML string to a raw, attribute-faithful tree (tiny tolerant parser written
  for this; no dependency).
- `sh3d/toHouse.ts`: raw tree to `House`. Handles cm to m, axis mapping, level defaulting, groups
  flattened, invisible pieces dropped, doors/windows matched to walls (below), ids synthesised for old
  files (`piece-<index>` by document order).
- `geometry/wallJoins.ts`: each wall's footprint polygon with mitred corners at joined ends
  (straight walls).
- `geometry/arcWall.ts`: curved walls as a polyline of segments (fixed angular step, at most 5°).
- `geometry/openingOnWall.ts`: a door/window to the wall it cuts (nearest wall whose centreline
  segment the piece centre projects onto, within half the wall thickness plus tolerance, angle
  roughly parallel). Gives `wallId`, `offset`, `width`, `sill`, `height`. Non-rectangular
  `cutOutShape` uses its bounding rectangle. No match: it stays a `furniture` piece.
- `geometry/wallFaces.ts`: wall side faces as 2D outlines in wall-local coordinates (length x height,
  sloped top supported), with rectangular holes for openings. Output is plain arrays, ready for a
  three.js `Shape`/`ExtrudeGeometry`, but no three.js import.
- `geometry/roomFloor.ts`: room polygon cleanup (drop duplicate/colinear points, enforce winding).
- `geometry/pieceTransform.ts`: piece box to a world transform (centre, elevation, angle, mirror,
  modelRotation, fit-to-size scale).

Tests assert exact values (rounded to 1e-9) for: a 4 m x 3 m rectangle of 0.2 m walls (footprints
meet exactly at corners), a T-junction, an unjoined wall end, a sloped wall, a 90° arc wall's length
and endpoints, a door centred on a wall (offset/width/sill), a window near a corner, a door that
matches no wall, single-level and two-level homes, and cm/axis conversion. Fixtures are **small
hand-written `Home.xml` snippets** in the repo. The Sweet Home 3D user-guide example
(`https://www.sweethome3d.com/examples/userGuideExample.sh3d`, version 5300) is **not committed**; it
is the manual end-to-end and performance check until the owner's real file exists.

### 2. Import (server)

- **Endpoint:** `POST /api/house/import`, admin only (same session auth as GraphQL), body is the raw
  `.sh3d` (`application/octet-stream`), limit 200 MB. A plain HTTP route because the GraphQL route only
  accepts JSON.
- **Steps:** unzip (new dependency `fflate`); read `Home.xml` (reject with a clear message if missing:
  "Saved by a Sweet Home 3D older than 5.3; open and re-save it"); `toHouse`; extract **only the entries
  the house references** (models plus everything in their folders) into a new versioned folder
  `<HOUSE_DIR>/<importId>/`; save; then delete older import folders.
- **Zip safety:** reject entry names that are absolute or contain `..`; cap total extracted size
  (500 MB) and entry count.
- **Saving:** one transaction writes the `House` row (document + `assetVersion = importId` +
  `sourceName`, `importedAt`). Room links are filled by name match, and **kept from the previous import**
  for rooms with the same SH3D name.
- **Floors and placements:** placements reference `floorId`. Floor ids come from SH3D level ids, which
  SH3D keeps stable across saves. On re-import, a placement whose `floorId` no longer exists is
  **remapped**, in this order: new floor with the same name; else (the `"default"` floor of a
  single-level house) the floor with elevation 0, or the lowest floor. The remap is written in the same
  transaction. Only if no floor exists at all is a placement left orphaned and listed on the admin
  page until moved or removed.
- **Placements are fixed points.** A bulb snapped to a fixture keeps its coordinates; moving the lamp
  in Sweet Home 3D and re-importing does not move the bulb (re-snap is one click in edit mode). Piece
  ids from old files are not stable, so nothing anchors to them.
- **Assets:** served read-only at `GET /api/house/assets/<importId>/<path>` to signed-in users, with
  long-lived cache headers (the folder name changes with each import, so caching is safe) and
  compression for `.obj`/`.mtl`.
- **Config:** new `HOUSE_DIR` env var (writable folder; set by `apply-service-settings.ps1` under the
  shared data folder). Unset: import is disabled with a clear message.
- **Events:** a successful import publishes `houseChanged` so open 3D views reload.

### 3. Data and API

Prisma (one migration):

```prisma
model House {
  id           String   @id @default("house")   // single row
  document     Json                              // House (version 1)
  assetVersion String                            // import folder name
  sourceName   String
  importedAt   DateTime @default(now())
}

model DevicePlacement {
  deviceId String @id
  device   Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  floorId  String
  x        Float   // metres, our axes
  y        Float   // metres above the floor's elevation (not absolute), so level changes don't strand devices
  z        Float
}
```

GraphQL:

- `house: House` (signed-in users): the document, `assetVersion`, `importedAt`, and `placements`
  **filtered to devices the viewer can access** (same grant rules as the dashboard's device list).
- `setDevicePlacement(deviceId, floorId, x, y, z)` / `removeDevicePlacement(deviceId)` (admin).
- `setHouseRoomLink(houseRoomId, roomId | null)` (admin): updates the document in place.
- `subscription houseChanged`: fires on import, placement change and room link change.

### 4. Web

New dependencies: `three`, `@react-three/fiber`, `@react-three/drei` (versions compatible with
React 19), only in `apps/web`, all loaded from a **lazy route** so the dashboard bundle is unchanged.

- **Nav:** a "House" item in `MAIN_LINKS`, shown only once a house has been imported.
- **Route `/house`:** floor switcher (chips; the lowest floor with placements opens first), the canvas,
  and an admin-only "Edit placements" toggle. Floors above the selected one are hidden; the selected
  floor and those below are shown.
- **Components** (small, one per file), under `apps/web/src/house/`:
  - `HousePage`, `FloorSwitcher`, `HouseCanvas` (camera, controls, lighting rig).
  - `FloorMesh` composes `WallMesh`, `RoomFloorMesh`, `RoomLabel`, `PieceModel` (OBJ+MTL loaded with
    three's loaders, cached per model path, box fallback while loading or for non-OBJ),
    `OpeningModel`.
  - `DeviceLayer`: one `DeviceMarker` per visible placement; `LightBulb` (bulb + halo + floor pool) or
    `DeviceDot` (other kinds).
  - `PlacementEditor` (admin): device picker (adopted, unplaced devices, grouped by room), click to
    place (raycast hit on floor or furniture), drag to move, remove, snap to SH3D light source when the
    hit object is a `light` piece.
  - Pure helpers in `house/lib/` (glow-to-material values, floor visibility, snap-to-light, camera
    framing), each unit-tested.
- **Admin page `Admin → House`:** upload `.sh3d` (with progress), current file name and import date,
  floors list, room-link table (SH3D room to our Room select), and a list of orphaned placements.
- **Gestures:** tap/long-press reuse `useLongPress` and the same `canToggle`/`opensOnTap` rules as
  `DeviceTile`, so a device behaves identically in both places. Toggle uses `useToggleDevice`;
  details navigates like the tile.

### 5. Rendering and performance

- **Light glow (faked, no real lights):** an on light is a small sphere in `dotColor(device)` with
  emissive intensity from `tileGlow(device).strength`, a camera-facing additive halo sprite, and a soft
  radial "light pool" decal on the floor below it (radius and opacity scale with brightness). Off is a
  dark grey bulb, no halo or pool. Offline is dimmed like the tile.
- **Other devices:** a small disc with the kind's icon, glowing `ON_GLOW` green when `tileOnStyle` is
  `'on'`.
- **Scene lighting:** one hemisphere light plus one directional light, no shadows; ceilings never drawn.
- **Budget:** 60 fps target on a mid-range phone, at least 30 fps on the wall tablet with the official
  user-guide example house (`userGuideExample.sh3d`). Measures: geometry merged per floor for walls and room floors, each furniture model
  loaded once and reused for repeated pieces, `frameloop="demand"` (render on change only), device pixel
  ratio capped at 2.
- **Android WebView:** WebGL must be enabled in `HomeWebViewClient`/settings if it isn't already; verify
  on the real device.

### 6. Permissions

- Viewing `/house`: any signed-in user, guests included (the house itself isn't sensitive).
- Placements are filtered server-side by the viewer's grants; a guest sees only what a guest sees on
  the dashboard.
- Importing, placing and room linking: admins only, enforced on the server.

## Settled by me (owner can override)

- Server-side import; our own JSON model; assets in a versioned folder under `HOUSE_DIR`.
- Placements stored outside the house document, keyed by device, so re-imports keep them.
- Tap toggles / long-press opens details (dashboard behaviour) instead of "tap opens controls" from the
  2026-11-05 spec.
- Bulbs **glow** (overrides "no glow" in the 2026-11-05 spec, per owner).
- OBJ-only furniture models; others as boxes. Colours only on walls and floors.
- One house (single row); multiple houses is out of scope.
- Placement height is relative to its floor; lost floors remap by name, then to ground level.
- Snapped bulbs don't follow their fixture across re-imports.
- Test fixtures are hand-written; the SH3D example file is used only manually, never committed.

## Decided by the owner

- `.sh3d` import with our own wall geometry (approach b), to advance the builder.
- Bulbs glow.
- Room links are stored for the builder and shown as labels only this round.

## Left to the builder

- Exact component split inside `apps/web/src/house/`, helper names, test fixture contents.
- Lighting rig tuning, halo/pool textures and sizes, camera framing defaults.
- How the upload progress UI looks, within the existing admin page style.
- Whether `fflate` or an equivalent small zip library is used.
- The order of work, as long as `packages/house` (model + geometry + tests) lands first.

## Open risks

- **Unknown file features**: the owner hasn't modelled the house yet. First real file may use
  features not covered (e.g. sloped ceilings, staircases cutting floors, round rooms). Plan a short
  "fix-ups after the real file" task.
- **OBJ weight**: detailed catalogue furniture can be several MB. If the tablet struggles, next step is
  converting OBJ to GLB at import (out of scope now).
- **Unverified SH3D semantics** listed above; isolated in single functions with tests.
