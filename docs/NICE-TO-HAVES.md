# Nice to haves

Ideas parked for later, with what we learned when we looked at them.

## Spotify "now playing" card

**Idea:** a dashboard card showing what's playing on Spotify, with play/pause/skip/volume and a picker to move playback to another speaker. Each household member links their own account.

**Feasibility (checked 2026-11-09):**

- The Web API supports all of it: playback state, the list of Spotify Connect devices, transferring playback, and transport controls.
- **Premium:** the controls need each listening user to have Premium. Development-mode apps also need the app owner to have Premium (since Feb–Mar 2026).
- **Account cap:** a development-mode app can link at most **5 accounts**. Each account must be allowlisted by email in the Spotify developer dashboard. Extended quota isn't available for personal projects.
- **Device list:** only awake Connect devices appear. A phone with Spotify closed, or a sleeping speaker, drops off the list.
- **No push from Spotify:** the server would poll each linked account every few seconds and push changes to the web over the existing GraphQL subscriptions.

**Open problems:**

- **Linking:** Spotify only redirects to `https` addresses or loopback (`127.0.0.1`), and the app is served over plain `http://<lan-ip>:4000`. There are two ways to handle it:
  - A copy-paste flow: redirect to loopback, then the user pastes the resulting URL back into the app.
  - Serve the app over HTTPS.
- **Placement:** dashboard layout items are keyed by `deviceId`, so a movable/resizable card means generalizing `LayoutItem` and the layout types. The cheaper option is a strip above the grid, like `RoutineRow`.

**Fits existing patterns:**

- Store per-user refresh tokens encrypted, as `secrets.ts` already does. Prefer a per-user table with cascade delete over `Setting` rows.
- Run the polling loop the same way as `TuyaSyncSchedule`.

## Smart TV control and Wake-on-LAN

Done: see `docs/superpowers/specs/2026-11-09-tvs-and-wake-on-lan-design.md` and `docs/WAKE-ON-LAN.md`. Hisense VIDAA is parked (below).

## Devices paired to Alexa

**Idea:** control devices that are paired directly to the Echos and aren't on the IP network.

**Feasibility depends on how each device is connected.** Check each one's settings in the Alexa app:

- **Matter (best fit):** use Matter multi-admin ("share with another app" in the Alexa app). The server becomes a second controller via `matter.js` (Node/TypeScript), and Alexa keeps working. Wi-Fi Matter devices work over the LAN. Thread devices need a border router the server can use; Echo border routers aren't reliably usable from outside Alexa, so plan on a USB Thread radio running OpenThread Border Router.
- **Zigbee** (paired to an Echo 4th gen, Show 10 or Plus): the Echo hub has no API. Re-pair the devices to a USB coordinator (e.g. Sonoff ZBDongle-E) driven by zigbee2mqtt or `zigbee-herdsman`. They then leave Alexa unless the server re-exposes them, e.g. as a Matter bridge.
- **Bluetooth or cloud-only:** the only route is the unofficial Alexa web API (`alexa-remote2`, cookie-based). It's fragile and cloud-dependent, which goes against the LAN-only design. Skip.

**Open problems:** we don't yet know which devices are Matter and which are Zigbee. Do that check before choosing a direction.

## Hisense VIDAA TV ("TV del dormitorio", 55U6SV, 192.168.0.208)

**Idea:** control the Hisense like the Android and Samsung TVs (remote keys, apps, pairing by a 4-digit code).

**What was tried (2026-11-09 spike):**

- The TV's remote broker answers MQTT over TLS on port 36669. Its certificate is self-signed (subject `127.0.0.1`, issuer `RemoteCA`) and it negotiates TLSv1.3.
- Connecting with the documented static credentials (`hisenseservice` / `multimqttservice`) and no client certificate fails during the handshake: `ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED` (TLS alert 116). This firmware requires mutual TLS.
- The client certificate and key the TV accepts belong to Hisense. They are built into the official VIDAA mobile app. Community projects extract them from the app's keystore and say they don't redistribute them (see `warrenrees/myhisense-tv`).

**Why it stopped:** shipping or downloading Hisense's extracted private key isn't something to put in this repo.

**Way forward, if wanted:**

- Let an admin supply their own extracted certificate and key: a settings field, stored encrypted like other secrets.
- Then implement the plan's Task 8 against it:
  - static or MAC-derived credentials;
  - pairing via `gettvstate` → `authenticationcode` (`{"result":1}`);
  - keys on `/remoteapp/tv/remote_service/<clientId>$normal/actions/sendkey`;
  - apps via `launchapp`.
- Add `mqtt` to `@home/protocols` then.
- **Alternative:** some Hisense models also run Android TV or Google TV. This one runs VIDAA, so that doesn't apply here.
