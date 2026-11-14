# Android app (WebView wrapper) — Design

*Date: 2026-11-13 · Status: approved · Builds on: the web app (`apps/web`), the server's static hosting (`apps/server/src/http.ts`), sign-in and sessions (`apps/server/src/auth/sessions.ts`, `apps/web/src/auth/session.ts`), CI (`.github/workflows/ci.yml`), the deploy helper (`apps/deployer`), `scripts/firewall.ps1`. Replaces the "Installable app (PWA) on Android" item in `docs/NICE-TO-HAVES.md`.*

## 1. Intent

Today, opening Home on a phone means opening the browser and looking up the address. The owner wants **one tap from an icon** on each household phone and on the (shared, general-purpose) tablet.

A PWA would do this, but Chrome only installs PWAs over HTTPS and the server is plain `http://<lan-ip>:4000`. HTTPS (own domain or own certificate authority) was discussed; both mean setup per device or a paid domain. A small native Android app that shows the existing website in a full-screen WebView avoids HTTPS entirely, so that's the route.

The app is a **frame around the website**. All features stay in the web app and keep arriving through the normal deploy. The APK should rarely change.

## 2. Decisions made by the owner

- **An Android app wrapping the website in a WebView**, not a PWA, not HTTPS (for now).
- **Installed on the phones and the tablet.** The tablet is a normal tablet: no kiosk mode, no start-on-boot, no keep-screen-on.
- **A settings side in the app** with the server address.
- **Automatic server discovery via mDNS** (the server announces itself; the app listens). No network scan. The manual address field stays as the fallback.
- **Auto-login = the existing 90-day sliding session**, kept by the WebView's storage. The app does **not** store names or PINs. *(Proposed by Claude, not objected to.)*

## 3. Goals

### The app
- Own icon and name **"Home"**, opens straight into the website, full screen (no address bar). Icon from `apps/web/public/android-chrome-512x512.png` (or `icons.svg`) on the night palette (`#0c1120`).
- The WebView behaves like the browser does today:
  - JavaScript and DOM storage on (the session token lives in `localStorage` under `home.token`), and storage persists across app restarts.
  - Plain-HTTP (cleartext) loads allowed, for any address (the address is user-configurable, so no fixed domain list).
  - Camera views work: go2rtc WebRTC/MSE streams play without a tap (`mediaPlaybackRequiresUserGesture = false`). **The builder must verify camera playback on a real device early** — if WebRTC doesn't work in the WebView over HTTP, stop and report.
  - File pickers work (avatar upload uses `<input type="file">`; the WebView needs `onShowFileChooser`).
  - Links to another host open in the phone's browser, not inside the app.
  - Android **Back** goes back in the site's history; at the start of history it leaves the app.
  - Rotation and keyboard don't reload the page.
- The app appends `HomeApp/<versionName>` to the WebView's user agent, so the web app can tell it's inside the app (see §3, "Getting the app").

### Finding the server
- **On launch:** if an address is saved, check it (`GET /api/identity`, short timeout ~2 s). If it answers as a Home server, load it.
- **Otherwise** (nothing saved, or the saved address doesn't answer): search with mDNS for ~5 s.
  - **One server found:** save its address and load it, no prompt.
  - **Several found:** list them by home name and address; tapping one saves and loads it. *(Shouldn't happen at home; cheap to handle.)*
  - **None found:** show the **"Can't reach Home"** screen (below).
- The saved address is **never erased automatically** — a failed check or search only means "not reachable right now" (e.g. the phone is away from home).
- If the saved address works but mDNS later reports the server at a different address, nothing happens until the saved one stops answering. *(Claude's call: keeps behavior predictable.)*

### "Can't reach Home" screen (native)
- Says plainly that Home couldn't be reached and that the phone needs to be on the home Wi-Fi.
- Buttons: **Retry** (check the saved address again, then search), **Settings**.
- Also shown if the server stops answering while the site is open (the WebView's main-frame load fails). A failure of a single request inside the page is left to the web app, which already shows its own "Cannot reach the server" messages.

### Settings screen (native)
- **Server address** field, prefilled with the saved address (or empty), e.g. `192.168.0.100:4000`. Accepts `host`, `host:port` or a full `http://…` URL; port defaults to `4000`.
- **Test** button: calls `/api/identity` and shows "Found <home name>" or the error.
- **Search** button: runs mDNS discovery and lists results to pick from.
- **Save** reloads the site at the new address.
- App version shown at the bottom.
- **How to open it:** from the "Can't reach Home" screen, and from a long-press shortcut on the app icon ("Server settings", a static Android app shortcut). *(Claude's call: the website fills the screen, and there's no native chrome to put a button in.)*

### Server side
- **`GET /api/identity`**, no auth: `{ "app": "home-control", "name": "<home name>", "androidApp": { "versionCode": <n> } | null }`. `androidApp` is `null` when the server has no APK to offer. Used by the app to confirm an address really is Home, and to check for updates.
- **mDNS announcement:** the server advertises a DNS-SD service `_home-control._tcp` on its port, bound to `LAN_ADDRESS` if set, with the home name as the instance name. Library is the builder's choice (pure JS preferred, e.g. `bonjour-service`). The builder must check it coexists with Windows' own mDNS responder on UDP 5353 on the server PC. If it can't, stop and report this one piece; the rest (manual address, settings, everything else) still ships, since it doesn't depend on discovery. *(Claude's call.)*
- **`scripts/firewall.ps1`:** add an inbound rule for **UDP 5353** (mDNS), Private profile, like the existing rules.
- **Serving the APK:** `GET /app/home.apk` (no auth; it's on the LAN and contains no secrets) when the server has one.

### Getting the app onto a phone, and updates
- **Download link in the web app:** when the web app runs in an Android browser (not in the app, i.e. no `HomeApp/` in the user agent) and the server offers an APK, show a "Get the Android app" link — on the login screen and in the profile dialog. It downloads `/app/home.apk`. *(Claude's call on placement.)*
- First install needs "Install unknown apps" allowed for the browser once; `docs/RUNNING.md` gets a short "Install the Android app" section with the steps.
- **Update check:** on launch, the app compares its own `versionCode` with `androidApp.versionCode` from `/api/identity`. If the server's is newer, it shows a small native, dismissible "Update available" bar; tapping it downloads `/app/home.apk` and hands it to the Android installer. No auto-install. *(Claude's call.)*

### Building and shipping the APK
- **New `apps/android`**: Kotlin, Gradle, single-activity app (plus the settings and "Can't reach Home" screens). Not part of the pnpm workspace. minSdk 26 (Android 8) *(Claude's call; lower it if a household device is older)*.
- **CI:** a separate job (or workflow) builds the release APK and runs the app's unit tests and lint **only when `apps/android/**` changes**. The existing Node test job is unchanged.
- **The Android build must never hold up a web/server deploy.** The deploy helper currently waits for every Actions run on a commit (`checkState` in `apps/deployer/src/github.ts`); change it to wait only for the existing `CI` workflow, and put the Android build in its own workflow. Until the signing secrets exist, the Android workflow still builds and tests but skips signing and publishing, and stays green. *(Claude's call.)*
- **Signing:** every APK must be signed with the **same release key**, or updates won't install over the old version. The key lives in GitHub Actions secrets (keystore base64 + passwords). Generating the keystore and adding the secrets is a one-time owner step; the builder writes the exact commands in `docs/RUNNING.md`.
- **Versioning:** `versionCode` increases with every published build (e.g. from the CI run number).
- **Publishing:** when `apps/android/**` changes on `main` and the build is green, CI publishes the APK as a **GitHub Release asset** (tag e.g. `android-v<versionCode>`). Release assets don't expire, unlike Actions artifacts.
- **Getting it to the server:** the deploy helper, during its normal polling, checks for the latest `android-v*` release using the GitHub token it already has, and downloads the APK when its `versionCode` is newer than the one it holds. It stores it outside the release folders (so deploys and rollbacks don't touch it) and the server serves that file. A failed download is logged and retried on a later poll; it never blocks or fails a deploy. *(Claude's call: keeps the Android build off the server PC, which would otherwise need a JDK and the Android SDK.)*

## 4. Non-goals

- HTTPS, own domain or own certificate authority.
- Kiosk mode, start-on-boot, keep-screen-on for the tablet.
- Storing names or PINs in the app; any app-side login.
- Spotify sign-in handling (comes with the Spotify card later; the app could then catch the loopback redirect).
- Push notifications, offline caching, access from outside the home network.
- iOS, the Play Store.
- Re-implementing any web feature natively.

## 5. Anti-goals (would make this a failure even if it works)

- Any setup per device beyond: allow installing from the browser once, install, open.
- Needing to rebuild or reinstall the app for normal web changes.
- The app silently pointing at the wrong place, or forgetting the server, after a short outage or a trip away from home.
- Changing anything about the browser experience for people who don't install the app (other than the download link on Android).
- An APK update that won't install over the old one (different signing key).

## 6. Constraints

- The backend stays a native Windows process on the LAN (see the auto-deploy design). The server PC pulls; nothing pushes to it.
- Small files and components with one job each (owner's standing preference), on the Kotlin side too: separate discovery, address storage, identity check, update check, and each screen.
- Work happens on `main`'s working tree, not in git worktrees (owner's preference).
- One-time manual steps on the server PC are acceptable for this rollout: re-run `install-deployer.ps1` (the helper doesn't update itself) and `firewall.ps1`. Both go in `docs/RUNNING.md`. *(Claude's call; the anti-goals are about per-device setup.)*
- The dev server on the PC competes for Tuya connections with the installed server; don't leave it running while testing on the server.

## 7. Assumptions (owner approved the design without answering these; correct if wrong)

- **Device testing:** the builder can't reach a household device directly. The first milestone is a debug APK the owner installs to confirm camera playback (and basic navigation/sign-in) before the rest is built out. Server, CI and deployer work can proceed in parallel while waiting.
- **Android versions:** all household devices are Android 8 (API 26) or newer, with an up-to-date Android System WebView. If camera playback fails on a device, report it rather than building a fallback.
- **Server IP:** usually stays `192.168.0.100`. If it changes and mDNS finds the new address, signing in again once is accepted (the session token is tied to the exact origin). Addresses are normalised (`http://<ip>:<port>`, no trailing slash) so the same server never looks like two origins.

## 8. Left to the builder

- Library for mDNS on the server; Android's built-in `NsdManager` for discovery is expected.
- Exact Gradle/AGP/Kotlin versions, project layout under `apps/android`, how the CI job is split.
- Exact UI of the native screens (keep to the night palette and the app's tone).
- Where the deploy helper stores the APK and how the server learns its path (env var or fixed path under the install root).
- Tests: unit tests for address parsing, the launch decision (saved → check → search → result), and the update check; server tests for `/api/identity`, the APK route and the mDNS announcement (mocked); deployer tests for the release check/download.
