# Home Control — Design

*Date: 2026-11-05 · Status: draft for review*

## 1. Intent

One self-hosted app to control every smart device in the house — Govee lights, Tuya/Smart Life bulbs, switches and cameras, Kasa plugs, Nexxt cameras — instead of hopping between Govee Home, Smart Life, Kasa, Nexxt Home and the Alexa app. Alexa unifies some of this but flattens everything into generic on/off switches and loses brand features (Govee scenes, camera feeds, rich color control).

The app has two faces:

1. **A dashboard** — every device as a live tile, filterable by room, controllable in one tap. This is the everyday screen and the first priority.
2. **A house builder** — the user models their real home (multiple floors, walls, windows, doors, furniture at real dimensions) in 2D and 3D, places each device where it physically is, and then uses that 3D house as a live control view: bulbs show their actual current color, clicking a device opens its controls, clicking a camera opens its feed.

It runs 24/7 on the user's home server PC and is opened in a browser on a PC, a phone, or a phone/tablet mounted on a wall.

## 2. Goals

- Control every supported device from one place, locally over the home network. Govee **scenes/effects are not needed** — Govee control is on/off, brightness, color, color temperature via the official LAN API.
- Live state everywhere: a change made anywhere (our app, Alexa, a vendor app, a physical switch) shows up on every open screen within a couple of seconds.
- Works well on three form factors: desktop browser, phone browser, wall-mounted phone/tablet in kiosk mode.
- Multi-user with PIN login and per-device permissions.
- A whole-house builder (2D plan + 3D) with accurate real-world measurements.
- 3D control view that mirrors live device state.

## 3. Non-goals (for now)

- **Remote access from outside the home.** Home network only. The design must not preclude adding it later (e.g. via Tailscale or a Cloudflare tunnel — never a raw port-forward), but it is not built now.
- **Automations, schedules, scenes-across-brands.** ("Lights on at sunset" etc.) Possibly later.
- **Replacing Alexa or vendor apps.** They keep working alongside; we coexist, not take over pairing/onboarding of new hardware.
- **Realistic lighting in 3D.** No light casting, glow or shadows — a bulb is simply rendered in its current color.
- **Realistic furniture models.** Parametric simple shapes are enough.
- **Recording/NVR for cameras.** Live view only.
- **Entry/access devices** (garage door / myQ opener, gates, locks). The app is for things inside the house; anything that opens the home is out of scope.

## 4. Anti-goals (would make it a failure even if it "works")

- Depending on a vendor cloud for day-to-day control (internet down ⇒ house unusable).
- Exposing the app or devices to the internet.
- A wall tablet that's sluggish or awkward to use. (A quick tap-your-name + PIN is acceptable; long passwords are not.)
- 3D/2D geometry that drifts or is inaccurate (a bed typed as 2.00 m must be exactly 2.00 m, walls must meet cleanly).

## 5. Constraints (decided by the user)

**Stack — strict:**
- TypeScript everywhere, latest stable versions of all libraries.
- Frontend: React + **MUI**, **Three.js** for 3D.
- API: **Apollo GraphQL** on both server (Apollo Server) and client (Apollo Client). Live updates via GraphQL **subscriptions**.
- Persistence: **Prisma + PostgreSQL**.
- Server runtime: Node.js (TypeScript).

**Exception, approved by the user:** camera stream conversion (RTSP → browser-playable) may use a non-TS helper process (e.g. go2rtc or ffmpeg) supervised by the Node server.

**Hosting:** a dedicated always-on **Windows** "server PC" on the home LAN. Clients reach it by LAN address in a browser. The Node server must run **natively on Windows** (not in Docker/WSL2), because device discovery relies on UDP broadcast/multicast on the host network. It must start on boot and restart on crash (Windows service; mechanism is the builder's call). Postgres and the stream helper also run on this machine (native install or otherwise — builder's call, as long as the Node server is native). The Windows network profile for the LAN adapter should be set to Private, with firewall rules for the discovery ports.

**Clients:** **Android** phones and an Android wall tablet (model not chosen yet — assume a modest mid-range Android tablet), Chrome-based browsers, plus desktop browsers on the PC. No iOS requirement.

**Units:** metric (meters / centimeters).

## 6. What's on the network (recon, 2026-11-05)

Scanned from the user's PC on 192.168.0.0/24 (read-only discovery). This is a snapshot to inform design, not configuration.

| Brand | Devices | Findings |
|---|---|---|
| Tuya / Smart Life (incl. Lightinside bulbs LI-SM-A19E26-11W, LTD-SM-G16.5E-12, plus assorted switches, bulbs and cameras) | **16 devices** broadcasting | Protocol versions present: **3.1 ×1, 3.3 ×9, 3.4 ×2, 3.5 ×4**. All listen on TCP 6668. |
| Nexxt camera AHIMPFI4U1 | 1 | Appears to be Tuya-based: likely 192.168.0.196 (Tuya 3.4) which also runs an **ONVIF server (Happytimesoft) on port 8000**, auth required. Local stream via ONVIF looks feasible. |
| Unknown camera | 1 at 192.168.0.198 | Non-Tuya; RTSP server on 554 (responds to OPTIONS) + HTTPS web UI on 443. User doesn't know what it is. |
| TP-Link Kasa KP303 (3-outlet strip) | 1, likely 192.168.0.241 | Does **not** answer legacy protocol (UDP/TCP 9999); serves HTTP on 80 (`SHIP 2.0`) ⇒ newer firmware using the encrypted **KLAP** protocol, needs TP-Link account credentials. |
| Govee H60A1 (ceiling), H6168 (TV backlight), H618C (strip), H6102 (strip) | 4 | **No response** to LAN API discovery (multicast or unicast), even after the user enabled LAN Control. Unresolved — suspected network separation (other SSID/subnet, client isolation, multicast filtering) or toggle not applied. H6102 may not support the LAN API at all (possibly Bluetooth-only). |

Other notes: the server-candidate PC's network profile is "Public" in Windows; recommend Private. Library landscape: no single maintained Node library covers Tuya 3.4/3.5 or Kasa KLAP well.

## 7. The design

### 7.1 Architecture

```
 Browsers (PC / phone / wall tablet)
   │  Apollo Client (queries, mutations, subscriptions over WebSocket)
   ▼
 Node server (Apollo Server)
   ├─ Auth & permissions
   ├─ Device registry + live state cache  ──► Postgres (Prisma)
   ├─ Drivers: tuya · kasa · govee · camera(onvif/rtsp)
   ├─ House model service (floors, walls, furniture, device placements)
   └─ Stream helper supervisor ──► go2rtc/ffmpeg ──► WebRTC/HLS to browsers
   │
   ▼ LAN only
 Devices
```

### 7.2 Device layer

- **One driver per brand**, each implementing a common device interface (discover, connect, read state, set state, emit state changes). The rest of the app only sees normalized device types: `light` (on/off, brightness, color, color temperature, effects/scenes where supported), `switch`/`plug` (on/off, possibly per-outlet children), `camera` (stream).
- **Write our own TypeScript protocol clients** where existing libraries are inadequate: Tuya (must support 3.1, 3.3, 3.4, 3.5) and Kasa KLAP. Govee LAN is simple enough to own as well. Existing libraries may be used where they're solid and current; that's the builder's call.
- **Local only during operation.** One-time setup steps may touch vendor clouds:
  - Tuya: pull each device's *local key* from the Tuya IoT developer platform (keys change when a device is re-paired; the app must surface "key invalid" clearly). *(Designer's call:)* the admin enters their Tuya developer Access ID/secret once, and the app has a "Sync keys from Tuya" action that fetches/refreshes all local keys. Manual key entry per device is also supported as a fallback (e.g. if the free-tier API access has lapsed). The cloud is touched only during this sync.
  - Kasa: TP-Link account credentials for KLAP authentication.
  - Govee: LAN Control enabled per device in the Govee app.
- **Discovery** runs continuously (Tuya broadcasts, Govee multicast scan, Kasa discovery) so new/moved devices appear; the admin adopts discovered devices, names them, assigns rooms.
- **Live state:** the server keeps an in-memory state cache fed by device push messages and/or polling, and publishes changes over GraphQL subscriptions. External changes (Alexa, vendor apps, wall switches) must be reflected.
- **Coexistence:** don't break devices for Alexa or vendor apps.

### 7.3 Cameras

- Server obtains each camera's local stream (ONVIF to discover RTSP URLs where available, direct RTSP otherwise) and re-serves it to browsers via a supervised helper (go2rtc or ffmpeg) as WebRTC or HLS.
- Camera tiles show a live thumbnail on the dashboard; opening one shows the full live view.
- Cameras with no local stream are never *silently* routed through the cloud. **Decision (2026-11-06, user):** a camera may be explicitly configured to use the Tuya cloud stream (Tuya OpenAPI, using the existing developer keys) when it has no usable local stream. This is a documented exception to "LAN only": such a camera is labelled as cloud-streamed in the UI and won't play when the internet is down. The Nexxt AHIMPFI4U1 starts on the cloud route, because its local access isn't exposed in the app or documented; it can switch to local later if Nexxt confirms ONVIF/RTSP. Each camera's source (local or cloud) is a per-camera setting.

### 7.4 Users, login, permissions

- **Login screen:** grid of user names/avatars → tap yours → enter PIN.
- **Roles:**
  - *Admin:* everything — device setup and keys, house editing, user management, permission grants.
  - *User:* sees and **operates** only devices granted to them (on/off, color, view camera). Cannot rename, move, configure devices or edit the house.
- **Per-device grants** (cameras will typically be the most restricted).
- **Shared screens** (wall tablet): the device is marked as a shared screen; it returns to the user picker after a few minutes of inactivity. Personal devices stay signed in.
- PINs are acceptable because access is LAN-only. If remote access is ever added, stronger auth comes with it.

### 7.5 Dashboard (Phase 1 centerpiece)

- Tiles for every device the user may see, with room filter tabs ("All", per room).
- Tile shows current state at a glance (light color + brightness, plug on/off, camera thumbnail). Tap toggles; open for full controls (brightness, color wheel/swatches, color temperature, per-outlet control for the KP303). No Govee scenes.
- Responsive for desktop, phone, and wall tablet (kiosk/full-screen friendly, large touch targets).
- Wireframe from brainstorming: `.superpowers/brainstorm/*/content/overview.html` (screen A).

### 7.6 House builder

- **Whole house, multiple floors.** Floors stack; the user switches between them.
- **Two editors over one model:**
  - *2D plan editor:* top-down grid with measurements; draw walls, place doors/windows/furniture, type exact sizes.
  - *3D editor:* orbit camera; drag/move/resize walls and furniture with handles; side panel for exact X/Y/Z dimensions and position.
  - Both edit the same underlying house model; changes in one appear immediately in the other.
- **Elements:** walls (height per floor, overridable per wall), windows, doors, and a basic parametric furniture set — beds, sofas, chairs, tables, desks, lamps (simple shapes, sized in X/Y/Z).
- **Device placement:** pick an adopted device and place it in 3D space (e.g. a bulb inside a lamp, a strip behind a desk, a camera in a corner).
- **Undo/redo.** Only admins can edit.
- **Geometry accuracy is a hard requirement.** All geometry math (wall joins/intersections, snapping, dimension handling, floor elevations, 2D↔3D mapping) lives in a pure, framework-free TypeScript module with thorough unit tests asserting exact values.

### 7.7 3D control view

- The built house, read-only for users, showing live device state: each light rendered in its current color/brightness (no light casting, glow or shadows); off = neutral/dark.
- Click a light → its control panel. Click a camera → its live feed.
- Users see only devices they're permitted to; must run smoothly on a wall tablet/phone.
- Wireframe: `overview.html` (screen B). Builder-style mockups: `builder-style-v2.html`.

## 8. Phasing

1. **Devices + dashboard + logins** — all brand drivers working locally, adoption/naming/rooms, dashboard with live state, PIN login and per-device permissions. *First priority: "the dashboard controlling every device."* *(Designer's call:)* if Govee devices are still unreachable on the LAN when the rest is done, Phase 1 is complete without them; the Govee driver is built and tested against the protocol, and verified on real devices once the network issue is resolved.
2. **Cameras** — stream helper, ONVIF/RTSP, dashboard thumbnails, full-screen view.
3. **House builder + 3D control view** — 2D and 3D editors, floors, furniture, device placement, live 3D view.
4. **Later / maybe** — remote access, automations/schedules, Govee cloud fallback for LAN-incapable models (e.g. H6102 if confirmed).

## 9. Open items

- **Govee not responding on LAN** — diagnose (router client list for `ihoment_*` hostnames / subnet; LAN toggle; multicast filtering). User will test later.
- **Identify 192.168.0.198** (non-Tuya RTSP camera/device).
- **Confirm the Nexxt camera** is 192.168.0.196 and get its ONVIF/RTSP credentials and stream path.
- **H6102** LAN capability.

## 10. Left to the builder

- Monorepo layout, package manager, build tooling, test framework.
- GraphQL schema design and subscription transport details.
- Prisma schema.
- Whether to use any existing protocol library vs. writing our own (subject to: must cover Tuya 3.1–3.5 and Kasa KLAP).
- Polling intervals, reconnection/backoff strategies.
- Secret storage for Tuya local keys / TP-Link credentials.
- 3D implementation approach on top of Three.js (raw Three.js vs. a React binding), visual styling within MUI.
- Choice between go2rtc and ffmpeg for streams (Android/Chrome + desktop only, so WebRTC is a fine primary).
- 3D performance budget, targeting a modest mid-range Android tablet.
