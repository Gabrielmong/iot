# Stage 2 — Cameras and Device Details Pages — Design

*Date: 2026-11-06 · Status: draft for review · Builds on: `2026-11-05-home-control-design.md` (Stage 1, merged to `main`)*

## 1. Intent

Stage 1 delivered a LAN-only dashboard that controls the house's Tuya, Kasa and Govee devices. Stage 2 adds two things:

1. **Cameras.** Live video from the house's cameras, viewed mainly on a **PC and a phone**: the four wired cameras on the Swann recorder, plus the Smart Life (Tuya) cameras, starting with the Nexxt AHIMPFI4U1.
2. **A details page for every device.** Each device gets a full page with its own URL. The page shows a live preview, every control the device has, device information, and (for admins) all management actions. A camera's page is where its live video lives.

## 2. Goals

- Watch any camera the user is allowed to see, live, from the PC or phone browser.
- Dashboard camera tiles show a recent still image (about 10 s old) without streaming video continuously.
- Each device has a bookmarkable details page with:
  - a live preview
  - all of its controls
  - device information
  - admin actions
- The 4 Swann wired cameras work **fully locally**: no internet needed.
- Smart Life cameras work through the Tuya cloud, clearly labelled as such.

## 3. Non-goals (this stage)

- **Past recordings / playback** from the Swann recorder. This is a wanted "nice to have", planned as a follow-up (**Stage 2b**) once the recorder's playback capabilities are known.
- Recording, snapshots saved to disk, or a server-side NVR.
- Two-way audio (talk-back), pan/tilt/zoom control, motion or person alerts.
- Remote (outside-the-house) access. This stays a Stage 1 non-goal.
- The 2D/3D house builder (Stage 3).

## 4. Anti-goals

- **Camera credentials or stream URLs reaching the browser.** The browser only ever talks to our server. The recorder login and Tuya keys never leave it.
- **A user seeing a camera they weren't granted,** including through the stream or thumbnail endpoints, not just through GraphQL.
- **Video streaming when nobody is watching.** That wastes LAN bandwidth, and for cloud cameras it also wastes internet bandwidth and Tuya quota.
- **A cloud camera silently presented as local,** or local cameras silently routed through the cloud.

## 5. Constraints

Everything from Stage 1 still applies:
- TypeScript, React + MUI, Three.js, Apollo GraphQL, Prisma + Postgres.
- The latest stable libraries.
- No big files, with strict separation of concerns.
- The server runs natively on the Windows server PC.
- Android Chrome and desktop browsers are the clients.
- Login and grant rules are unchanged.

Rules specific to this stage:
- **Camera helper process (pre-approved exception):** the server may supervise a non-TypeScript helper, e.g. **go2rtc** or ffmpeg, to turn RTSP/cloud streams into something browsers play (WebRTC preferred, HLS or MSE fallback). The helper listens only on localhost, and the Node server proxies or authorises every browser connection to it.
- **Cloud exception (decided by the user, 2026-11-06):** a camera can be set explicitly to stream via the Tuya cloud (Tuya OpenAPI, using the existing developer keys) when it has no usable local stream.
  - The UI labels such cameras "via Tuya cloud" and explains they won't play without internet.
  - The Nexxt AHIMPFI4U1 starts on the cloud route.
  - Each camera has a stream source setting (local or cloud), which admins can change.
- **Credentials:** the Swann recorder credentials (host/IP, username, password) are entered in Admin → Integrations and stored encrypted in `Setting`, exactly like the TP-Link credentials.

## 6. What exists (from Stage 1 and recon)

- **Device model:** `DeviceKind.CAMERA` already exists. Tuya cloud sync maps category `sp` to CAMERA. Camera devices are recorded but have no driver or controls yet.
- **Dashboard:** tiles open a pop-up dialog through ⋯ or long-press, and `CAMERA` tiles say "Not supported yet".
- **Admin:** device management lives in a per-row menu on Admin → Devices.
- **Network recon:**
  - `192.168.0.198`: almost certainly the **Swann recorder**. It runs an RTSP server on 554 that answers OPTIONS, and an HTTPS web UI on 443. The model is unknown.
  - The recorder serves **4 wired cameras**.
  - The Nexxt camera is a Tuya device (192.168.0.196 at recon time). It runs an ONVIF server on port 8000 that requires authentication, but the vendor app and docs expose no local credentials, hence the cloud route.

## 7. The design

### 7.1 Device details page (all devices)

- **Route:** `/devices/:id`, with its own URL, bookmarkable on PC and phone.
- **Opening it:** tile tap still toggles. The tile's ⋯ button and long-press open the details page, replacing the Stage 1 pop-up dialog. Camera tiles open the details page on tap, since a camera has nothing to toggle.
- **Sections:**
  - **Live preview:**
    - Lights show a drawing of the light glowing in its *current* colour and brightness (white temperature is shown as a warm/cool tint). It updates immediately as controls move (optimistically) and live when the device changes elsewhere.
    - Plugs and switches show an on/off illustration.
    - Cameras show live video.
  - **Controls:** everything the device supports.
    - Lights: power, brightness, colour (swatches plus the full colour range) and white temperature.
    - Switches and plugs: on/off.
    - Cameras: full screen and mute.
  - **Device info:**
    - Brand and model, type, room.
    - Connection: "Local (LAN)" or "via Tuya cloud".
    - Network address, status, last seen.
  - **Admin section (admins only):** rename, move room, change type, set Tuya local key (where applicable), who has access, remove. For cameras, also **stream source** (local or cloud).
- **Access:** users without admin rights see the page only for devices they're granted, without the admin section. Visiting a non-granted device's URL shows "not found / no access".
- **Admin → Devices** remains the place for adopting new devices. Its per-device actions may link to, or reuse, the details page's admin components (builder's call).
- **Wireframe:** `docs/superpowers/specs/assets/2026-11-06-device-page-wireframe.html` (light and camera pages side by side). The user approved it. The prose wins where the two differ. On phones the two columns stack.

### 7.2 Camera sources

- **Swann recorder (local):**
  - The admin enters the recorder credentials in Integrations.
  - The server discovers the recorder's channels: ONVIF profiles if the recorder supports them, otherwise known Swann RTSP URL patterns per channel. A pattern must be verified working before it is saved.
  - Each channel becomes a `Device` with kind CAMERA, brand SWANN (new enum value) and an `externalId` like `<recorder serial or ip>:ch<N>`. Channels appear as "New on network" for the admin to adopt, name and assign to a room, as with other devices.
- **Tuya cameras (cloud):**
  - Tuya devices of category `sp` default to stream source **cloud**.
  - When a stream or thumbnail is needed, the server asks the Tuya OpenAPI for a temporary stream URL. The protocol (RTSP or HLS) is the builder's call. The server feeds the URL to the helper and refreshes it before it expires.
- **Per-camera setting:** `streamSource: LOCAL | CLOUD`.
  - For Swann channels it is fixed to LOCAL.
  - Tuya cameras default to CLOUD. LOCAL is offered only if a local stream URL and credentials are configured. Configuring that is out of scope this stage except as a future hook.

### 7.3 Live view and thumbnails

- **Live view:**
  - Opening a camera's page starts a stream session through the helper. The browser connects via a server endpoint that checks the session and the device grant.
  - The session stops shortly after the last viewer leaves.
  - WebRTC is preferred for low latency on Chrome and desktop, with HLS or MSE as fallback.
- **Thumbnails:**
  - While at least one client has the dashboard open (detected through an active subscription or a polling endpoint, builder's call), the server grabs one frame per visible camera about every **10 s**. It caches the newest JPEG in memory and serves it from an authorised endpoint.
  - When no one is watching, no thumbnails are fetched.
  - A tile shows the image with an age label ("12 s ago"). If a frame is stale (> 60 s) or failed, the tile says so instead of showing an old image as live.
- **Cloud cameras:** the same mechanisms apply. Grabbing a thumbnail opens a short cloud stream, so it should be as cheap as the API allows (builder decides between a snapshot API, if Tuya offers one for this category, and a brief stream grab).

### 7.4 Permissions and security

- Cameras are granted per user like other devices, with no implicit access. The shared wall-tablet account sees cameras only if that account is granted them.
- Every stream, signaling and thumbnail request is authorised with the user's session and grant on **every** request or connection. The 4401/UNAUTHENTICATED behaviour from Stage 1 applies.
- Revoking a grant, or a session expiring, ends any open stream for that user promptly.
- Neither the helper's port nor any raw RTSP or cloud URL is reachable from the network or visible to the browser.
- Background thumbnail fetches must not slide sessions. This is the same rule as the Stage 1 `x-home-background` header.

### 7.5 Integrations page additions

- **Swann recorder:**
  - Fields: IP (prefilled 192.168.0.198 if discovered), username, password.
  - "Test & find cameras" reports how many channels were found, or a clear error (bad login, recorder unreachable, no supported stream format).
- The **Tuya** section notes that Tuya cameras stream via the cloud.

## 8. Phasing inside Stage 2

1. **Device details page** for all existing device types, with no cameras yet. It replaces the dialog.
2. **Camera infrastructure:** the helper process (supervised, localhost-only), the authorised stream and thumbnail endpoints, and the Swann recorder integration with its 4 channels.
3. **Tuya cloud cameras:** the Nexxt and any other Smart Life cameras.
4. **(2b, later)** Swann past-recordings playback, after investigating the recorder.

## 8a. Designer's calls (settled after builder review)

1. **Swann first, verified on the real recorder.** Phase 2 opens with a read-only spike against the real recorder, using the login the admin enters in Integrations:
   - Run ONVIF GetProfiles or RTSP DESCRIBE per channel and record each stream's codec and resolution.
   - Use sub-streams for thumbnails and main streams for live view.
   - If a stream is H.265, the helper **transcodes to H.264** for browsers. The CPU cost on the server PC is accepted.
   - The real recorder is reachable during the build. Phase 2 ends with a manual acceptance gate on it, with the fakes and mocks covering everything else.
2. **WebRTC authorisation is at signaling.** Media flows over UDP from the helper straight to LAN clients, which is acceptable on the LAN.
   - The helper's HTTP API stays on localhost.
   - Its WebRTC media port (go2rtc default UDP/TCP 8555) gets a firewall rule on the **Private profile only**.
   - Node authorises every signaling exchange with the session and grant.
   - On revoke or session expiry, Node tells the helper to drop that consumer within ~5 s.
   - Where WebRTC fails, the fallback is MSE or HLS proxied through Node.
3. **Tuya cloud video needs a Tuya service.** Phase 3 starts by verifying the Tuya OpenAPI stream allocation for the Nexxt. This needs the **"IoT Video Live Stream"** service enabled on the user's Tuya project; the runbook gets a step for it.
   - If allocation works only through Tuya's own WebRTC/MQTT flow, or is unavailable, **cut phase 3 down:** the camera shows "Cloud stream not available for this camera" with its info and admin actions. No Tuya WebRTC bridge is built this stage.
4. **Helper shipping and secrets:**
   - The install script downloads a **pinned go2rtc release with checksum verification** (plus ffmpeg if transcoding or frame grabs need it, also pinned).
   - The helper runs as a child process supervised by the Node server, which restarts it with backoff.
   - Stream sources containing credentials are **registered through the helper's localhost API at runtime, in memory only**. No plaintext credentials go in config files or logs.
5. **Thumbnails go through the helper.**
   - It keeps a single upstream connection per camera while that camera is in use, so the recorder's limit on concurrent sessions isn't exhausted.
   - The cameras fetched are the **union of cameras granted to users who currently have the dashboard open**.
   - The cache is per camera and shared, and the thumbnail endpoint checks the caller's grant on each request.
6. **`streamSource`** is a column on `Device` (enum `LOCAL | CLOUD`, null for non-cameras). The stream-source control is **hidden** for Tuya cameras until local configuration exists (a future hook), and is fixed to LOCAL, shown read-only, for Swann channels.

## 9. Open items

- The Swann recorder model and its exact RTSP/ONVIF paths. Check on the real recorder, with the user's login, during implementation (read-only).
- Which other Smart Life cameras exist. They will appear through Tuya sync.
- Tuya OpenAPI stream allocation details for this camera category (supported protocols, URL lifetime, quota). Verify against Tuya's docs and the real account.

## 10. Left to the builder

- go2rtc versus ffmpeg, and how the helper is shipped and supervised on Windows. The Stage 1 service and runbook must be updated.
- WebRTC signaling transport, proxying versus token-authorised direct access to the helper, and the fallback protocol.
- How "someone is watching the dashboard" is detected.
- Data-model details for stream source and recorder channels (Prisma migration).
- Visual styling of the preview illustrations, within MUI.
- Splitting files and components according to the no-big-files directive.
