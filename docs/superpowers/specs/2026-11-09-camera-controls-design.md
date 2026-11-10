# Camera Controls — Design

*Date: 2026-11-09 · Status: draft, awaiting approval · Builds on: Stage 2 cameras (`apps/web/src/device/camera/`, `apps/server/src/cameras/`), Camera multi-view (`docs/superpowers/specs/2026-11-09-camera-multiview-design.md`), the Tuya cloud client (`packages/protocols/src/tuya/cloud*.ts`)*

## 1. Intent

Today the app can only watch cameras. The user wants to **move a camera around** to look at something, on both phone and computer. They also want the camera's **general controls**, such as IR/night vision, wherever a camera has them. Only the **Tuya** cameras matter here; Swann cameras stay view-only.

## 2. What the cameras actually support

This was checked live on 2026-11-09 against the Tuya cloud thing model (`GET /v2.0/cloud/thing/{id}/model`):

| Camera | Product | Pan/tilt/zoom | Notable features |
|---|---|---|---|
| cámara cocina | `cdsxj`, v3.4 | **yes** | ptz_control/ptz_stop, zoom_control/zoom_stop/zoom_value, motion_tracking, presets (ipc_preset_set, ipc_preset_action, memory_point_set), cruise, siren, volume, restart, WDR, anti-flicker |
| cámara cochera, Camara, Cámara Sala 1, Cámara Sala 2 | `sp` | no | basic_nightvision, basic_private, basic_flip, basic_osd, basic_indicator, motion_switch, motion_sensitivity, motion areas, humanoid_filter, recording |
| Cámara Rancho, Cámara Pepe | `sp` | unknown | The cloud refuses with "permission deny / No space permission" (likely shared from another account). Same product keys as the fixed cameras. |

The standard `/v1.1/devices/{id}/specifications` **leaves out** cocina's PTZ codes (it answers "not support this device"), so the feature list must come from the **thing model**, not the specification.

## 3. Goals

- **Move (cameras that report `ptz_control`):** pan/tilt arrows over the live video. **Hold to move, release to stop** (sends `ptz_stop`). A quick tap is a short nudge (a start followed by a stop).
- **Zoom (cameras that report `zoom_control`):** + and − buttons with the same hold/release behaviour (`zoom_stop`).
- **Saved positions (cameras with presets):** four position buttons. Tap one to go there. Long-press (or a small "save" action on desktop) stores the current view in that slot.
- **Settings chips under the video**, each shown only if the camera reports that code, each showing the camera's **current value**:
  - Night vision (`basic_nightvision`): Auto / On / Off
  - Privacy (`basic_private`): **admin only**. Non-admins never see the chip.
  - Flip image (`basic_flip`)
  - Follow motion (`motion_tracking`)
  - Under **More…**: timestamp on video (`basic_osd`), status light (`basic_indicator`), motion detection (`motion_switch`), WDR (`basic_wdr`).
- **Where controls appear:** the device page's live view, and the full-screen single camera opened from the Cameras grid (`FullCamera`). The same component is used in both.
- **Layout (user picked option A):** arrows bottom-left and zoom bottom-right, floating over the video. Saved positions sit along the top edge. The overlay fades out when idle and comes back on hover or touch. The settings sit in a row of chips directly under the video.
- **Works on phone and computer:** touch (pointer events) and mouse. Buttons are large enough for thumbs.
- **Who can do what:** anyone who can view a camera can move it, zoom, use or save positions, and change the settings chips. **Privacy mode is admin-only**, enforced on the server, not just hidden.
- **No controls when unknown:** a camera whose feature list can't be read (Rancho, Pepe today) shows no controls and no error.

## 4. Non-goals

- Swann cameras (RTSP only, no control channel).
- Controls on the small Cameras-grid tiles.
- Patrol/cruise, siren, speaker volume, restart, SD card format/recording settings, motion sensitivity, motion zones, people-only filter, anti-flicker. These are a later "camera settings" job.
- Drag-on-video to steer, and pinch-to-zoom.
- Routines driving camera controls.

## 5. Anti-goals

- **A camera left spinning.** A release, a lost pointer (`pointercancel`, leaving the button, closing the page or dialog, tab hidden) must always send a stop. The server should also send a safety stop if no release arrives within a few seconds.
- **Controls leaking past access.** Every control call checks that the caller can view that camera (the same rule as streams: `visibleCamera`). Privacy is checked against the admin role on the server.
- **Showing buttons that do nothing.** Only codes the camera reports appear.
- **Changing what the player does today.** The video path, retries and multi-view behaviour stay as they are.

## 6. Constraints

- **Commands go through the Tuya cloud** (my call). The cameras already stream through the cloud, cocina's PTZ codes are missing from the standard instruction set, and the stored cloud credentials are already used for streams. Use the thing-shadow endpoints: `POST /v2.0/cloud/thing/{id}/shadow/properties/issue` with `{"properties": "{\"code\":value}"}` to send, and `GET /v2.0/cloud/thing/{id}/shadow/properties` to read current values. `CloudHttp.get/post` in `packages/protocols` already sign requests.
- **Not yet verified:** sending a command (no command was sent during design, to avoid moving a camera unasked). The first task of the plan must confirm with the user present that a cloud command moves cocina and stops it, and record the direction mapping of `ptz_control` values `0`–`9` (Tuya's usual mapping is 0 up, 2 right, 4 down, 6 left, odd values diagonals; 8 and 9 to be confirmed) and of `zoom_control` `0`/`1`.
- **Presets are the least certain part.** The builder confirms how cocina's `ipc_preset_set` / `ipc_preset_action` / `memory_point_set` behave. If "go to" and "save" can't both be done reliably, **drop presets** and say so; they are not worth a fragile feature.
- **Feature list storage:** the camera's controllable codes (with their enum ranges) are read from the thing model during the existing Tuya key sync (`apps/server/src/services/tuya-sync.ts`) and stored in the device `config`, the way `dpSchema` is stored for lights. A camera whose model call fails keeps no feature list, so it gets no controls.
- **Access:** the current rules apply as they are: `getVisibleDevice` / `visibleCamera` for viewing, and the admin role for privacy.
- **Code style:** small, single-purpose files and components (project convention). For example, separate components for the overlay, direction pad, zoom buttons, position buttons and settings chips, plus a hook for hold-to-move.
- **Tests:** server tests in the existing vitest harness with a fake cloud; web tests with the existing testing setup.

## 7. Calls made during review

These are marked as the designer's calls, not the user's:

- **Privacy on shows a clear state to everyone.** When the camera reports `basic_private` on, the video area shows "Privacy mode is on" instead of a broken or retrying player. This is the one allowed change to the player path. Non-admins see the state but can't switch it. Admins also get the chip to turn it off.
- **If PTZ or zoom move in steps, not continuously** (checked in the first plan task), "hold" repeats the command at a steady rate while pressed. The server safety stop still applies. The interaction doesn't change.
- **A failed thing-model call never erases a stored feature list.** It only fills or updates it, the way `dpSchema` works today. A camera without a list just never gets one.
- **The app remembers which position slots were saved** (in the device config, set when a user saves a slot). Empty slots show as "save here" rather than "go". Slots have no labels or thumbnails.
- **Keep cloud calls low:** read current values when the controls open and after each change. No background polling. Moves are a start and a stop call, not a stream of calls. *(Tuya cloud plans can have call quotas; this keeps the feature cheap either way.)*
- **Overlay placement next to the existing player buttons:** the zoom buttons stack above the existing mute and full-screen buttons (bottom-right), and those buttons stay where they are. Arrows and zoom live inside the player frame, so they work in the player's own full screen. The settings chips sit outside the frame and don't show in browser full screen. That's acceptable.

## 8. Left to the builder

- GraphQL shape: for example a `cameraControls` field (features plus current values, null when unknown) and mutations for move/stop, zoom/stop, preset go/save, and setting a value. These follow the existing `setDeviceState` patterns and error codes.
- How often current values refresh (on open, after each change, light polling while the page is open).
- The nudge duration, the server safety-stop timeout, and the overlay fade timing.
- Error display: a small inline message near the control that failed. The video is unaffected.
- Icons, labels and exact styling, within the existing MUI look.
