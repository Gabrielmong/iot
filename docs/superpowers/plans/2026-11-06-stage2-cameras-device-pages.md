# Stage 2 — Cameras & Device Details Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every device gets a bookmarkable details page (live preview, all controls, info, admin actions). The 4 Swann recorder cameras stream fully locally, and Tuya/Smart Life cameras stream via the Tuya cloud. Dashboard camera tiles show refreshed stills.

**Architecture:**
- **Details page:** a new `/devices/:id` route reuses the Stage 1 control components (moved out of the dashboard dialog) and the admin dialogs.
- **Helper:** cameras go through a **go2rtc** helper that the Node server spawns and supervises on localhost. Streams, including credentials, are registered through go2rtc's localhost API, in memory only.
- **Browser access:** browsers never talk to go2rtc's API directly. Node authorises and proxies WebRTC signaling (SDP), MSE WebSocket fallback, and JPEG thumbnails. WebRTC media flows over UDP 8555 from go2rtc to the LAN client.
- **Thumbnails** are fetched on demand with a 10 s cache. Frames are grabbed only while someone is requesting them, which automatically means only for cameras that current viewers are granted.

**Tech Stack:** existing Stage 1 stack (TypeScript, Node 22, Apollo Server/Client, Prisma/Postgres, React + MUI 9, Vitest) plus go2rtc (pinned release) and ffmpeg (pinned build), installed by `scripts/install-service.ps1`.

**Spec:** `docs/superpowers/specs/2026-11-06-stage2-cameras-device-pages-design.md` (section 8a holds the post-review designer calls). It builds on `docs/superpowers/specs/2026-11-05-home-control-design.md`.

## Global Constraints

- Stage 1 constraints all hold:
  - TS strict, latest stable libraries, React + MUI, Apollo, Prisma + Postgres.
  - Native Windows server, LAN only.
  - **No big files; strict separation of concerns.** Resolvers stay thin, logic lives in services, and React keeps hooks, presentational components and pure lib code apart.
- **Camera credentials and raw RTSP/cloud URLs never reach the browser,** in responses, logs or errors.
- **Every** stream, signaling and thumbnail request checks the session and the device grant (admins see all adopted devices), on every request or connection.
- **go2rtc ports:**
  - HTTP API `127.0.0.1:1984` only.
  - RTSP server on `127.0.0.1:8554` only, with a per-run random login (ffmpeg sources publish back to it; go2rtc exempts loopback from RTSP auth). Changed from "disabled" in Task 14.
  - WebRTC `:8555` (UDP+TCP), opened by the firewall rule on the **Private profile only**.
- **Thumbnails:** cached ≤ **10 s** per camera. Stale at **> 60 s**: the tile shows "No recent image", never an old frame as current. Requests carry the `x-home-background: 1` header (they don't slide sessions).
- **Revocation:** revoking a grant or ending a session stops that user's video within **~5 s**.
- **Cloud cameras** are labelled exactly **"via Tuya cloud"**. The camera page note reads **"Cloud-streamed: won't play when the internet is down."**
- **Unavailable cloud stream:** the camera page shows exactly **"Cloud stream not available for this camera"**.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never contact real devices in automated tests.
- Manual checks against the real recorder and real cameras are read-only, except for viewing video.

## Decisions this plan makes

- **Prisma migration `stage2_cameras`:**
  - `Brand` gains `SWANN`.
  - New enum `StreamSource { LOCAL CLOUD }`.
  - `Device.streamSource StreamSource?`, null for non-cameras.
- **GraphQL additions** (exact SDL in Task 1).
- **Swann identity:** each recorder channel is a `Device` with `brand SWANN`, `kind CAMERA`, `externalId "<recorderHost>:ch<N>"`, `streamSource LOCAL`, and `config { channel: N, mainPath, subPath, codec }`.
- **Swann URL discovery:** RTSP `DESCRIBE` with Digest/Basic auth against candidate path templates per channel, in this order:
  1. `/ch{NN}/0` (main) and `/ch{NN}/1` (sub)
  2. `/cam/realmonitor?channel={N}&subtype=0|1`
  3. `/Streaming/Channels/{N}01|{N}02`

  The first template returning 200 for channel 1 is used for all channels. Channels are probed from 1 up to the first failure, capped at 16. The codec is read from the SDP `a=rtpmap` line (H264 or H265).
- **go2rtc stream names:**
  - `cam-<deviceId>` = live main stream.
  - `cam-<deviceId>-sub` = thumbnail source (the sub stream if present, otherwise main).
  - H265 sources are registered as `ffmpeg:<url>#video=h264` (transcode).
- **Revocation mechanics:** Node tracks viewers per stream. On revoke or session end it re-registers the stream (DELETE + PUT), which drops all consumers. Still-authorised clients auto-reconnect: the player retries signaling once after 2 s.
- **Tuya cloud stream:** `POST /v1.0/devices/{id}/stream/actions/allocate` with body `{"type":"rtsp"}`, falling back to `"hls"`. The URL is re-allocated before its expiry (treat it as valid for 5 min unless the response states otherwise) and re-registered in go2rtc. Any failure means "Cloud stream not available for this camera".
- **Settings keys:** `swann.host`, `swann.username`, `swann.password`, all encrypted.
- **Phase order:**
  - Tasks 1–5: details pages.
  - Tasks 6–11: Swann and camera infrastructure.
  - Task 12: helper shipping and deploy.
  - Task 13: Swann acceptance on the real recorder.
  - Task 14: Tuya cloud.

## Review Focus

1. **A user opens `/devices/<id>` for a device they aren't granted,** or a removed device, by bookmark. Expected: "Not found or no access", no data leak, and the stream and thumbnail endpoints return 404. *Tests in Tasks 1, 2 and 10.*
2. **The recorder is offline or its password changed** while viewing. Expected: the tile says "No recent image" within 60 s, the camera page shows "Camera unavailable", and there's no crash loop of the go2rtc helper. *Tests in Tasks 9 and 10.*
3. **The go2rtc process crashes or isn't installed.** Expected: the server keeps running, cameras show unavailable, and the supervisor restarts the helper with backoff (1 s → 60 s). Missing binary = cameras disabled with one clear log line. *Test in Task 8.*
4. **The admin revokes a camera grant while that user is watching.** Expected: the video stops within ~5 s, and the other viewers recover by reconnecting. *Test in Task 10.*
5. **The phone loses Wi-Fi, or the tab goes to the background.** Expected: thumbnail polling pauses while `document.hidden`, the live player tears down on unmount or visibility loss and reconnects when visible. *Test in Task 11.*

---

## File Structure (new or changed)

```
apps/server/
  prisma/migrations/<ts>_stage2_cameras/migration.sql
  src/graphql/schema.graphql                 (+ fields/queries/mutations)
  src/graphql/resolvers/{devices.ts,grants.ts,integrations.ts}  (thin additions)
  src/services/{device-detail.ts,device-grants.ts,swann.ts}
  src/settings-keys.ts                       (+ swann keys)
  src/cameras/
    go2rtc/{binary.ts,config.ts,supervisor.ts,api.ts}
    streams/{registry.ts,viewers.ts,revocation.ts}
    http/{auth.ts,thumbnail-route.ts,webrtc-route.ts,mse-route.ts}
    thumbnails/cache.ts
    tuya-cloud-source.ts
  src/devices/drivers/{swann.ts,swann-link.ts}
packages/protocols/src/
  rtsp/{describe.ts,digest.ts,sdp.ts}
  swann/{probe.ts,paths.ts}
  tuya/cloud-stream.ts
apps/web/src/
  pages/DevicePage.tsx
  device/
    data/{documents.ts,useDevice.ts,useDeviceGrants.ts}
    preview/{LightPreview.tsx,PlugPreview.tsx,CameraPreview.tsx}
    controls/   (moved from dashboard/dialog/: PowerSwitch, BrightnessSlider, ColorSwatches, HueSlider, WhiteTempSlider, CommitSlider, LightControls, UnavailableNotice)
    info/DeviceInfoCard.tsx
    admin/{DeviceAdminSection.tsx,DeviceAccessDialog.tsx}
    camera/{useWebRtcPlayer.ts,useMsePlayer.ts,CameraPlayer.tsx,useThumbnail.ts,CameraThumb.tsx}
    lib/{previewColor.ts,connectionLabel.ts}
  admin/integrations/SwannRecorderForm.tsx
scripts/lib/helpers-download.ps1, scripts/install-service.ps1, scripts/firewall.ps1, docs/RUNNING.md
```

---

### Task 1: Data model and GraphQL for details pages

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: the `stage2_cameras` migration
- Modify: `apps/server/src/graphql/schema.graphql`, `graphql/mappers.ts`, `graphql/resolvers/devices.ts`
- Create: `services/device-detail.ts`
- Test: `apps/server/test/api-device-detail.test.ts`

**Interfaces:**
- Produces this SDL (append or extend):
```graphql
enum Brand { TUYA KASA GOVEE SWANN }
enum StreamSource { LOCAL CLOUD }
enum Connection { LOCAL CLOUD }
extend type Device { lastSeenAt: String  connection: Connection!  streamSource: StreamSource  ip: String }  # ip: null unless caller is ADMIN
extend type Query { device(id: ID!): Device }                    # null if missing, not adopted, or not granted
```
- `connection` is CLOUD iff `streamSource === CLOUD`, otherwise LOCAL.
- `services/device-detail.ts`: `getVisibleDevice(deps, user, id): Promise<DeviceRow | null>`.

- [ ] **Step 1: Failing tests**
  - A USER granted d1 gets `device(id:d1)` with `connection: LOCAL` and `ip: null`.
  - ADMIN gets `ip`.
  - USER asking for an ungranted d2 gets `null`. An unknown id and a non-adopted id give `null`.
  - A Tuya camera with `streamSource CLOUD` gives `connection: CLOUD`.
  - The introspection secret-name test still passes.
- [ ] **Step 2:** Run `pnpm --filter @home/server test api-device-detail`. Expected: FAIL.
- [ ] **Step 3:** Implement. Write the migration with `prisma migrate dev --name stage2_cameras`, and update `test/helpers.ts`'s truncate list only if tables were added (none expected).
- [ ] **Step 4:** PASS, and the full server suite is green.
- [ ] **Step 5:** Commit `feat(server): device detail query and camera fields`.

---

### Task 2: Device details route and page shell (web)

**Files:**
- Create: `pages/DevicePage.tsx`, `device/data/{documents.ts,useDevice.ts}`, `device/info/DeviceInfoCard.tsx`, `device/lib/connectionLabel.ts`
- Modify: `AppRoutes.tsx`
- Test: `device/DevicePage.test.tsx`, `device/lib/connectionLabel.test.ts`

**Interfaces:**
- Consumes: Task 1 `device(id)`.
- Produces: route `/devices/:id` inside `RequireAuth`.
  - `useDevice(id) → { device, loading, error, refetch }` uses `cache-and-network`. The existing `deviceState` subscription keeps it live through normalised `Device:id`.
  - `connectionLabel(device) → 'Local (LAN)' | 'via Tuya cloud'`.
- Page layout: a header (back link to `/`, name, room chip, an online chip reading "● Online" or "Offline", and a connection chip shown only when CLOUD), then a two-column grid (preview | controls) above a two-column grid (info | admin). The columns stack below the `md` breakpoint.

- [ ] **Step 1: Failing tests**
  - `/devices/d1` renders the name, the room and "Local (LAN)".
  - A `null` result renders "Not found or no access" with a link back to the dashboard.
  - The info card shows brand/model, type, room and last seen. Address shows only when `ip` is non-null.
  - `connectionLabel` returns both labels exactly.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): device details route and info card`.

---

### Task 3: Previews and controls on the details page; retire the dialog

**Files:**
- Move: `dashboard/dialog/*` controls into `device/controls/` (update imports; keep their tests, moved too)
- Create: `device/preview/{LightPreview.tsx,PlugPreview.tsx}`, `device/lib/previewColor.ts`
- Modify: `pages/DevicePage.tsx`, `dashboard/Dashboard.tsx`, `dashboard/tile/*`
- Delete: `dashboard/dialog/DeviceDialog.tsx`
- Test: `device/lib/previewColor.test.ts`, `device/DeviceControls.test.tsx`, plus updates to `Dashboard.test.tsx`

**Interfaces:**
- `previewColor(state): { css: string; glow: number /*0..1*/ }`:
  - colour mode: the rgb scaled by brightness
  - white mode: `kelvinToRgb(colorTempK)` scaled by brightness
  - off: `{ css: '#3a3f4b', glow: 0 }`
- Controls receive `(device, onPatch)` exactly as the dialog did. `onPatch` uses the existing `useSetDeviceState` (optimistic), so the preview updates instantly.
- **Dashboard:** the ⋯ button and long-press call `navigate('/devices/' + id)`. Tap still toggles. CAMERA tiles navigate on tap.

- [ ] **Step 1: Failing tests**
  - `previewColor({on:true,light:{mode:'color',color:{r:155,g:89,b:255},brightness:70}})` gives `glow` 0.7 and the rgb scaled.
  - Off gives glow 0.
  - Dragging brightness on the page updates the preview before the mutation resolves.
  - A ⋯ click on a dashboard tile navigates to `/devices/<id>`.
  - Tapping a camera tile navigates.
  - There is no `DeviceDialog` in the tree.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Run the full web suite. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): device page previews and controls; dashboard opens details page`.

---

### Task 4: Per-device access API

**Files:**
- Create: `services/device-grants.ts`
- Modify: `schema.graphql`, `resolvers/devices.ts` (thin)
- Test: `apps/server/test/api-device-grants.test.ts`

**Interfaces:**
```graphql
extend type Query { deviceGrants(deviceId: ID!): [ID!]! }                         # admin; userIds with explicit grants
extend type Mutation { setDeviceGrants(deviceId: ID!, userIds: [ID!]!): [ID!]! }  # admin; replaces grants for that device
```
- `setDeviceGrants` publishes `DEVICES_CHANGED`. ADMIN user ids in the input are ignored, since admins have implicit access.
- Revoking access must reach the camera revocation hook from Task 10. For now, emit an internal event `grantsChanged(deviceId)` from the service. Task 10 subscribes to it.

- [ ] **Step 1: Failing tests**
  - A USER calling either operation gets FORBIDDEN.
  - Setting `[u1]` then `[]` leaves u1 with no `devices` entry for it.
  - The `grantsChanged` emitter fires with the deviceId.
  - Unknown device ids give `BAD_USER_INPUT`.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `feat(server): per-device grants API`.

---

### Task 5: Admin section on the details page

**Files:**
- Create: `device/admin/{DeviceAdminSection.tsx,DeviceAccessDialog.tsx}`, `device/data/useDeviceGrants.ts`
- Modify: `pages/DevicePage.tsx`
- Reuse: `admin/devices/{RenameMoveDialog,KindSelect,SetKeyDialog,ConfirmRemoveDialog}`
- Test: `device/admin/DeviceAdminSection.test.tsx`

**Interfaces:**
- The admin section is shown only to ADMIN. Buttons, in order: **Rename**, **Move room**, **Change type**, **Set Tuya local key** (Tuya only), **Who has access**, **Remove**.
- Remove reuses the parent-outlet warning and navigates to `/` after success.
- **Who has access:** a checklist of non-admin users, preselected from `deviceGrants`, saved via `setDeviceGrants`. Admins are listed as "always has access" (disabled).
- Swann cameras show **Stream source: Local** as read-only text. Tuya cameras show no stream-source control.

- [ ] **Step 1: Failing tests**
  - A USER sees no admin section.
  - The Set key button appears only for TUYA.
  - The access dialog saves exactly the checked user ids.
  - Remove confirms, then navigates home.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `feat(web): device page admin actions`.

---

### Task 6: RTSP DESCRIBE client and Swann probe (protocols)

**Files:**
- Create: `packages/protocols/src/rtsp/{describe.ts,digest.ts,sdp.ts}`, `swann/{paths.ts,probe.ts}`
- Modify: `src/index.ts` exports
- Test: `rtsp/describe.test.ts` (against a fake RTSP TCP server in `src/test/fake-rtsp-server.ts`), `swann/probe.test.ts`

**Interfaces:**
- `rtspDescribe(url: string, creds: {username,password}, timeoutMs = 3000): Promise<{ status: number; sdp?: string }>`
  - Sends OPTIONS-free DESCRIBE.
  - On a 401 it retries once with Digest (preferred) or Basic, per `WWW-Authenticate`.
  - Errors: `RtspTimeoutError`, `RtspError`.
- `sdpVideoCodec(sdp): 'H264' | 'H265' | 'OTHER' | undefined`
- `SWANN_PATH_TEMPLATES` with the three templates from Decisions, in that order.
- `probeSwann(host: string, creds, opts?): Promise<{ template: string; channels: { channel: number; mainPath: string; subPath?: string; codec: 'H264'|'H265'|'OTHER' }[] }>`
  - Errors: `SwannAuthError` (401 after auth), `SwannUnreachableError`, `SwannNoStreamsError`.
- **Credentials never appear in error messages,** and URLs in errors have their userinfo stripped.

- [ ] **Step 1: Failing tests (fake RTSP server)**
  - Digest challenge → authorised DESCRIBE → 200 with H265 SDP gives codec `'H265'`.
  - Wrong password gives `SwannAuthError`.
  - With template 1 answering 404 and template 2 answering 200 for channels 1–4 and 404 for channel 5, `probeSwann` returns 4 channels using template 2.
  - No listener gives `SwannUnreachableError`.
  - No error message contains the password.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `feat(protocols): rtsp describe and swann recorder probe`.

---

### Task 7: Swann recorder integration (server and admin UI)

**Files:**
- Server: Create `services/swann.ts`. Modify `settings-keys.ts`, `schema.graphql`, `resolvers/integrations.ts`, `services/integrations.ts`.
- Web: Create `admin/integrations/SwannRecorderForm.tsx`. Modify `IntegrationsPage.tsx`, `admin/data/documents.ts`, `admin/lib/adminErrorMessage.ts`.
- Test: `apps/server/test/api-swann.test.ts` (inject a fake `probeSwann`); `apps/web/src/admin/integrations/SwannRecorderForm.test.tsx`

**Interfaces:**
```graphql
type SwannProbeResult { channels: Int!  codecs: [String!]! }
extend type IntegrationStatus { swannConfigured: Boolean! }
extend type Mutation { setSwannRecorder(host: String!, username: String!, password: String!): SwannProbeResult! }  # admin
```
- The mutation probes first. **Only on success** does it store host, username and password (encrypted) plus the probe result (template, channels) in `Setting` `swann.probe` (JSON, not secret), then call `manager.refresh()`.
- Error codes: `SWANN_AUTH_FAILED`, `SWANN_UNREACHABLE`, `SWANN_NO_STREAMS`.
- **Web form:**
  - IP prefilled `192.168.0.198` when `swannConfigured` is false.
  - The password is a SecretField.
  - The button reads "Test & find cameras".
  - Success shows "Found N cameras". If any codec is H265, it adds the note "Some cameras use H.265 and will be converted for browsers (uses more server CPU)."
- [ ] **Step 1: Failing tests:** each error code maps to friendly copy; success stores the settings and calls refresh; failure stores nothing; a USER gets FORBIDDEN; the web form renders the found count and the H.265 note.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5 (manual, read-only):** start `pnpm dev`. The user enters the real recorder login in Integrations. Record in the commit message the channel count, template and codecs found. **Stop and report** if the probe fails on the real recorder. That is a plan defect for Tasks 8–12.
- [ ] **Step 6:** Commit `feat: swann recorder integration`.

---

### Task 8: go2rtc helper supervisor

**Files:**
- Create: `src/cameras/go2rtc/{binary.ts,config.ts,supervisor.ts,api.ts}`
- Modify: `main.ts` (start after the manager; stop before the manager), `config.ts` (optional `GO2RTC_PATH` and `FFMPEG_PATH`, defaulting to `<repo>/tools/go2rtc/go2rtc.exe` and `<repo>/tools/ffmpeg/ffmpeg.exe`)
- Test: `apps/server/test/go2rtc-supervisor.test.ts` (uses a tiny fake executable script, e.g. `node fake-go2rtc.mjs`, that serves the needed API endpoints)

**Interfaces:**
- `writeGo2rtcConfig(dir): string` writes YAML with exactly: `api: { listen: "127.0.0.1:1984" }`, `rtsp: { listen: "" }`, `webrtc: { listen: ":8555" }`, `ffmpeg: { bin: <FFMPEG_PATH> }`, and **no streams**. It returns the path. The file is created under the OS temp dir per run.
- `class Go2rtcSupervisor { start(): Promise<void>; stop(): Promise<void>; on('ready'|'down') }`
  - Spawns the binary with `-config <path>`.
  - Polls `GET /api` until it is ready.
  - Restarts on exit with backoff 1 s, 2 s, 4 s … 60 s.
  - A missing binary means cameras are disabled, with one log line: `cameras disabled: go2rtc not found at <path>`.
- `Go2rtcApi`:
  - `putStream(name, src)` = `PUT /api/streams?name=&src=`
  - `deleteStream(name)`
  - `webrtcAnswer(name, offerSdp) → answerSdp` = `POST /api/webrtc?src=`
  - `frameJpeg(name) → Buffer` = `GET /api/frame.jpeg?src=`
  - `mseUrl(name)` = `ws://127.0.0.1:1984/api/ws?src=`
- **The registry re-registers all streams after every `ready`,** because go2rtc keeps them in memory only.
- [ ] **Step 1: Failing tests**
  - The fake exits, then restarts after 1 s (fake timers), and the streams are re-registered.
  - A missing binary gives the exact log line, and the server still starts.
  - `stop()` kills the child and leaves no restart.
  - The config file has no `streams:` key.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `feat(server): go2rtc supervisor`.

---

### Task 9: Swann driver and stream registry

**Files:**
- Create: `src/devices/drivers/{swann.ts,swann-link.ts}`, `src/cameras/streams/registry.ts`
- Modify: `drivers/index.ts`, `devices/topics.ts` (if needed)
- Test: `apps/server/test/drivers-swann.test.ts`, `apps/server/test/stream-registry.test.ts`

**Interfaces:**
- **The `SwannDriver` implements `Driver`.**
  - On `start` and every 60 s, if `swann.probe` exists it emits `discovered` for each channel: brand SWANN, kind CAMERA, `externalId "<host>:ch<N>"`, name `Camera <N>`, and config `{channel, mainPath, subPath, codec}`. Discovery sets `streamSource LOCAL` on create.
  - It reports `state {online}` from a periodic `rtspDescribe` of each adopted channel's sub path, every 30 s.
  - `setState` throws `DeviceNotReadyError`, since cameras have no commands.
- **`StreamRegistry`:**
  - `ensure(device): Promise<{ live: string; thumb: string }>` builds the URLs server-side as `rtsp://<user>:<pass>@<host>:554<path>`. An H265 source becomes `ffmpeg:<url>#video=h264`. It calls `putStream` and returns the stream names.
  - `release(deviceId)`.
  - `reregisterAll()`.
- Credentials are read via the settings store and never logged.
- [ ] **Step 1: Failing tests:**
  - With a probe setting of 4 channels, 4 `discovered` calls are made with the exact externalIds.
  - DESCRIBE failing makes the device `online:false`.
  - The registry builds `ffmpeg:` sources for H265 and plain sources for H264.
  - Logs captured during `ensure` contain no password.
  - Recorder unreachable (Review Focus 2): the devices go offline and nothing throws out of the driver.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `feat(server): swann camera driver and stream registry`.

---

### Task 10: Authorised camera HTTP endpoints, viewers and revocation

**Files:**
- Create: `src/cameras/http/{auth.ts,thumbnail-route.ts,webrtc-route.ts,mse-route.ts}`, `src/cameras/thumbnails/cache.ts`, `src/cameras/streams/{viewers.ts,revocation.ts}`
- Modify: `http.ts` (mount under `/api/cameras` **before** the SPA fallback), `server.ts` (WS upgrade routing for the MSE path)
- Test: `apps/server/test/camera-endpoints.test.ts` (fake `Go2rtcApi`)

**Interfaces (HTTP):**
- `GET /api/cameras/:id/thumbnail.jpg` (Bearer token)
  - 200 `image/jpeg`, with the header `X-Frame-Age: <seconds>`.
  - 404 when not visible to the caller; 503 when the frame is unavailable.
  - The cache holds one JPEG per camera for 10 s. A request within 10 s of the last grab returns the cached frame; otherwise it grabs via `frameJpeg`.
- `POST /api/cameras/:id/webrtc` (Bearer token, body `application/sdp` offer)
  - Returns `application/sdp` answer.
  - Registers the viewer `(userId, sessionId, deviceId)`.
- `GET /api/cameras/:id/mse` WebSocket.
  - The first client message is `{"authToken": "..."}`. After it is authorised, Node pipes the frames to and from `mseUrl`.
  - Bad or missing auth closes with 4401; no visibility closes with 4404.
- Auth in `cameras/http/auth.ts` reuses the Stage 1 non-sliding check when the `x-home-background: 1` header is present, and the normal sliding path otherwise.
- **`Revocation`** subscribes to Task 4's `grantsChanged`, to session deletion (logout, role/PIN change, expiry seen by the session watch), and to device removal. When an affected viewer exists, it calls `registry.release` then `ensure` (dropping all consumers) and drops that viewer. It also closes their MSE sockets.
- [ ] **Step 1: Failing tests**
  - An ungranted USER gets 404 on all three endpoints.
  - Two thumbnail requests within 10 s cause one `frameJpeg` call; at 11 s a second call is made.
  - `X-Frame-Age` is correct.
  - The WebRTC answer is proxied only when authorised.
  - Revoking the grant during a session leads to re-registration within the test's fake 5 s, and that viewer's MSE socket closes.
  - SPA fallback still doesn't capture `/api/cameras/*`.
  - Responses never contain `rtsp://`.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `feat(server): authorised camera endpoints and revocation`.

---

### Task 11: Camera tiles and the camera page player (web)

**Files:**
- Create: `device/camera/{useThumbnail.ts,CameraThumb.tsx,useWebRtcPlayer.ts,useMsePlayer.ts,CameraPlayer.tsx}`, `device/preview/CameraPreview.tsx`
- Modify: `dashboard/tile/TileBody.tsx` (camera variant), `pages/DevicePage.tsx`, `dashboard/lib/capabilities.ts` (CAMERA no longer "Not supported yet")
- Test: `device/camera/useThumbnail.test.ts`, `device/camera/CameraPlayer.test.tsx`

**Interfaces:**
- **`useThumbnail(deviceId)`:**
  - Polls `/api/cameras/:id/thumbnail.jpg` every 10 s with `fetch` (Authorization header plus `x-home-background: 1`).
  - Keeps a blob URL, revoking the old one.
  - Pauses while `document.hidden`.
  - Reports `ageSeconds` from `X-Frame-Age`.
  - Returns `{ src, ageSeconds, stale }`, with `stale` meaning age > 60 or the last request failed.
- **`CameraThumb`:** shows the image with an age label "12 s ago". When stale it shows "No recent image" and no image.
- **`CameraPlayer`:**
  - Tries WebRTC (`RTCPeerConnection`, recvonly video and audio, POST offer, set answer). On failure or a 10 s connection timeout it falls back to MSE over the WS endpoint.
  - Retries once after 2 s on disconnect.
  - Muted by default, with a mute toggle and a full-screen button.
  - Tears down on unmount and while `document.hidden`.
  - On the camera page: a cloud camera shows the note "Cloud-streamed: won't play when the internet is down." A 503 shows "Camera unavailable".
- [ ] **Step 1: Failing tests (mock fetch, RTCPeerConnection and WebSocket)**
  - Polling stops while hidden and resumes when visible.
  - Age > 60 shows "No recent image".
  - The blob URL is revoked on replacement.
  - The player falls back to MSE when the WebRTC POST rejects.
  - Unmount closes the peer connection and socket.
  - The exact cloud note text appears for CLOUD.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `feat(web): camera tiles and live player`.

---

### Task 12: Windows deployment and runbook

**Files:**
- Create: `scripts/lib/helpers-download.ps1`
- Modify: `scripts/install-service.ps1`, `scripts/firewall.ps1`, `docs/RUNNING.md`, `.gitignore` (`tools/`)
- Test: PowerShell parse checks plus dry-runs. The scripts must not be run for real on the dev PC except for downloading into `tools/`.

**Interfaces:**
- **`Install-Helpers -RepoRoot -DryRun`:**
  - Downloads the pinned **go2rtc** Windows amd64 release and the pinned **ffmpeg** essentials build into `tools/`.
  - Verifies the SHA-256 against constants in the script, and fails hard on a mismatch.
  - Is idempotent: it skips files already present with the right hash.
  - `install-service.ps1` calls it before the build step.
- **`firewall.ps1`** adds the rule "HomeControl go2rtc WebRTC": inbound UDP and TCP 8555, Private profile, scoped to `tools\go2rtc\go2rtc.exe`.
- The **ACL step** grants LocalService read and execute on `tools\`.
- **RUNNING.md** gains:
  - a section on Swann setup (Integrations → Swann recorder)
  - the Tuya "IoT Video Live Stream" service step
  - the camera troubleshooting notes: helper missing, H.265 CPU use, cloud stream unavailable
  - placeholder checklist lines for the Task 13 and 14 acceptance results
- [ ] **Step 1:** Write the scripts and docs.
- [ ] **Step 2:** Run the parse checks and dry-runs, then do a real `Install-Helpers` into the dev PC's `tools/`. Expected: hash verified.
- [ ] **Step 3:** Commit `chore: ship go2rtc/ffmpeg helpers, firewall rule, runbook`.

---

### Task 13: Swann end-to-end acceptance on the real recorder (manual gate)

- [ ] **Step 1:** Install go2rtc and ffmpeg locally into `tools/` with Task 12's `Install-Helpers` (dry-run first, then real; the folder is gitignored). Then run `pnpm dev`.
- [ ] **Step 2:** As admin, adopt the 4 Swann channels, then name them and assign rooms.
- [ ] **Step 3:** Check, from the PC browser and the phone browser:
  - Thumbnails refresh about every 10 s.
  - The live view starts within ~3 s.
  - Full screen and mute work.
- [ ] **Step 4:** Grant one camera to a test USER and view it on the phone. Revoke it from the admin page. The video stops within ~5 s.
- [ ] **Step 5:** Unplug the recorder's network cable for 2 minutes. Tiles show "No recent image" and the page shows "Camera unavailable". Reconnect, and it recovers without a server restart.
- [ ] **Step 6:** Record the results in `docs/RUNNING.md` §6, as checklist lines with outcomes. Commit `docs: swann camera acceptance results`.

---

### Task 14: Tuya cloud cameras

**Files:**
- Create: `packages/protocols/src/tuya/cloud-stream.ts`, `apps/server/src/cameras/tuya-cloud-source.ts`
- Modify: `tuya/cloud.ts` (export `allocateStream`), `cameras/streams/registry.ts` (CLOUD branch), `services/tuya-keys.ts` (category `sp` sets `streamSource CLOUD` on create/sync)
- Test: `packages/protocols/src/tuya/cloud-stream.test.ts`, `apps/server/test/tuya-cloud-source.test.ts`

**Interfaces:**
- `TuyaCloud.allocateStream(deviceId: string, type: 'rtsp' | 'hls'): Promise<{ url: string; expiresInSec: number }>`
  - Uses `POST /v1.0/devices/{id}/stream/actions/allocate` with body `{ type }`.
  - `expiresInSec` comes from the response if present, otherwise 300.
  - Errors: `TuyaCloudStreamUnavailableError`.
- `TuyaCloudSource.ensure(device)`:
  - Allocates rtsp, falling back to hls.
  - Registers `cam-<id>` in go2rtc.
  - Schedules re-allocation at 80 % of expiry while viewers or thumbnail requests exist.
  - Stops refreshing 30 s after the last request.
  - Throws `TuyaCloudStreamUnavailableError`, which the endpoints map to 503 with code `CLOUD_STREAM_UNAVAILABLE`. The web page shows exactly "Cloud stream not available for this camera".
- [ ] **Step 1: Failing tests (fake fetch)**
  - rtsp allocation is used.
  - rtsp failing with hls succeeding uses hls.
  - Both failing gives the unavailable error.
  - Refresh happens at 80 % (fake timers) and stops after idle.
  - No URL appears in logs.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5 (manual):** the user enables Tuya's **"IoT Video Live Stream"** service on the Tuya project. Run Tuya sync, adopt the Nexxt camera, and open its page.
  - If it plays, record that.
  - If allocation is refused, confirm the page shows the unavailable message and record it. Per the spec, no Tuya WebRTC bridge is built this stage.
- [ ] **Step 6:** Commit `feat: tuya cloud camera streams`.

---

### Task 15: Local ONVIF stream for Tuya cameras (added 2026-11-06, user-approved)

**Why:** "cámara cocina" (Tuya, LAN ~192.168.0.217) exposes ONVIF with a user-set password, so it can stream fully locally instead of via the Tuya cloud. This activates the spec's "LOCAL for Tuya cameras" future hook (spec §7.2/§8a-6).

**Files:**
- Create: `packages/protocols/src/onvif/{soap.ts,wsse.ts,media.ts,errors.ts}` (+ tests with a fake ONVIF HTTP server in `src/test/fake-onvif-server.ts`); `apps/server/src/services/camera-onvif.ts`, `apps/server/src/cameras/streams/onvif-streams.ts`; web `device/admin/OnvifLocalSection.tsx` (+ hook, error copy)
- Modify: `schema.graphql`, `resolvers/devices.ts` (thin), registry resolver selection, `StreamSourceNote`/admin section

**Interfaces:**
- `onvifStreamUris(host: string, port: number, creds, opts?) → Promise<{ main: string; sub?: string; codec?: string }>`: SOAP 1.2 over HTTP with WS-Security UsernameToken **PasswordDigest** (nonce + created + SHA-1), `GetProfiles` then `GetStreamUri` (RTP-Unicast/RTSP) for the first two profiles. Ports tried in order: 8000, 80, 8899, 2020 (first that answers `GetSystemDateAndTime`; use the camera's clock offset for `Created`). Errors: `OnvifAuthError`, `OnvifUnreachableError`, `OnvifNoStreamError`. Never send credentials over plain-text `PasswordText`.
- GraphQL (admin): `setCameraOnvif(deviceId: ID!, username: String!, password: String!): Device!` — probes, verifies the returned RTSP main URI with `rtspDescribe` (Digest, `allowBasic` false) using the same creds, then stores `{host, port, mainPath, subPath, codec}` in `Device.config.onvif` and the credentials **encrypted** in `Setting` key `camera.<deviceId>.onvif`, sets `streamSource LOCAL`, publishes DEVICES_CHANGED and triggers a media cut for that device. Errors `ONVIF_AUTH_FAILED`, `ONVIF_UNREACHABLE`, `ONVIF_NO_STREAM`; on any failure nothing is stored. `clearCameraOnvif(deviceId: ID!): Device!` — deletes the setting and `config.onvif`, sets `streamSource CLOUD`, cuts media.
- Resolver: LOCAL Tuya cameras with `config.onvif` resolve via ONVIF data (RTSP userinfo URL-encoded; H265 → ffmpeg transcode as for Swann); Tuya sync must not reset `streamSource` from LOCAL back to CLOUD once ONVIF is configured.
- Web (admin, Tuya CAMERA only): "Local stream (ONVIF)" section — username (default `admin`), password (SecretField), button **Test & switch to local**; success shows "Streaming locally"; when LOCAL via ONVIF show **Switch back to cloud**. Friendly copy for the three error codes.

- [ ] **Step 1: Failing tests** — WS-Security digest matches a known vector (nonce/created/password → digest); fake ONVIF server: wrong password ⇒ `OnvifAuthError`; returns two profile URIs ⇒ main/sub; port fallback (8000 closed, 80 answers); mutation stores encrypted creds + LOCAL only after RTSP verify succeeds; failure stores nothing; USER ⇒ FORBIDDEN; no response/log contains the password or RTSP URL; clear reverts to CLOUD; sync leaves LOCAL alone; web section only for admin + Tuya camera.
- [ ] **Step 2–4:** FAIL, implement, PASS (protocols, server, web suites).
- [ ] **Step 5 (manual):** user enters the cocina camera's ONVIF password on its page; record port, profile count, codec; confirm thumbnail + live view without the cloud label.
- [ ] **Step 6:** Commit `feat: local ONVIF streams for Tuya cameras`.

---

### Task 16: Clearer on/off state for switch and plug tiles (added 2026-11-06, user-chosen)

**Why:** On switch/plug tiles, "on" is only conveyed by the word "On". The user chose mockup **B with A's power icon** (`docs/superpowers/specs/assets/2026-11-06-switch-tiles-mockup.html`).

**Files:** `apps/web/src/dashboard/tile/` (new `PowerIndicator.tsx`, `TileToggle.tsx`; modify `TileBody.tsx`/`DeviceTile.tsx` styling), `dashboard/lib/` (pure `tileOnStyle` helper if needed); tests alongside.

**Spec for SWITCH and PLUG tiles (incl. KP303 outlets); lights and cameras unchanged:**
- Top-right round power icon (⏻, MUI `PowerSettingsNew`): **on** = filled green circle (`#2fd38a`) with dark icon and soft green glow; **off** = grey circle (`#2a2e3a`) with muted icon.
- Bottom-right phone-style switch (presentational, mirrors state; the whole tile remains the tap target — no separate click handler, `aria-hidden` to avoid a duplicate control): on = green track, thumb right; off = grey track, thumb left.
- Tile border: on = 1px green (`#2fd38a`); off = default. Background unchanged (dark).
- "On"/"Off" state line unchanged; offline / needs-setup tiles keep their existing disabled look (no green even if last state was on).
- Colours via theme tokens (add `palette.success`-based token if missing), not hard-coded in components.

- [ ] **Step 1: Failing tests:** on plug tile renders power indicator with `data-state="on"`, switch `data-state="on"`, green border style; off tile ⇒ `off`; offline on-plug ⇒ indicator not green (`data-state="off"` or `disabled`); light tiles unchanged (no indicator); tapping still toggles exactly once.
- [ ] **Step 2–4:** FAIL, implement, PASS (web suite, lint, build).
- [ ] **Step 5:** Commit `feat(web): clearer on/off state for switch and plug tiles`.
