# Android App (WebView wrapper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Home" Android app that opens the existing website full screen, finds the server by mDNS, and updates itself from an APK the server offers.

**Architecture:** The server gains `/api/identity`, `/app/home.apk` and an mDNS announcement. The deploy helper waits only for the `CI` workflow and copies the newest `android-v*` GitHub Release APK into `<root>\shared\android`, which the server serves. A new Kotlin app in `apps/android` (not in the pnpm workspace) wraps the site in a WebView, with native Settings / "Can't reach Home" / server-picker screens. A separate GitHub workflow builds, signs and publishes the APK. The web app shows a "Get the Android app" link on Android browsers.

**Tech Stack:** Node 22 / TypeScript / Express 5 / vitest (server, deployer); `bonjour-service` (mDNS); Kotlin, Gradle (Kotlin DSL), AndroidX, kotlinx-coroutines, JUnit 4 (app); React + MUI + RTL (web); GitHub Actions + `gh` (CI); PowerShell (scripts).

**Spec:** `docs/superpowers/specs/2026-11-13-android-app-design.md`

## Global Constraints

- App name **"Home"**; package `home.control.app` (Claude's call); **minSdk 26**; night palette background `#0c1120`.
- User agent suffix: **`HomeApp/<versionName>`** (the web app keys on `HomeApp/`).
- mDNS service type **`_home-control._tcp`**, instance name = home name, port = server port.
- `GET /api/identity` → `{ "app": "home-control", "name": string, "androidApp": { "versionCode": number } | null }`, no auth.
- `GET /app/home.apk`, no auth; 404 (never `index.html`) when there's no APK.
- Saved-address check timeout **~2 s**; mDNS search **~5 s**; default port **4000**.
- Addresses normalised to `http://<host>:<port>` (lowercase host, no trailing slash) — the session token lives in `localStorage` per origin.
- The saved address is **never erased automatically**.
- The app never stores names or PINs.
- Release tags `android-v<versionCode>`, asset name **`home.apk`**; `versionCode` = CI run number.
- The deploy helper waits only for the workflow named **`CI`**; APK sync failures never block or fail a deploy.
- Small files, one job each (owner preference), Kotlin included. Work on `main`, no worktrees.
- Don't leave `pnpm dev` running against the installed server (it steals Tuya connections).

## Review Focus

- **Address typed several ways** (`192.168.0.100`, `http://192.168.0.100:4000/`, ` 192.168.0.100:4000 `, `HOME.local`) must normalise to one origin, or users get signed out → `ServerAddressTest` (Task 6).
- **Phone away from home** (saved address down, nothing on mDNS): show "Can't reach Home" and keep the saved address → `LaunchFlowTest` (Task 8).
- **Half-written APK on the server** (helper stopped mid-download): the server must never advertise a `versionCode` it can't serve, nor serve a truncated file → `apk-store.test.ts` (Task 1), `android-apk.test.ts` (Task 4).
- **GitHub unreachable / no `android-v*` release / release without `home.apk`**: the helper logs and carries on; deploy polling unaffected → `android-apk.test.ts`, `deployer.test.ts` (Task 4).
- **Server without any APK** (fresh install, before the first Android release): `androidApp: null`, `/app/home.apk` 404 not the SPA, no download link in the web app → `api-android.test.ts` (Task 1), `GetAndroidAppLink.test.tsx` (Task 11).

---

### Task 1: Server — APK store, `/api/identity`, `/app/home.apk`

**Files:**
- Create: `apps/server/src/android/apk-store.ts`, `apps/server/src/android/routes.ts`
- Modify: `apps/server/src/config.ts` (add `androidApkDir?: string` from `ANDROID_APK_DIR`), `apps/server/src/server.ts` (`ServerOptions.androidApkDir`, mount routes), `apps/server/src/main.ts` (pass it), `apps/server/test/api-harness.ts` (`HarnessOptions.androidApkDir`), `scripts/apply-service-settings.ps1`
- Test: `apps/server/test/apk-store.test.ts`, `apps/server/test/api-android.test.ts`, `apps/server/test/config.test.ts` (if it exists; else in the new test)

**Interfaces:**
- Produces: `readApkInfo(dir: string | undefined): ApkInfo | null` where `ApkInfo = { versionCode: number; apkPath: string }`. On-disk layout (also used by Task 4): `<dir>\home.apk` + `<dir>\home.json` = `{ "versionCode": number }`. Returns `null` unless **both** exist and `versionCode` is a positive integer.
- Produces: `identityRouter(deps: { prisma, apkDir?: string }): RequestHandler` mounted at `/api/identity`; `apkRouter(apkDir?: string): RequestHandler` mounted at `/app/home.apk` (Content-Type `application/vnd.android.package-archive`, `Cache-Control: no-store`).

- [ ] **Step 1: Write failing tests.** `apk-store.test.ts` (temp dir): `null` for undefined dir, missing dir, json without apk, apk without json, `versionCode` 0 / "3" / malformed JSON; `{versionCode: 7, apkPath}` when both are valid. `api-android.test.ts` (ApiHarness): no `androidApkDir` → `/api/identity` is `{app:"home-control", name:"Home", androidApp:null}` and `/app/home.apk` is 404 **with `webDist` set** (body not `index.html`); with a valid dir → `androidApp: {versionCode: 7}`, `/app/home.apk` returns the bytes with the APK content type; after setting the home name the identity `name` follows it; no auth header needed.
- [ ] **Step 2: Run** `pnpm --filter @home/server exec vitest run test/apk-store.test.ts test/api-android.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the store and routes (read `readApkInfo` per request — files change under a running server; name via `getHomeName`). Add `ANDROID_APK_DIR` to config; thread through `ServerOptions` into `createHttpApp`'s `api` map.
- [ ] **Step 4: `apply-service-settings.ps1`:** add `"ANDROID_APK_DIR=$(Join-Path $Root 'shared\android')"` to `$environment`; create that folder and grant LocalService read & execute with `Invoke-IcaclsTolerant` (add a `Grant-ReadAccess([string]$Path, [switch]$DryRun)` in `scripts/lib/acl.ps1` next to `Grant-LogsAccess`). Check with `.\scripts\apply-service-settings.ps1 -Service x -Root C:\tmp\r -Node node -DryRun`.
- [ ] **Step 5: Run** `pnpm --filter @home/server test` — Expected: all PASS.
- [ ] **Step 6: Commit** `feat(server): /api/identity and /app/home.apk from the shared android folder`

### Task 2: Server — mDNS announcement and firewall rule

**Files:**
- Create: `apps/server/src/discovery/announce.ts`
- Modify: `apps/server/package.json` (add `bonjour-service`), `apps/server/src/main.ts` (start after `startServer`, stop first in `onShutdownSignal`), `scripts/firewall.ps1`
- Test: `apps/server/test/announce.test.ts`

**Interfaces:**
- Produces: `startAnnouncement(opts: { port: number; name: string; host?: string; log: Logger; create?: (host?: string) => BonjourLike }): { stop(): Promise<void> }`. `BonjourLike` is the minimal slice of `bonjour-service` used (`publish({ name, type: "home-control", protocol: "tcp", port })`, `unpublishAll(cb)`, `destroy()`). `host` = `config.lanAddress` (bind interface).

- [ ] **Step 1: Write failing tests** with a fake `create`: publishes once with `{ name: "Casa", type: "home-control", protocol: "tcp", port: 4000 }`; passes `lanAddress` to `create`; `stop()` unpublishes then destroys; a throwing `create`/`publish` logs a warning and returns a no-op `stop` (the server must still start).
- [ ] **Step 2: Run** `pnpm --filter @home/server exec vitest run test/announce.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; in `main.ts` call it with `await getHomeName(prisma)` (name read once at start — Claude's call).
- [ ] **Step 4: `firewall.ps1`:** add `@{ Name = 'Home Control mDNS (UDP 5353)'; Protocol = 'UDP'; Ports = @(5353) }`. Check with `-DryRun`.
- [ ] **Step 5: Run** `pnpm --filter @home/server test` — Expected: PASS. Then on this PC: `pnpm --filter @home/server dev` briefly (stop it right after; Tuya), and from another shell `dns-sd -B _home-control._tcp` (or an mDNS browser app on a phone) — Expected: the service appears. **If it can't coexist with Windows' mDNS on 5353, stop here and report** (spec §3); Tasks 3–11 don't depend on it.
- [ ] **Step 6: Commit** `feat(server): announce the server over mDNS (_home-control._tcp)`

### Task 3: Deployer — wait only for the `CI` workflow

**Files:**
- Modify: `apps/deployer/src/github.ts` (`checkState`), `apps/deployer/src/config.ts` (`ciWorkflowName: string`, default `'CI'`), `apps/deployer/src/main.ts` (pass it to `GitHub`)
- Test: `apps/deployer/test/github.test.ts`

**Interfaces:**
- Produces: `new GitHub(repo, token, fetchImpl?, ciWorkflowName = 'CI')`; `checkState` considers only runs whose `name === ciWorkflowName`.

- [ ] **Step 1: Failing test** in `describe('GitHub.checkState')`: runs `[{name:'CI', completed success}, {name:'Android', in_progress}]` → `'success'`; `[{name:'CI', success}, {name:'Android', failure}]` → `'success'`; only `{name:'Android', success}` → `'none'`. Update the `runs()` helper to carry `name` (default `'CI'`) so existing cases keep passing.
- [ ] **Step 2: Run** `pnpm --filter @home/deployer exec vitest run test/github.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the filter.
- [ ] **Step 4: Run** `pnpm --filter @home/deployer test` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(deployer): wait only for the CI workflow, not the Android build`

### Task 4: Deployer — copy the newest Android release APK into `shared\android`

**Files:**
- Create: `apps/deployer/src/android-apk.ts`
- Modify: `apps/deployer/src/github.ts` (two methods), `apps/deployer/src/config.ts` (`Paths.android = <shared>\android`), `apps/deployer/src/poll.ts` (`CommitSource` gains the two methods), `apps/deployer/src/deployer.ts` (call after `checkHelper` in `poll()`), `apps/deployer/test/fakes.ts`
- Test: `apps/deployer/test/android-apk.test.ts`, `apps/deployer/test/github.test.ts`, `apps/deployer/test/deployer.test.ts`

**Interfaces:**
- Consumes: the on-disk layout from Task 1 (`home.apk` + `home.json`).
- Produces: `GitHub.latestAndroidRelease(): Promise<{ versionCode: number; assetId: number } | undefined>` — `GET /releases?per_page=30`, picks the highest `versionCode` among tags matching `^android-v(\d+)$` that have an asset named `home.apk`. `GitHub.downloadAsset(assetId: number): Promise<Buffer>` — `GET /releases/assets/{id}` with `Accept: application/octet-stream` (follows the redirect; the token must not be sent to the redirected host — use `redirect: 'manual'` and fetch the `Location` without `Authorization`).
- Produces: `syncAndroidApk(opts: { dir: string; github: Pick<GitHub,'latestAndroidRelease'|'downloadAsset'>; log: (msg: string) => void }): Promise<void>`.

- [ ] **Step 1: Failing tests** for `syncAndroidApk` (temp dir, fake github): downloads when there's no `home.json`; skips when the held `versionCode` ≥ release's; replaces when newer, leaving exactly `home.apk` + `home.json` (no temp files); a download that throws leaves the previous pair untouched and logs; `latestAndroidRelease` returning `undefined` does nothing. Write order: apk to `home.apk.tmp` → rename over `home.apk` → write `home.json` (via tmp + rename). GitHub tests: tag/asset selection (ignores `v1.2`, `android-vx`, releases without `home.apk`; picks 12 over 9); `downloadAsset` sends `Accept: application/octet-stream` and no `Authorization` on the redirected request. Deployer test: a `latestAndroidRelease` that rejects doesn't change `lastCheck.error` or stop a deploy pick.
- [ ] **Step 2: Run** `pnpm --filter @home/deployer exec vitest run test/android-apk.test.ts test/github.test.ts test/deployer.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; in `Deployer.poll()` call `syncAndroidApk` inside its own try/catch (console.error), after `checkHelper`, before `findPick`. Create the dir if missing.
- [ ] **Step 4: Run** `pnpm --filter @home/deployer test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(deployer): fetch the newest Android APK release for the server to offer`

### Task 5: Android — project and WebView shell (milestone: debug APK for the owner)

**Files (all under `apps/android/`):**
- Create: `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`, `gradle/libs.versions.toml`, Gradle wrapper (`gradlew`, `gradlew.bat`, `gradle/wrapper/*`), `.gitignore`, `app/build.gradle.kts`, `app/src/main/AndroidManifest.xml`, `app/src/main/res/xml/network_security_config.xml` (`<base-config cleartextTrafficPermitted="true">`), `app/src/main/res/values/{strings,colors,themes}.xml`, launcher icons (from `apps/web/public/android-chrome-512x512.png`, background `#0c1120`), `app/src/main/java/home/control/app/MainActivity.kt`, `.../web/WebViewSetup.kt`, `.../web/HomeWebViewClient.kt`, `.../web/HomeChromeClient.kt`
- Modify: root `.gitignore` if needed

**Interfaces:**
- Produces: `configureWebView(webView: WebView, versionName: String)` (JS + DOM storage on, `mediaPlaybackRequiresUserGesture = false`, UA + ` HomeApp/<versionName>`); `HomeWebViewClient(serverOrigin: () -> String, onMainFrameError: () -> Unit)` — other hosts open in the browser via `ACTION_VIEW`, main-frame load errors call `onMainFrameError`; `HomeChromeClient(activity)` implements `onShowFileChooser` with an `ActivityResultLauncher`. `MainActivity` loads a fixed `http://192.168.0.100:4000` for now (replaced in Task 8), handles Back via `OnBackPressedDispatcher` (`canGoBack()` → `goBack()`, else finish), `configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout"`.
- `app/build.gradle.kts`: `applicationId = "home.control.app"`, `minSdk = 26`, `versionCode = (System.getenv("HOME_VERSION_CODE") ?: "1").toInt()`, `versionName = "1.$versionCode"`; release `signingConfig` only when `HOME_KEYSTORE_FILE` is set (env: `HOME_KEYSTORE_FILE`, `HOME_KEYSTORE_PASSWORD`, `HOME_KEY_ALIAS`, `HOME_KEY_PASSWORD`).

- [ ] **Step 1:** Scaffold; `cd apps/android && ./gradlew assembleDebug lint` — Expected: BUILD SUCCESSFUL.
- [ ] **Step 2:** Smoke test on the local emulator (`emulator -list-avds`; install with `adb install -r app/build/outputs/apk/debug/app-debug.apk`) against the installed server: sign in, Back behaviour, rotate (no reload), open a camera, avatar upload picker opens, an external link opens the browser.
- [ ] **Step 3: Commit** `feat(android): Home app shell wrapping the website in a WebView`
- [ ] **Step 4: Owner checkpoint.** Give the owner the debug APK path and ask them to install it on a phone and the tablet and confirm: sign in sticks after closing the app, **camera views play**, Back works. Continue with Tasks 6–7 and 10 while waiting; **if cameras don't play, stop and report** (spec §3).

### Task 6: Android — server address parsing and storage

**Files:**
- Create: `app/src/main/java/home/control/app/server/ServerAddress.kt`, `.../server/AddressStore.kt`
- Test: `app/src/test/java/home/control/app/server/ServerAddressTest.kt`

**Interfaces:**
- Produces: `@JvmInline value class ServerAddress(val origin: String)` with `companion fun parse(input: String): ServerAddress?` and `fun url(path: String): String`. `class AddressStore(context: Context) { fun load(): ServerAddress?; fun save(a: ServerAddress) }` (SharedPreferences `"server"`, key `"origin"`; no `clear`).

- [ ] **Step 1: Failing tests:** `parse("192.168.0.100")`, `parse(" 192.168.0.100:4000 ")`, `parse("http://192.168.0.100:4000/")`, `parse("HTTP://192.168.0.100:4000")` all `== ServerAddress("http://192.168.0.100:4000")`; `parse("Home.Local:8080")` → `"http://home.local:8080"`; `null` for `""`, `"https://x"` (HTTPS out of scope), `"a b"`, `"host:0"`, `"host:70000"`, `"http://host/path"`; `url("/api/identity")` == `"http://192.168.0.100:4000/api/identity"`.
- [ ] **Step 2: Run** `./gradlew testDebugUnitTest --tests '*ServerAddressTest'` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): parse and store the server address`

### Task 7: Android — identity check and mDNS discovery

**Files:**
- Create: `.../server/Identity.kt`, `.../server/IdentityClient.kt`, `.../server/NsdDiscovery.kt`, `.../server/FoundServer.kt`
- Modify: `app/build.gradle.kts` (`testImplementation("org.json:json:<current>")`, coroutines)
- Test: `app/src/test/java/home/control/app/server/IdentityTest.kt`

**Interfaces:**
- Produces: `data class Identity(val name: String, val apkVersionCode: Int?)` with `companion fun parse(json: String): Identity?` (null unless `app == "home-control"`). `class IdentityClient { suspend fun check(address: ServerAddress, timeoutMs: Int = 2000): Identity? }` (HttpURLConnection on `Dispatchers.IO`, any failure → null). `data class FoundServer(val name: String, val address: ServerAddress)`. `class NsdDiscovery(context: Context) { suspend fun search(timeoutMs: Long = 5000): List<FoundServer> }` — `NsdManager.discoverServices("_home-control._tcp", PROTOCOL_DNS_SD, …)`, resolves each, IPv4 preferred, de-duplicated by origin, always stops discovery (also on cancellation). Hold a `WifiManager.MulticastLock` during the search (`CHANGE_WIFI_MULTICAST_STATE` permission).

- [ ] **Step 1: Failing tests** for `Identity.parse`: full payload → `Identity("Casa", 7)`; `androidApp: null` → `apkVersionCode = null`; `app: "other"`, missing `app`, non-JSON → null.
- [ ] **Step 2: Run** `./gradlew testDebugUnitTest --tests '*IdentityTest'` — Expected: FAIL.
- [ ] **Step 3: Implement** all four files. (`NsdDiscovery` and `IdentityClient` are Android/network glue, verified manually in Task 8.)
- [ ] **Step 4: Run** `./gradlew testDebugUnitTest lint` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): identity check and mDNS server search`

### Task 8: Android — launch flow and native screens

**Files:**
- Create: `.../launch/LaunchFlow.kt`, `.../launch/LaunchResult.kt`, `.../ui/UnreachableActivity.kt`, `.../ui/SettingsActivity.kt`, `.../ui/ChooseServerDialog.kt`, layouts `res/layout/activity_unreachable.xml`, `activity_settings.xml`, `res/xml/shortcuts.xml`
- Modify: `MainActivity.kt` (run the flow before loading; route `onMainFrameError` to `UnreachableActivity`), `AndroidManifest.xml` (activities, static shortcut "Server settings" → `SettingsActivity`)
- Test: `app/src/test/java/home/control/app/launch/LaunchFlowTest.kt`

**Interfaces:**
- Consumes: `ServerAddress`, `AddressStore` (as `load/save` lambdas), `IdentityClient.check`, `NsdDiscovery.search`, `FoundServer`.
- Produces: `sealed interface LaunchResult { data class Load(val address: ServerAddress, val identity: Identity) ; data class Choose(val servers: List<FoundServer>); data object Unreachable }`. `class LaunchFlow(load: () -> ServerAddress?, save: (ServerAddress) -> Unit, check: suspend (ServerAddress) -> Identity?, search: suspend () -> List<FoundServer>) { suspend fun run(): LaunchResult }`.

- [ ] **Step 1: Failing tests** (fakes): saved answers → `Load(saved)`, `search` never called, nothing saved; saved down + one found (which answers `check`) → `Load(found)` and `save(found)`; saved down + two found → `Choose` with both, nothing saved; saved down + none → `Unreachable`, `save` never called (saved address kept); nothing saved + none → `Unreachable`.
- [ ] **Step 2: Run** `./gradlew testDebugUnitTest --tests '*LaunchFlowTest'` — Expected: FAIL.
- [ ] **Step 3: Implement `LaunchFlow`** and the screens: Unreachable (text: Home couldn't be reached, be on the home Wi-Fi; **Retry** re-runs the flow, **Settings**); Settings (address field prefilled, **Test** → "Found <name>" or the error, **Search** → `ChooseServerDialog`, **Save** stores the parsed address and returns to `MainActivity`, which reloads; version at the bottom; invalid input shows an inline error); Choose dialog (name + address rows; tap saves and loads). Night palette.
- [ ] **Step 4: Run** `./gradlew testDebugUnitTest lint assembleDebug` — Expected: PASS. Emulator/phone check: first launch with no saved address finds the server (or, on the emulator where multicast may not pass, falls back to Unreachable → Settings → manual address works); long-press icon shows "Server settings"; stopping Wi-Fi mid-use shows Unreachable and Retry recovers.
- [ ] **Step 5: Commit** `feat(android): find the server on launch, settings and can't-reach screens`

### Task 9: Android — update check

**Files:**
- Create: `.../update/UpdateCheck.kt`, `.../update/ApkInstaller.kt`, `res/xml/file_paths.xml`
- Modify: `MainActivity.kt` (show a dismissible native bar above the WebView), `AndroidManifest.xml` (`REQUEST_INSTALL_PACKAGES`, `FileProvider`)
- Test: `app/src/test/java/home/control/app/update/UpdateCheckTest.kt`

**Interfaces:**
- Consumes: `LaunchResult.Load.identity.apkVersionCode`, `ServerAddress.url("/app/home.apk")`.
- Produces: `fun updateAvailable(own: Int, server: Int?): Boolean`; `class ApkInstaller(activity) { fun downloadAndInstall(url: String) }` — `DownloadManager` into the app's external files dir, then `ACTION_VIEW` with a `FileProvider` URI and `application/vnd.android.package-archive`.

- [ ] **Step 1: Failing tests:** `updateAvailable(5, 6)` true; `(6, 6)`, `(7, 6)`, `(5, null)` false.
- [ ] **Step 2: Run** `./gradlew testDebugUnitTest --tests '*UpdateCheckTest'` — Expected: FAIL.
- [ ] **Step 3: Implement**; bar text "Update available" with tap → download/install and an × to dismiss until next launch.
- [ ] **Step 4: Run** `./gradlew testDebugUnitTest lint assembleDebug` — Expected: PASS. Manual: put a `home.json` with a higher `versionCode` and the debug APK in a dev `ANDROID_APK_DIR`, launch → bar shows → installer opens.
- [ ] **Step 5: Commit** `feat(android): offer updates from the server's APK`

### Task 10: CI — Android workflow (build, test, sign, publish)

**Files:**
- Create: `.github/workflows/android.yml`

**Interfaces:**
- Produces: workflow `name: Android`; release `android-v<run_number>` with asset `home.apk` (consumed by Task 4).

- [ ] **Step 1: Write the workflow:** triggers `push` to `main` and `pull_request`, both with `paths: ['apps/android/**', '.github/workflows/android.yml']`; `ubuntu-latest`, `actions/setup-java` (temurin 17), `gradle/actions/setup-gradle`; `working-directory: apps/android`; env `HOME_VERSION_CODE: ${{ github.run_number }}`; run `./gradlew testDebugUnitTest lint assembleRelease`. Signing step only `if: github.event_name == 'push' && secrets.HOME_KEYSTORE_BASE64 != ''` (map the secret to an env var first, since `secrets` isn't allowed in `if` directly): decode to `$RUNNER_TEMP/home.jks`, set the `HOME_KEY*` env vars, build signed, copy to `home.apk`, `gh release create "android-v$HOME_VERSION_CODE" home.apk --title ... --notes "<commit sha>"` with `permissions: contents: write` and `GH_TOKEN: ${{ github.token }}`. Without the secret: build and test only, job green.
- [ ] **Step 2: Verify** with `actionlint` if available (else review against the GitHub docs), then push the branch state and check the run on GitHub: Expected green, no release (no secret yet), and the `CI` workflow and deploys unaffected (Task 3).
- [ ] **Step 3: Commit** `ci: build, sign and publish the Android app`

### Task 11: Web — "Get the Android app" link, and docs

**Files:**
- Create: `apps/web/src/android/isAndroidBrowser.ts`, `apps/web/src/android/useAndroidAppOffer.ts`, `apps/web/src/android/GetAndroidAppLink.tsx`
- Modify: `apps/web/src/auth/LoginScreen.tsx` (below the picker), `apps/web/src/profile/ProfileDialog.tsx` (bottom of the form), `docs/RUNNING.md`, `docs/NICE-TO-HAVES.md`
- Test: `apps/web/src/android/GetAndroidAppLink.test.tsx`, `apps/web/src/android/isAndroidBrowser.test.ts`

**Interfaces:**
- Produces: `isAndroidBrowser(ua: string): boolean` (`/Android/` and not `/HomeApp\//`); `useAndroidAppOffer(): boolean` (fetches `/api/identity` once when `isAndroidBrowser(navigator.userAgent)`; true iff `androidApp !== null`; fetch failure → false); `<GetAndroidAppLink />` renders a link "Get the Android app" to `/app/home.apk` (with `download`) when the offer is true, else nothing.

- [ ] **Step 1: Failing tests:** `isAndroidBrowser` for a Chrome-Android UA (true), the same + ` HomeApp/1.12` (false), desktop Chrome (false). Component (mock `fetch`, stub UA): shows the link when Android + `androidApp: {versionCode: 3}`; nothing when `androidApp: null`, when the fetch rejects, when inside the app (and `fetch` not called), on desktop.
- [ ] **Step 2: Run** `pnpm --filter @home/web exec vitest run src/android` — Expected: FAIL.
- [ ] **Step 3: Implement** and place it in both screens.
- [ ] **Step 4: Docs.** `RUNNING.md`: a section "Android app" covering (a) one-time signing key — `keytool -genkeypair -v -keystore home.jks -alias home -keyalg RSA -keysize 4096 -validity 10000`, base64 it, add secrets `HOME_KEYSTORE_BASE64`, `HOME_KEYSTORE_PASSWORD`, `HOME_KEY_ALIAS`, `HOME_KEY_PASSWORD`, keep `home.jks` backed up (losing it means reinstalling the app on every phone); (b) one-time server steps — re-run `install-deployer.ps1` and `firewall.ps1` as Administrator; (c) installing on a phone — open Home in Chrome, tap "Get the Android app", allow "Install unknown apps" for Chrome, install; (d) troubleshooting — app can't find the server → Settings → enter `192.168.0.100:4000`. `NICE-TO-HAVES.md`: replace the PWA section with "Done: see the Android app design" and keep the HTTPS notes under Spotify.
- [ ] **Step 5: Run** `pnpm test` — Expected: all PASS.
- [ ] **Step 6: Commit** `feat(web): offer the Android app on Android browsers; docs for the app`
