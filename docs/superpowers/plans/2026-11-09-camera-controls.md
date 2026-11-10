# Camera Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tuya cameras get pan/tilt/zoom arrows over the live video and a row of settings chips under it. Each camera shows only what it supports. Privacy mode is admin-only.

**Architecture:**
- The Tuya key sync also reads each camera's **thing model**, keeps only the codes we control, and stores them as `config.cameraFeatures`.
- New GraphQL query and mutations read the camera's current values and send commands through the Tuya cloud **thing-shadow** endpoints. They are guarded by the existing camera visibility rules, plus an admin check for privacy.
- On the web, a `ControlledCamera` component wraps the existing `CameraPlayer`. It adds an overlay (direction pad, zoom, presets) and settings chips, and is used on the device page and in the grid's full-screen view.
- Moving uses a heartbeat: the client repeats `moveCamera` while a button is held, and the server sends a stop if the repeats stop arriving.

**Tech Stack:** Node + Apollo Server + Prisma (apps/server), React + MUI + Apollo Client + graphql-codegen (apps/web), vitest everywhere, `packages/protocols` for the Tuya cloud client.

**Spec:** `docs/superpowers/specs/2026-11-09-camera-controls-design.md`

## Global Constraints

- Tuya cameras only. Swann is untouched.
- Controls appear only for codes the camera reports. A camera without `config.cameraFeatures` gets no controls and no error.
- A failed thing-model read never erases a stored `cameraFeatures`. It only adds or replaces it.
- Every control query and mutation checks `visibleCamera(deps, user, deviceId)`. Changing `basic_private` requires role `ADMIN` (`FORBIDDEN` otherwise).
- Cloud failures surface as the existing `tuyaCloudApiError` codes (`TUYA_CLOUD_AUTH` / `TUYA_CLOUD_EXPIRED` / `TUYA_CLOUD_ERROR`). The cloud's own text is never passed on.
- Cloud calls stay low: read values when controls open and after each change, with no polling.
- Small single-purpose files and components (project convention).
- Copy: privacy notice text is exactly `Privacy mode is on`.

## Review Focus

1. **A button released off-target or by a lost pointer** (`pointercancel`, `pointerleave`, unmount, tab hidden). It must still send `stopCamera` / `stopZoom` exactly once. The test lives in Task 7.
2. **The client vanishes mid-hold** (network drop, closed laptop). The server watchdog sends a stop `SAFETY_STOP_MS` after the last `moveCamera`. The test lives in Task 4.
3. **A non-admin forging `setCameraSettings({privacy})`.** The server returns FORBIDDEN and sends no cloud call. The test lives in Task 5.
4. **A scheduled sync where the model call fails for one camera.** Cocina keeps its stored features, and other devices still sync. The test lives in Task 3.
5. **The shadow read fails when controls open.** The overlay still renders from the features, and setting values come back `null` instead of the whole query failing. The test lives in Task 5.

---

### Task 1: Live check on cocina (with the user present)

**Do not start without the user's go-ahead.** It physically moves "cámara cocina" (Tuya id `bf93958a57cf2f7101akbz`).

**Files:**
- Create (scratchpad only, not committed): a `tsx` script run from `apps/server` that loads the stored credentials via `tuyaCloudCredentials` and uses `CloudHttp` (open the DB with `createPrisma(process.env.DATABASE_URL)` and decrypt with `SECRET_KEY`, both from `apps/server/.env` via `dotenv/config`).
- Create: `packages/protocols/src/tuya/camera-codes.ts`, which records the findings.

**Interfaces:**
- Produces:
  - `PTZ_VALUES: Record<PanDirection, string>`, where `type PanDirection = 'UP'|'UP_RIGHT'|'RIGHT'|'DOWN_RIGHT'|'DOWN'|'DOWN_LEFT'|'LEFT'|'UP_LEFT'`
  - `ZOOM_VALUES: Record<'IN'|'OUT', string>`
  - `NIGHT_VISION_VALUES: Record<'AUTO'|'ON'|'OFF', string>`
  - `PRESET_COMMANDS: { save: (slot: number) => Record<string, unknown>; goto: (slot: number) => Record<string, unknown> } | null` (null means presets are dropped)
  - `MOVE_MODE: 'continuous' | 'step'`
  - `REPEAT_MS: number`, the client heartbeat interval

- [ ] **Step 1: Read cocina's shadow.** `GET /v2.0/cloud/thing/bf93958a57cf2f7101akbz/shadow/properties`. Expected: `{ properties: [{ code, value, ... }] }` including `basic_nightvision`, `basic_private`. Write down the current night vision value and what the Tuya app shows for it, to fix the `NIGHT_VISION_VALUES` mapping (Tuya's usual mapping: `0` auto, `1` off, `2` on).
- [ ] **Step 2: Move.** `POST /v2.0/cloud/thing/{id}/shadow/properties/issue` with body `{ "properties": "{\"ptz_control\":\"2\"}" }`. The user watches the Tuya app. Wait 2 s, then issue `{"ptz_stop":true}`. Record the direction and whether it kept moving until the stop (`continuous`) or moved one step on its own (`step`).
- [ ] **Step 3: Map all directions** `0`–`7` the same way, plus `8`/`9` (record what they do; leave them unmapped if they aren't directions). Do the same for zoom `zoom_control` `0`/`1` + `zoom_stop`.
- [ ] **Step 4: Presets.** Try `ipc_preset_set: "1"` (expected: save slot 1), move away, then `ipc_preset_action: "1"` (expected: go to slot 1). If that fails, inspect `memory_point_set` in the shadow after saving one in the Tuya app. If go-to and save can't both be made reliable, set `PRESET_COMMANDS = null`.
- [ ] **Step 5: Choose `REPEAT_MS`.**
  - `continuous`: 1500. Check that a repeated `ptz_control` while moving doesn't jerk visibly; if it does, raise it to 2500.
  - `step`: the smallest interval that gives smooth repeated steps, at least 300.
- [ ] **Step 6: Write `camera-codes.ts`** with the values found. Each constant gets a one-line comment that says it was "verified on cocina 2026-11-…". Export it from `packages/protocols/src/index.ts`.
- [ ] **Step 7: Commit** `feat(protocols): Tuya camera command codes verified on a real camera`.

---

### Task 2: Protocols: camera features and thing-shadow calls

**Files:**
- Create: `packages/protocols/src/tuya/camera-features.ts`
- Create: `packages/protocols/src/tuya/cloud-thing.ts`
- Modify: `packages/protocols/src/tuya/cloud.ts` (listDevices plus two new methods), `cloud-mapping.ts` (`TuyaCloudDevice.cameraFeatures?`), `packages/protocols/src/index.ts`
- Test: `packages/protocols/src/tuya/camera-features.test.ts`, `packages/protocols/src/tuya/cloud.test.ts`

**Interfaces:**
- Produces:
  - `CAMERA_CONTROL_CODES = ['ptz_control','ptz_stop','zoom_control','zoom_stop','ipc_preset_set','ipc_preset_action','memory_point_set','basic_nightvision','basic_private','basic_flip','motion_tracking','basic_osd','basic_indicator','motion_switch','basic_wdr'] as const`; `type CameraControlCode`
  - `type CameraFeatureSpec = { type: 'bool' } | { type: 'enum'; range: string[] }`; `type CameraFeatures = Partial<Record<CameraControlCode, CameraFeatureSpec>>`
  - `deriveCameraFeatures(model: ThingModel): CameraFeatures | undefined` (undefined when no catalog code is present)
  - `type ThingModel = { services?: { properties?: { code: string; accessMode?: string; typeSpec?: { type?: string; range?: string[] } }[] }[] }`
  - `fetchThingModel(http, deviceId): Promise<ThingModel>`: GET `/v2.0/cloud/thing/{id}/model`, then `JSON.parse(result.model)`
  - `readShadow(http, deviceId): Promise<Record<string, unknown>>`: GET `/v2.0/cloud/thing/{id}/shadow/properties`, mapping `result.properties[]` to `{ [code]: value }`
  - `issueProperties(http, deviceId, props: Record<string, unknown>): Promise<void>`: POST `/v2.0/cloud/thing/{id}/shadow/properties/issue` with `{ properties: JSON.stringify(props) }`
  - `TuyaCloud.readCameraValues(deviceId)` and `TuyaCloud.issueCameraProperties(deviceId, props)`, which delegate to the above
  - `TuyaCloudDevice.cameraFeatures?: CameraFeatures`

- [ ] **Step 1: Failing tests in `camera-features.test.ts`:**
  - `keeps only catalog codes`: given cocina's model (properties `ptz_control` enum `["0".."9"]`, `ptz_stop` bool, `basic_nightvision` enum `["0","1","2"]`, `siren_switch` bool, `sd_format` bool), the result equals `{ ptz_control: {type:'enum',range:[...]}, ptz_stop:{type:'bool'}, basic_nightvision:{type:'enum',range:['0','1','2']} }`.
  - `ignores read-only codes`: a catalog code with `accessMode: 'ro'` is dropped.
  - `returns undefined for a model with no catalog codes`.
- [ ] **Step 2: Failing tests in `cloud.test.ts`** (using the existing `fakeFetch`):
  - `listDevices fetches the thing model for camera categories` (`sp`, `cdsxj`) and sets `cameraFeatures`. It does not fetch for `dj`.
  - `a failed thing-model call leaves cameraFeatures absent and does not abort the sync` (route returns `{success:false, code:2009}`).
  - `readCameraValues maps shadow properties to a code→value record`.
  - `issueCameraProperties posts the properties as a JSON string`: assert the request body equals `{"properties":"{\"ptz_stop\":true}"}`.
- [ ] **Step 3: Run** `pnpm --filter @home/protocols test`. Expected: the new tests fail.
- [ ] **Step 4: Implement.**
  - The camera categories are a `CAMERA_CATEGORIES = new Set(['sp','cdsxj'])` in `camera-features.ts`.
  - The model failure handling mirrors `specOrUndefined`: auth and expired errors still throw.
- [ ] **Step 5: Run the tests.** Expected: PASS. Then run `pnpm --filter @home/protocols build`.
- [ ] **Step 6: Commit** `feat(protocols): read Tuya camera features and thing-shadow values`.

---

### Task 3: Server: store features during the key sync, and add the cloud dependency

**Files:**
- Modify: `apps/server/src/services/deps.ts` (extend `TuyaCloudFactory`'s return type with `readCameraValues` and `issueCameraProperties`)
- Modify: `apps/server/src/services/tuya-keys.ts` (`TuyaKeyExtras.cameraFeatures`), `apps/server/src/services/tuya-sync.ts` (pass `cd.cameraFeatures`), `apps/server/src/devices/drivers/tuya-kind.ts` (add `cdsxj: "CAMERA"`)
- Modify: `apps/server/test/api-harness.ts`: the default fake also has `readCameraValues`/`issueCameraProperties` that reject with `new Error("no tuya cloud in tests")`
- Test: `apps/server/test/api-tuya-camera-features.test.ts`

**Interfaces:**
- Consumes: `TuyaCloudDevice.cameraFeatures`, `CameraFeatures` (Task 2)
- Produces:
  - `type TuyaCloudClient = { listDevices(): Promise<TuyaCloudDevice[]>; readCameraValues(id: string): Promise<Record<string, unknown>>; issueCameraProperties(id: string, props: Record<string, unknown>): Promise<void> }`
  - `TuyaCloudFactory = (creds) => TuyaCloudClient`
  - `config.cameraFeatures` on the device row

- [ ] **Step 1: Failing tests:**
  - `a sync stores cameraFeatures in the camera's config` (keeps `category` and `version`).
  - `a later sync without cameraFeatures keeps the stored ones`.
  - `a sync with new cameraFeatures replaces the old ones`.
  - `a cdsxj camera is recorded as CAMERA`.
- [ ] **Step 2: Run** `pnpm --filter @home/server test api-tuya-camera-features`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `tuyaKeyUpdate`, spread `cameraFeatures` into the config only when it is present, the same way `dpSchema` is handled.
- [ ] **Step 4: Run the server test suite.** Expected: PASS. This includes `api-integrations`, `api-tuya-quiet` and `tuya-sync-schedule`, which use the factory.
- [ ] **Step 5: Commit** `feat(server): keep each Tuya camera's controllable features from the key sync`.

---

### Task 4: Server: control service with the movement watchdog

**Files:**
- Create: `apps/server/src/cameras/controls/features.ts`: `cameraFeaturesOf(config: unknown): CameraFeatures | undefined` (validates the shape and drops anything malformed)
- Create: `apps/server/src/cameras/controls/commands.ts`: pure mappers from API inputs to shadow properties, using `camera-codes.ts`
- Create: `apps/server/src/cameras/controls/watchdog.ts`
- Create: `apps/server/src/cameras/controls/control-service.ts`
- Test: `apps/server/test/camera-controls-commands.test.ts`, `apps/server/test/camera-controls-watchdog.test.ts`

**Interfaces:**
- Consumes: `TuyaCloudClient` (Task 3), `PTZ_VALUES`, `ZOOM_VALUES`, `NIGHT_VISION_VALUES`, `PRESET_COMMANDS` (Task 1), `visibleCamera` (`apps/server/src/cameras/camera-access.ts`), `tuyaCloudCredentials`, `tuyaCloudApiError`
- Produces:
  - `type CameraSettingsPatch = { nightVision?: 'AUTO'|'ON'|'OFF'; privacy?: boolean; flip?: boolean; followMotion?: boolean; timestamp?: boolean; statusLight?: boolean; motionDetection?: boolean; wdr?: boolean }`
  - `SETTING_CODES: Record<keyof CameraSettingsPatch, CameraControlCode>` = nightVision→`basic_nightvision`, privacy→`basic_private`, flip→`basic_flip`, followMotion→`motion_tracking`, timestamp→`basic_osd`, statusLight→`basic_indicator`, motionDetection→`motion_switch`, wdr→`basic_wdr`
  - `settingsToProps(patch, features): Record<string, unknown>`. It throws `badInput("This camera can't do that")` for a field whose code is missing from `features`.
  - `class MoveWatchdog { constructor(opts: { timeoutMs: number; onExpire: (deviceId: string, kind: 'pan'|'zoom') => void; setTimer?, clearTimer? }); touch(deviceId, kind): void; clear(deviceId, kind): void; dispose(): void }`
  - `SAFETY_STOP_MS = 4000`
  - `type CameraControlsView = { deviceId: string; pan: boolean; zoom: boolean; presets: { slot: number; saved: boolean }[] | null; settings: Record<keyof CameraSettingsPatch, boolean | 'AUTO'|'ON'|'OFF' | null> | null; supported: (keyof CameraSettingsPatch)[] }`
  - Service functions, each taking `(deps, user, deviceId, ...)`:
    - `getCameraControls(...) : Promise<CameraControlsView | null>`
    - `moveCamera(..., direction)`
    - `stopCamera(...)`
    - `zoomCamera(..., direction)`
    - `stopZoom(...)`
    - `gotoPreset(..., slot)`
    - `savePreset(..., slot): Promise<CameraControlsView>`
    - `setCameraSettings(..., patch): Promise<CameraControlsView>`

- [ ] **Step 1: Failing tests in `camera-controls-commands.test.ts`:**
  - `maps each direction through PTZ_VALUES`.
  - `settingsToProps maps nightVision through NIGHT_VISION_VALUES and booleans as-is`.
  - `settingsToProps rejects a setting the camera lacks`.
  - `cameraFeaturesOf drops malformed entries`.
- [ ] **Step 2: Failing tests in `camera-controls-watchdog.test.ts`** (fake timers):
  - `fires onExpire SAFETY_STOP_MS after the last touch`.
  - `touch resets the timer` (a touch at 3000 ms moves the expiry to 7000).
  - `clear cancels it`.
  - `pan and zoom are tracked separately`.
- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.**
  - The watchdog is one instance per `ServiceDeps` (a `WeakMap<ServiceDeps, MoveWatchdog>`, like `inFlight` in `tuya-sync.ts`). Its `onExpire` issues `ptz_stop: true` or `zoom_stop: true` and logs a warning on failure.
  - `moveCamera`: issue the move, then `watchdog.touch(id,'pan')`.
  - `stopCamera`: issue the stop, then `watchdog.clear(id,'pan')`. Zoom works the same way.
  - Every function first resolves `visibleCamera` (null → `notFound("Camera")`), then `cameraFeaturesOf(row.config)` (missing code → `badInput`), then the credentials (missing → `badInput("Set the Tuya cloud credentials first")`).
  - Cloud errors go through `tuyaCloudApiError`.
  - `getCameraControls` returns `null` when the camera has no features. A shadow read failure gives `settings: null` and is logged, without throwing.
  - `presets` is null when `PRESET_COMMANDS` is null or the camera lacks the preset codes. `saved` comes from `config.savedPresets: number[]` (written by `savePreset` through `deps.manager.runDeviceWrite`, the way `applyTuyaKey` does).
- [ ] **Step 5: Run the tests.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(server): camera control service with a safety stop`.

---

### Task 5: Server: GraphQL schema and resolvers

**Files:**
- Modify: `apps/server/src/graphql/schema.graphql`
- Create: `apps/server/src/graphql/resolvers/camera-controls.ts`; register it in `resolvers/index.ts`
- Test: `apps/server/test/api-camera-controls.test.ts` (ApiHarness with a `tuyaCloud` fake whose `issueCameraProperties`/`readCameraValues` are `vi.fn`)

**Interfaces:**
- Consumes: the Task 4 service functions
- Produces (schema):
  ```graphql
  enum PanDirection { UP UP_RIGHT RIGHT DOWN_RIGHT DOWN DOWN_LEFT LEFT UP_LEFT }
  enum ZoomDirection { IN OUT }
  enum NightVision { AUTO ON OFF }
  type PresetSlot { slot: Int!  saved: Boolean! }
  type CameraSettings { nightVision: NightVision  privacy: Boolean  flip: Boolean  followMotion: Boolean  timestamp: Boolean  statusLight: Boolean  motionDetection: Boolean  wdr: Boolean } # null = unknown (read failed) or unsupported; see `supported`
  type CameraControls { deviceId: ID!  pan: Boolean!  zoom: Boolean!  presets: [PresetSlot!]  supported: [String!]!  settings: CameraSettings } # settings null when the camera's values couldn't be read
  input CameraSettingsInput { nightVision: NightVision  privacy: Boolean  flip: Boolean  followMotion: Boolean  timestamp: Boolean  statusLight: Boolean  motionDetection: Boolean  wdr: Boolean }
  # Query
  cameraControls(deviceId: ID!): CameraControls   # null: not a visible camera, or no known features
  # Mutation
  moveCamera(deviceId: ID!, direction: PanDirection!): Boolean!   # repeat while held; the server stops after 4 s without one
  stopCamera(deviceId: ID!): Boolean!
  zoomCamera(deviceId: ID!, direction: ZoomDirection!): Boolean!
  stopZoom(deviceId: ID!): Boolean!
  gotoCameraPreset(deviceId: ID!, slot: Int!): Boolean!            # slot 1-4
  saveCameraPreset(deviceId: ID!, slot: Int!): CameraControls!
  setCameraSettings(deviceId: ID!, settings: CameraSettingsInput!): CameraControls!  # privacy: admin
  ```
- `supported` lists the `CameraSettingsInput` field names the camera has, with `privacy` left out for non-admins.

- [ ] **Step 1: Failing tests:**
  - `cameraControls returns features and current values for a granted user`.
  - `cameraControls is null for a camera without features, and for one the user can't see`.
  - `cameraControls returns settings null when the shadow read fails`.
  - `moveCamera issues the PTZ value; stopCamera issues ptz_stop`.
  - `a move with no follow-up is stopped after SAFETY_STOP_MS` (advance fake timers; assert `issueCameraProperties` was called with `{ ptz_stop: true }`).
  - `a non-admin setting privacy gets FORBIDDEN and nothing is issued`.
  - `an admin can set privacy`.
  - `supported omits privacy for a non-admin`.
  - `a setting the camera lacks gets BAD_USER_INPUT`.
  - `saveCameraPreset marks the slot saved; gotoCameraPreset issues the goto command`. Skip this test if `PRESET_COMMANDS` is null.
  - `a cloud auth failure maps to TUYA_CLOUD_AUTH`.
  - `an ungranted user gets NOT_FOUND from moveCamera`.
- [ ] **Step 2: Run** `pnpm --filter @home/server test api-camera-controls`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema and resolvers. Resolvers use `requireUser(ctx)` and delegate to the service. Slot outside 1–4 → `badInput`.
- [ ] **Step 4: Run** the full server suite (including `schema.test.ts`). Expected: PASS.
- [ ] **Step 5: Wire `main.ts`.** `tuyaCloud: (creds) => new TuyaCloud(creds)` already satisfies the widened type, so check that `pnpm --filter @home/server build` passes.
- [ ] **Step 6: Commit** `feat(server): camera controls API`.

---

### Task 6: Web: data layer

**Files:**
- Modify: `apps/web/src/device/data/documents.ts` (add `CAMERA_CONTROLS`, `MOVE_CAMERA`, `STOP_CAMERA`, `ZOOM_CAMERA`, `STOP_ZOOM`, `GOTO_CAMERA_PRESET`, `SAVE_CAMERA_PRESET`, `SET_CAMERA_SETTINGS`; the last two select every `CameraControls` field so the cache updates)
- Create: `apps/web/src/device/data/useCameraControls.ts`
- Test: `apps/web/src/device/data/useCameraControls.test.tsx`

**Interfaces:**
- Produces: `useCameraControls(deviceId: string): { controls: CameraControlsFragment | null; loading: boolean; move(d: PanDirection): Promise<void>; stop(): Promise<void>; zoom(d: ZoomDirection): Promise<void>; stopZoom(): Promise<void>; gotoPreset(slot: number): Promise<void>; savePreset(slot: number): Promise<void>; setSettings(patch: CameraSettingsInput): Promise<void>; error: string | null }`. `error` is the last failure as a short message (`"Couldn't reach the camera"` for `TUYA_CLOUD_*`, otherwise the server message). It is cleared by the next success.

- [ ] **Step 1: Failing tests** (using `createTestClient`):
  - `controls is null when the query returns null`.
  - `setSettings updates controls from the mutation result`.
  - `a TUYA_CLOUD_ERROR sets error to "Couldn't reach the camera"`.
- [ ] **Step 2: Run** `pnpm --filter @home/web test useCameraControls`. Expected: FAIL.
- [ ] **Step 3: Implement.** The query uses `fetchPolicy: 'network-only'`, so values are fresh each time controls open.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): camera controls data hook`.

---

### Task 7: Web: hold-to-move hook and overlay pieces

**Files (all in `apps/web/src/device/camera-controls/`):**
- `useHoldAction.ts`
- `useOverlayIdle.ts`
- `DirectionPad.tsx` (8 directions, a 3×3 grid with an empty centre)
- `ZoomButtons.tsx`
- `PresetBar.tsx`
- `ControlOverlay.tsx`
- Tests: `useHoldAction.test.ts`, `ControlOverlay.test.tsx`

**Interfaces:**
- Consumes: `REPEAT_MS`, `MOVE_MODE` (re-export them from a small `apps/web/src/device/camera-controls/timing.ts` with the same values as Task 1; the web app does not import `@home/protocols`)
- Produces:
  - `useHoldAction({ start: () => void; stop: () => void; repeatMs: number; nudgeMs?: number }): { onPointerDown; onPointerUp; onPointerCancel; onPointerLeave }`, with `NUDGE_MS = 400`
  - `useOverlayIdle(idleMs = 3000): { visible: boolean; wake: () => void }`
  - `ControlOverlay({ controls, actions, isAdmin }): JSX`. Arrows sit bottom-left. Zoom sits bottom-right at `bottom: 52` (stacked above the existing `PlayerControls`). The `PresetBar` sits top-right. It renders only the parts `controls` supports.

- [ ] **Step 1: Failing tests in `useHoldAction.test.ts`** (fake timers):
  - `press calls start, repeats every repeatMs while held, and release calls stop once`.
  - `a tap shorter than NUDGE_MS still runs for NUDGE_MS, then stops`.
  - `pointercancel, pointerleave, unmount and document hidden each stop exactly once`.
  - `a second press after release starts again`.
- [ ] **Step 2: Failing tests in `ControlOverlay.test.tsx`:**
  - `shows the pad only when pan is true; zoom only when zoom is true; presets only when presets is non-null`.
  - `buttons have accessible names` ("Move up", …, "Zoom in", "Zoom out", "Go to position 1"; an empty slot is labelled "Save position 1").
  - `long-press on a saved slot saves; tap goes`.
  - `fades after 3 s idle and returns on pointer move`.
- [ ] **Step 3: Run** `pnpm --filter @home/web test camera-controls`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - Use pointer events, with `touch-action: none` on the buttons so a hold on a phone doesn't scroll.
  - Buttons are at least 40 px. The style matches `PlayerControls`'s translucent black buttons.
  - Desktop "save" on a saved slot is right-click (`onContextMenu`) plus long-press (≥ 600 ms).
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): camera move/zoom/preset overlay`.

---

### Task 8: Web: settings chips, privacy state, and wiring into both views

**Files:**
- Create (in `apps/web/src/device/camera-controls/`):
  - `SettingsChips.tsx` (the visible chips: Night vision menu, Privacy (admin), Flip, Follow motion, More…)
  - `MoreSettingsMenu.tsx` (Timestamp on video, Status light, Motion detection, WDR, as toggles)
  - `NightVisionChip.tsx`
  - `PrivacyFrame.tsx` (a 16:9 black frame with the text `Privacy mode is on`)
  - `ControlledCamera.tsx`
- Modify:
  - `apps/web/src/device/camera/CameraPlayer.tsx`: add an optional `overlay?: ReactNode`, rendered inside the frame after `PlayerControls`. Nothing else changes.
  - `apps/web/src/device/preview/CameraPreview.tsx` and `apps/web/src/cameras/grid/FullCamera.tsx`: render `ControlledCamera` instead of `CameraPlayer`.
- Tests: `ControlledCamera.test.tsx`, `SettingsChips.test.tsx`

**Interfaces:**
- Consumes: `useCameraControls` (Task 6), `ControlOverlay` (Task 7), `useCurrentUser`
- Produces: `ControlledCamera({ deviceId, cloud }: { deviceId: string; cloud: boolean })`

- [ ] **Step 1: Failing tests in `ControlledCamera.test.tsx`:**
  - `a camera with no controls renders just the player` (cameraControls null; no chips, no pad).
  - `privacy on renders "Privacy mode is on" and no video element`, for both a USER and an ADMIN.
  - `an admin can turn privacy off from the chip`, which sends `setCameraSettings({privacy:false})`.
  - `a USER sees no Privacy chip`.
  - `settings null shows the chips disabled with "Couldn't read the camera's settings"`.
  - `a failed command shows the error message under the video, and the video keeps playing`.
- [ ] **Step 2: Failing tests in `SettingsChips.test.tsx`:**
  - `night vision menu offers Auto / On / Off and marks the current one`.
  - `only supported settings render`.
  - `More… lists the supported extras with their current state`.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.** `ControlledCamera` renders `PrivacyFrame` when `controls?.settings?.privacy === true`; otherwise it renders `CameraPlayer` with `overlay={<ControlOverlay …/>}`. The chips (with the error line) go below. The existing `CameraPlayer.test.tsx` and the `CameraGrid` tests must still pass unchanged.
- [ ] **Step 5: Run** `pnpm --filter @home/web test` and `pnpm --filter @home/web typecheck`. Expected: all PASS.
- [ ] **Step 6: Commit** `feat(web): camera settings chips and controls on the camera page and full-screen view`.

---

### Task 9: End-to-end check on the real cameras (with the user)

- [ ] **Step 1:** Restart the server and run **Sync keys** in Integrations. Confirm cocina and the fixed cameras now have `cameraFeatures` in their config, and that Rancho/Pepe have none.
- [ ] **Step 2:** On a computer, open cocina's page. Hold each arrow and release, and check that it stops. Tap for a nudge. Zoom in and out. Save position 1, move away, then go to position 1.
- [ ] **Step 3:** On a phone, repeat Step 2. Check that the page doesn't scroll while holding an arrow, and that the overlay fades and comes back.
- [ ] **Step 4:** Night vision Auto → On → Auto, Flip on/off and the "More…" toggles each match the Tuya app.
- [ ] **Step 5:** As admin, turn privacy on: the video area shows `Privacy mode is on` for an admin and for a regular user. The regular user has no Privacy chip. Turn it off and check that the video comes back.
- [ ] **Step 6:** Open a fixed camera: there are no arrows, only the chips. Open the Cameras grid, then a full-screen tile: the controls are there. The grid tiles have none.
- [ ] **Step 7:** Hold an arrow and kill the browser tab mid-hold. Check that the camera stops within about 4 s.
- [ ] **Step 8:** Update `README.md`'s feature list with camera controls, then commit `docs: camera controls in the README`.
