# TV control and Wake-on-LAN for PCs — Design

*Date: 2026-11-09 · Status: draft, awaiting approval · Builds on: the driver model (`apps/server/src/devices/types.ts`, `devices/drivers/*`), device grants (`services/grants.ts`), routines (`routines/steps.ts`, `routines/action-rules.ts`), the device page (`apps/web/src/device/`), the dashboard tiles and layouts, and the notes in `docs/NICE-TO-HAVES.md` ("Smart TV control", "Wake-on-LAN for computers")*

## 1. Intent

**TVs.** Control every TV in the house from the app, the way the Google Home phone remote does. Each TV gets a dashboard tile that shows whether it's on and toggles power. Its device page shows a remote: power, volume and mute, arrows with OK, Back and Home, and shortcuts to the common apps.

**PCs.** Turn a PC on from the app from anywhere in the house ("at a distance", on the home network). Power-on only.

## 2. What's on the network (scanned 2026-11-09)

| IP | Device | Name on the network | Protocol |
|---|---|---|---|
| 192.168.0.139 | Xiaomi MiTV-MOOR4 (Android TV, kernel 4.19) | "Su abuela" | Android TV Remote v2 (6466/6467) |
| 192.168.0.163 | TCL Smart TV Pro (Google TV, Android 14) | "TV de Sala de estar" | Android TV Remote v2 |
| 192.168.0.244 | Google TV Streamer | "Sala de estar" | Android TV Remote v2 |
| 192.168.0.168 | Chromecast with Google TV | "Chrome55" | Android TV Remote v2 |
| 192.168.0.235 | Samsung UN55NU7100 (2018, Tizen, **Wi-Fi**) | "[TV] Tele cuarto" | Samsung WebSocket remote, port 8002 (TLS, token auth). `/api/v2/` on 8001 gives model, MAC, name |
| 192.168.0.208 | Hisense 55U6SV (VIDAA) | "TV del dormitorio" | Hisense VIDAA remote: MQTT over TLS on port 36669 |
| ? | Second Samsung | — | Not scanned yet (it was off). Expected to be the same Samsung driver; check its model when it is on |

All of them answer SSDP. The Android/Google TVs advertise `Chromecast/…` with a DIAL device description on port 8008. The Samsung answers with `Samsung-Linux` and `/api/v2/`. The Hisense advertises a `HISETV…` UUID with a DIAL description on port 3366.

PCs: several Windows desktops and laptops, all on **wired Ethernet**, same subnet as the server.

## 3. Goals

### TVs
- **Three drivers, one TV experience:**
  - Android TV Remote v2: Xiaomi, TCL, Google TV Streamer, Chromecast with Google TV.
  - Samsung Tizen (2016+): WebSocket remote.
  - Hisense VIDAA: MQTT.
- **Discovery:** TVs show up in Admin > Devices like other discovered devices, are adopted the same way and get a room. An admin can also add a TV by IP if discovery misses it.
- **Pairing**, once per TV, from the admin side:
  - Android TV and Hisense: the TV shows a code, and the admin types it into the app.
  - Samsung: the TV shows an "Allow" prompt, and someone accepts it on the TV.
  - The resulting certificate or token is stored encrypted (`secrets.ts`). A TV that isn't paired, or whose pairing was revoked on the TV, shows a clear "needs pairing" status, as cameras and Tuya devices show "needs credentials" today.
- **Dashboard tile:** shows on/off (and offline) and toggles power. It moves and resizes like any other tile.
- **Remote on the TV's device page:**
  - power, volume up/down, mute
  - arrows with OK, Back, Home
  - a row of app shortcuts for the common apps: YouTube, Netflix, Prime Video, Disney+, Spotify. Only apps the driver can launch on that TV are shown.
  - Holding a volume or arrow button repeats.
- **Power on from standby:**
  - Android TV: through the remote protocol.
  - Samsung: Wake-on-LAN to its MAC, which needs the TV setting *Power On with Mobile*. Test it; this Samsung is on Wi-Fi.
  - Hisense: Wake-on-LAN if the TV supports it. Otherwise the tile says the TV can only be turned off from the app.
- **Access:** TVs use the existing device grants. Admins see all of them; users and guests see the TVs granted to them.
- **Routines:** a routine step can turn a TV on or off. *(Builder's call below on app launch.)*

### PCs (Wake-on-LAN)
- **Adding a PC:** an admin adds each PC by hand (Admin > Devices): name, room, MAC address, and an optional IP address. There's no discovery.
- **Dashboard tile:** shows *Online* / *Offline* (when an IP is stored) and a **Wake** button. There is no off.
- **Online status:** when an IP is stored, the server checks every few seconds whether the PC answers (TCP connect to 445 or 3389). Without an IP the tile shows only Wake, with no status.
- **Wake:** the server sends a magic packet (UDP broadcast to port 9: 6× `0xFF` then the MAC 16 times) using Node's `dgram`. No new dependency.
- **Access:** admins wake any PC. Users wake only PCs an admin granted them, through the existing Device access dialog. **Guests can never be given a PC.**
- **Routines:** a routine step can wake a PC.
- **Setup checklist** in the docs, linked from the Add PC dialog:
  - Wake-on-LAN enabled in BIOS/UEFI.
  - "Wake on Magic Packet" enabled for the network adapter.
  - Windows Fast Startup off.
  - Wired, and on the same subnet as the server.

## 4. Non-goals
- Turning PCs off, sleeping them, or any remote access to them.
- Reaching the app, the TVs or the PCs from outside the home network.
- TV input switching (HDMI 1/2), text entry, voice, a touchpad, or casting media.
- HDMI-CEC hardware for TVs without a network API.
- Auto-discovering PCs.

## 5. Anti-goals
- **A guest waking a PC.** The server refuses PC grants for guests (both `setGrants` and `setDeviceGrants`), and guests never see PCs, the same rules as cameras.
- **Pairing secrets stored in plain text** or sent to the web client.
- **A TV that's off or unreachable making the app hang:** every remote command times out quickly and reports an error. Neither the tile nor the page blocks.
- **Broadcasting magic packets for anything other than a PC or TV the caller may control.**

## 6. Decided how
- **One driver per protocol** in `apps/server/src/devices/drivers/` with a `*-link.ts` per protocol, following the existing driver pattern. Protocol code (pairing, framing, message encoding) goes in `packages/protocols`, as for Tuya/Kasa/Govee.
- **Data model:**
  - New `DeviceKind` values: `TV` and `COMPUTER`.
  - New `Brand` values: one per TV protocol (e.g. `ANDROID_TV`, `SAMSUNG`, `HISENSE`) and one for manually added PCs (e.g. `WOL`).
- **State:** a TV's power fits the existing `DeviceState.on`. Remote buttons and app launches are commands, not state: a separate mutation (e.g. `sendTvKey(deviceId, key)` / `launchTvApp(deviceId, app)`), guarded like `setDeviceState`.
- **Wake-on-LAN** is one shared module used by both the PC driver and the Samsung (and possibly Hisense) power-on.
- **Device access:** the guest camera rule becomes "guests get no cameras and no computers", in the same places (`visibleDevices`, `setGrants`, `setDeviceGrants`, the web grants editor and access checklist).
- **Routines:** `canUseInRoutine` is extended:
  - a TV takes on/off;
  - a COMPUTER takes "on" only, and saving "off" for a PC is refused with a clear message.

## 7. Builder's calls (marked as mine, not the user's)
- **Brand/kind names**, and whether a PC is a `Brand` or a "manual" brand with a kind.
- **App launch in routines** (e.g. "movie night: TV on, open Netflix"). It wasn't asked for, so leave it out unless it's nearly free; on/off steps are enough for this round.
- **App shortcut list:** fixed (YouTube, Netflix, Prime Video, Disney+, Spotify), shown only where the TV's driver can launch it. Each protocol launches apps differently (Android: intent/deep link; Samsung: app ID; Hisense: app name), so each driver owns its own app table.
- **TV status polling:** reachability every few seconds, plus power state where the protocol reports it. Android TV Remote pushes power changes over its open connection.
- **Hisense pairing** may need the client certificate the community reverse-engineered. If it can't be made to pair on this firmware, ship the other two drivers and record what was learned in `NICE-TO-HAVES.md`. The rest of this design does not depend on the Hisense.
- **Pairing flow UI:** an admin-only dialog on the TV's admin row or device page. Start pairing, then a code field (Android/Hisense) or "Accept on the TV" with a wait spinner (Samsung).
- **Volume:** buttons only (up/down/mute). No slider, because not every protocol reports the current volume.
- **Remote layout on phones:** the same remote, sized for a thumb.
- **Where the magic packet goes:** the server sends it to `255.255.255.255` and to the directed broadcast of every IPv4 interface of the server (e.g. `192.168.0.255`), each on port 9. This works whether or not the server PC also has VPN, Hyper-V or WSL adapters. There's no per-PC broadcast setting.
- **TVs that can't wake from standby:** each TV carries a "can power on" capability, set by its driver:
  - Android TV: yes.
  - Samsung and Hisense: yes when a MAC is known and Wake-on-LAN is used.
  - If a wake attempt fails, the tile shows the TV as off with an error toast, like any unreachable device.
  - Routine "TV on" steps are not refused at save time; a failure shows in the run's problem list like any unreachable device.
- **Pairing lifecycle:**
  - Pairing is its own short flow, not the existing "credentials" status: start pairing, then submit the code or wait for Allow, then done, or cancel.
  - A pending pairing (e.g. the Android TV TLS session waiting for its code) lives in memory on the server and is dropped after 2 minutes, like device trials.
  - The device status gains a "needs pairing" value.
  - Secrets go in `Device.secret`, encrypted via `secrets.ts`, as for Tuya local keys.
- **PC status:**
  - **Wake is always enabled**, whatever the status says.
  - Status probes TCP 445, 3389 and 22. If none answers, the tile shows *Offline*. That's fine: *Online* only means "certainly awake".
  - No ICMP ping (Node can't do it without privileges).
- **TV connections:** persistent per TV, with the existing reconnector/backoff (as the Govee/Kasa links do). A TV in deep standby just shows as off or offline while reconnects back off.
- **Adding by IP or by hand:** a new admin flow. Only Kasa has one today (`addKasaByIp`). "Add PC" (name, room, MAC, optional IP) and "Add TV by IP" (the server probes the IP to identify which TV protocol it speaks) are new mutations and dialogs in Admin > Devices.
- **Second Samsung:** same driver. If a Samsung doesn't answer `/api/v2/` (a pre-2016 model), it isn't offered for adoption, and the admin "Add TV by IP" says the model isn't supported.

## 8. Left to the builder
- Exact GraphQL names, migration details, component split (follow the repo's small-components convention), icons and copy.
- Which npm libraries to use as references, or whether to depend on one. Prefer implementing protocols in `packages/protocols` with tests against recorded frames, as for the existing brands.
- Test coverage, following existing driver and routine test patterns.

## 9. Things to check by hand once built
- Each TV turns on from standby from the app (the Xiaomi might drop off the network in deep standby; the Samsung is on Wi-Fi).
- The second Samsung's model and protocol.
- A PC wakes from shutdown and from sleep with Fast Startup off.
