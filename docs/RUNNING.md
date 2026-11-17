# Running Home on the server PC

Home runs as a Windows service (`HomeControl`, via NSSM) on an always-on PC on your home LAN. Phones and the wall tablet open `http://<server-ip>:4000`.

## 1. Prepare the server PC

1. Windows with **Node 22.12 or newer** (the current Node 22 LTS) installed **system-wide** (the official MSI, into Program Files; not nvm/fnm/volta, which install per user), because the service runs as `NT AUTHORITY\LocalService` and must be able to run it. Also **pnpm** (run `corepack enable` from an elevated shell: the repo pins pnpm 9.15.9 in `package.json`, and corepack keeps it next to node in Program Files; `npm i -g pnpm` would install it into your user profile), **PostgreSQL** and **NSSM** (`choco install nssm`, from an admin shell). PostgreSQL over TCP on localhost works fine for LocalService.
2. Create the database `home`. Create `home_test` only if you will run the tests there.
3. Set the LAN adapter's network profile to **Private** (Settings > Network & internet > Wi-Fi/Ethernet > Properties). The firewall rules only apply to the Private profile.
4. Clone the repo **outside OneDrive**, for example `C:\home-control`. OneDrive sync interferes with `node_modules` and logs.
5. Find the server's LAN IPv4 with `ipconfig` (give it a DHCP reservation on the router so it never changes).

## 2. Configure `.env`

Create `.env` in the **repo root** (copy `.env.example`). The service runs with the repo root as its working directory and the app loads this file itself; `prisma migrate deploy` (`pnpm db:deploy`) also reads it. `apps/server/.env` is not needed (if present it takes precedence, which only matters for dev).

| Key | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres connection string for `home` |
| `SECRET_KEY` | 32 random bytes, base64 (see below) |
| `PORT` | `4000` |
| `LAN_ADDRESS` | The server's own LAN IPv4 from `ipconfig` |
| `BOOTSTRAP_ADMIN_PIN` | 4-8 digits. Used only on the first start, when there are no users, to create the user "Admin" |
| `TUYA_SYNC_HOURS` | Optional. Hours between background Tuya key syncs (default `6`; `0` turns them off) |
| `DATABASE_URL_TEST` | Tests only (`home_test`) |

Generate `SECRET_KEY`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Back up `SECRET_KEY`** somewhere safe (password manager). It encrypts stored Tuya keys and passwords; if it is lost they become unreadable and must be re-entered.

## 3. Install

From an elevated PowerShell in the repo root (add `-DryRun` first to preview either script):

```powershell
.\scripts\firewall.ps1          # inbound rules, Private profile, scoped to node.exe
.\scripts\install-service.ps1   # install deps, build, migrate, create/update the service, start it
Get-Service HomeControl         # Running
```

- `firewall.ps1` opens TCP 4000 and UDP 6666, 6667, 7000 (Tuya), 4002 (Govee replies) for `(Get-Command node).Source`. Re-running replaces the rules (and removes the obsolete UDP 20002 rule an earlier version created). If you upgrade Node to a different path, run it again. Kasa discovery needs no rule: it broadcasts from an ephemeral port, and Windows' default firewall behaviour allows the unicast replies to the server's own broadcast.
- **Before the first install on a machine where `node_modules` already exists** (for example after a development checkout), delete every `node_modules` folder once (from the repo root: `Remove-Item -Recurse -Force node_modules, apps\*\node_modules, packages\*\node_modules`). Existing hardlinked packages would otherwise stay hardlinked to pnpm's global store, and the ACL lock-down would change permissions on files other projects share.
- `install-service.ps1` first stops the service if it exists, then runs `pnpm install --frozen-lockfile --config.package-import-method=copy` (copies instead of pnpm's usual hardlinks: hardlinked files share one ACL with pnpm's global store, so locking down the repo would otherwise change permissions on files other projects use), `pnpm build` (protocols, server, web, and copies `schema.graphql` into `apps/server/dist`), `prisma migrate deploy`, locks down file permissions, then configures the NSSM service (running as LocalService, starting after the PostgreSQL service): `node apps/server/dist/main.js`, `NODE_ENV=production`, auto start, restart 5 s after exit, graceful stop (15 s, longer than the app's 10 s shutdown), logs in `logs\` (rotated at 5 MB; rotated files are **not** auto-pruned, so delete old ones now and then). It waits up to 20 s for the service to be Running and fails otherwise. Re-run it after every `git pull` to update.
- **Permissions:** the script restricts the repo folder to Administrators and SYSTEM (full) plus LocalService (read and execute), gives LocalService modify on `logs\`, and limits `.env` to Administrators, SYSTEM and LocalService. Anyone who could edit the repo files could otherwise run code as the service. Consequently run `git pull` from an elevated shell, and edit `.env` in an elevated editor. If `icacls` cannot update some child files (for example paths that are too long) the script prints a warning with the number of failed items and carries on; it then checks the repo root's ACL and stops if that is wrong. Enabling Windows long paths (`LongPathsEnabled=1` under `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`, then reboot) is recommended on the server. If a build, migration or the permission step fails, the script stops and says what it left behind: if the service was running before, it is now stopped; the failed step may already have replaced the build or migrated the database, so fix the problem and re-run the script (`nssm start HomeControl` starts the service as it is now); on a first install no service exists yet, so fix the problem and re-run.

Manual run without the service: `pnpm build; pnpm db:deploy; pnpm start`.

**Deploying automatically (optional):** instead of re-running `install-service.ps1` after every `git pull`, a small helper service can deploy each green commit from a private GitHub repo by itself. Once it is installed, `install-service.ps1` refuses to run until you remove it with `nssm remove HomeDeployer confirm`; see section 8 ("Deploying automatically", "Deploy without the helper").

## 4. First login

Open `http://<server-ip>:4000` and sign in as **Admin** with `BOOTSTRAP_ADMIN_PIN`. Change the PIN under **Users**.

Then remove the `BOOTSTRAP_ADMIN_PIN` line from `.env` (elevated editor). It is only read when there are no users at all, so it is not needed again, and a PIN left in a file is one more secret to protect.

**Wall tablet:** open the URL, then **Settings** on the login screen > **This is a shared screen**. It signs out after 3 minutes idle.

## 5. Connect the device brands

### Tuya (bulbs and plugs)
1. Create a cloud project at the Tuya IoT Platform (iot.tuya.com) and link your Smart Life app account to it (Devices > Link App Account).
2. Note the project's Access ID and Access Secret and the data-center region.
3. In Home: **Admin > Integrations**, enter them, then press **Sync keys from Tuya**.
- After that the server repeats the sync by itself: 2 minutes after it starts, then every 6 hours (`TUYA_SYNC_HOURS`). **Last synced** shows the latest run, manual or scheduled.
- Some Tuya devices never announce themselves on the network. The sync looks for these by trying their keys on the hosts that accept Tuya connections, and lists them under "Found on your network". Give them a DHCP reservation: until the next sync finds them again, an IP change leaves them offline.
- The free IoT Core trial must be renewed periodically on the Tuya platform. If it lapses, enter device keys manually: **Admin > Devices > the device's menu > Set Tuya local key**.
- The cloud error codes shown in the app are unverified; check them on the first sync.

### Kasa (KP303)
The KP303 appears only after your TP-Link account credentials are saved under **Admin > Integrations**. Saving runs Kasa discovery straight away (it takes a few seconds), so the device shows up without waiting for the next minute's scan. If a Kasa device on the network rejects the credentials, the page says so; the credentials are still saved, so correct them and save again.

### Govee
- Turn on **LAN Control** for each device in the Govee Home app.
- **Do not run SignalRGB or any other Govee LAN app on the server PC.** It holds UDP 4002 and steals the replies.
- The H6102 strip may not support LAN control.

### Cameras (Swann recorder and Tuya cloud cameras)
Video is relayed by go2rtc (WebRTC) using ffmpeg for thumbnails. `install-service.ps1` downloads pinned, SHA-256-verified copies into `<repo>\tools\go2rtc` and `<repo>\tools\ffmpeg` (go2rtc 1.9.15, ffmpeg 9.0.2 essentials; the files are gitignored and downloading needs internet once; re-runs skip files that are already current). `tools\` inherits the repo's LocalService read-and-execute access, so no extra permission step is needed. `firewall.ps1` adds the rule **HomeControl go2rtc WebRTC** (inbound UDP and TCP 8555, Private profile, program `tools\go2rtc\go2rtc.exe`); re-run it after the first install so the rule's program exists. go2rtc's API (1984) and RTSP server (8554, used internally by ffmpeg transcodes) listen on `127.0.0.1` only and need no firewall rule.

**Swann recorder:** in Home go to **Admin > Integrations > Swann recorder**, enter the recorder's LAN address and credentials, and save. Its cameras appear as devices to adopt and grant like any other. Credentials and RTSP addresses stay on the server.

**Tuya cloud cameras:** on iot.tuya.com open the cloud project, then **Service API** (the project's service list) and enable **IoT Video Live Stream**. Without it, cloud cameras report "Cloud stream not available for this camera". Cloud cameras are labelled "via Tuya cloud" and stop working when the internet is down.

### TVs (Android TV / Google TV, Samsung)
TVs are found on the network (SSDP) and show under **New on network**; one that isn't found can be added with **Admin > Devices > Add TV** (by IP, with the TV on). After adopting a TV, pair it once from its **⋯ > Pair** menu: Android TVs show a code on screen to type in; Samsung TVs show a prompt to accept with the TV remote. Until then the TV shows "Needs pairing". Samsung TVs turn on by Wake-on-LAN, so on the TV enable **Settings > General > Network > Expert Settings > Power On with Mobile**. Hisense VIDAA isn't supported yet (see `docs/NICE-TO-HAVES.md`).

### PCs (Wake-on-LAN)
Add each PC with **Admin > Devices > Add PC** (name, room, MAC, optional IP) and grant it to users like any device; guests can't be given PCs. Each PC needs the one-time setup in `docs/WAKE-ON-LAN.md`.

**Upgrading:** this release adds a database migration — re-run `install-service.ps1` (or `pnpm db:deploy` for a manual run) after pulling.

## 6. Acceptance checklist (from an Android phone at `http://<server-ip>:4000`)

- [ ] `Get-Service HomeControl` is Running; after a reboot it is still Running.
- [ ] `Stop-Service HomeControl` logs the graceful-shutdown line ("shutting down") in `logs\home-control.out.log` and the service stops in under 15 s. Start it again afterwards.
- [ ] `Stop-Process` the node process: the service is back within about 10 s.
- [ ] Tuya sync matches at least 14 of the ~16 LAN Tuya devices (cameras may be listed but are not controlled).
- [ ] Toggle and recolour one bulb of each Tuya protocol version present (3.1, 3.3, 3.4, 3.5); each responds within 1 s.
- [ ] Colour brightness (V) maps correctly on real Tuya bulbs (deferred item).
- [ ] A change made in the Smart Life app shows on the tile within 2 s.
- [ ] The 3 KP303 outlets toggle independently.
- [ ] Toggling a KP303 outlet shows no "Couldn't reach ..." and the tile does not flicker back to the old state.
- [ ] Multi-gang Tuya switches (2- or 3-gang): check whether every gang can be controlled. Only the first relay (DP 1) is supported today; if the other gangs cannot be controlled, record it as a known limitation: _______
- [ ] A Tuya command that times out (for example a bulb unplugged right after tapping it, then plugged back in) leaves the tile usable again within about 10 s once the device answers.
- [ ] An unplugged bulb shows Offline within 30 s, and tapping it shows "Couldn't reach ...".
- [ ] A USER with 2 granted lights, signed in on a shared screen, sees only those 2 and returns to the picker after 3 min idle.
- [ ] Govee on/off, brightness and colour work. If not, record the outcome here (Phase 1 is complete without Govee): _______

Cameras (Stage 2):
- [x] Swann recorder acceptance (Task 13, 2026-11-06, dev PC): probe found 4 channels (`/ch{NN}/0|1`, all H.264, sub streams present); 4 cameras adopted; dashboard thumbnails refresh and live view plays on PC and phone.
- [ ] Swann revocation check: a non-admin watching a granted camera loses video within ~5 s when access is removed (not yet run).
- [ ] Swann recovery check: recorder unplugged ~2 min ⇒ tiles "No recent image", page "Camera unavailable"; recovers on reconnect without restart (not yet run).
- [x] Tuya cloud camera acceptance (Task 14, 2026-11-06, dev PC): "IoT Video Live Stream" enabled; "Camara" and "Cámara Sala 2" play live via Tuya cloud. Tuya allocated URLs are short-lived/single-use, so a fresh URL is requested per producer start (rtsps played natively; HLS uses ffmpeg with Opus audio).

## 7. Troubleshooting

- **Logs:** `<repo>\logs\home-control.out.log` and `home-control.err.log`. Config problems are printed at startup (variable names only).
- **Device shows "Needs setup":** its local key or credentials are missing. Run **Sync keys from Tuya** (or save TP-Link credentials for Kasa).
- **`KEY_INVALID` after re-pairing a bulb:** re-pairing changes the key. Run **Sync keys from Tuya** again.
- **Govee silent:** check LAN Control is on for the device in the Govee app, that no other app (SignalRGB etc.) holds UDP 4002 (`netstat -ano | findstr :4002`), and that `LAN_ADDRESS` is correct.
- **A device's IP changed:** nothing to do; it is rediscovered and picked up automatically.
- **Page does not load from the phone:** confirm the network profile is Private, the firewall rules exist (`Get-NetFirewallRule -DisplayName 'Home Control*'`) and `LAN_ADDRESS` is the current IP.
- **Cameras disabled / helper missing:** the log shows `cameras disabled: go2rtc not found at ...`. Run `install-service.ps1` again (or place go2rtc at `tools\go2rtc\go2rtc.exe` and ffmpeg at `tools\ffmpeg\ffmpeg.exe`, or point `GO2RTC_PATH` / `FFMPEG_PATH` in `.env` at them) and restart the service.
- **High CPU while watching:** H.265 (HEVC) cameras are transcoded for the browser, which uses a lot of CPU. Prefer the camera's H.264 stream if it offers one, and limit how many tiles play at once.
- **"Cloud stream not available for this camera":** enable the **IoT Video Live Stream** service on the Tuya project (section 5), check the project's trial has not lapsed, and that the server has internet access.
- **Video never starts from the phone (thumbnails work):** WebRTC needs UDP/TCP 8555. Check the network profile is Private and that `Get-NetFirewallRule -DisplayName 'HomeControl go2rtc WebRTC'` shows two rules; re-run `firewall.ps1` if not.
- **Video blips for everyone for 1-2 s:** expected. Revoking a camera grant, or logging out/ending the session of someone actively watching, restarts the video helper to cut their stream, which briefly interrupts all viewers.

## 8. Deploying automatically

The Deploys page (Admin) points here ("Deploying in docs/RUNNING.md"). A second Windows service, **HomeDeployer** (runs as LocalSystem), polls a private GitHub repo every 2 minutes. It deploys the newest commit on `main` whose GitHub Actions runs are all green: it builds into `C:\HomeControl\releases\<short-sha>\`, backs up the database, applies migrations, switches the `C:\HomeControl\current` junction that the `HomeControl` service runs from, restarts it and waits up to 60 s for the app to answer. A failed commit is not retried by itself (use **Deploy now**).

Layout under `C:\HomeControl`: `repo\` (clone), `releases\`, `current\` (junction), `shared\` (`.env`, `logs\`, `tools-cache\`, `pnpm-store\`), `deployer\` (helper app, config, tokens, history, event logs, `backups\`).

### Create the private repo and push

Create an empty **private** repository on GitHub, then from the development checkout:

```powershell
git remote add origin https://github.com/<owner>/<name>.git
git push -u origin main
```

Wait for the CI run on `main` to go green; the helper only deploys green commits.

### Create the token

GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens**. Resource owner: you; **Only select repositories**: this repo only; Repository permissions: **Contents: Read**, **Actions: Read** (the helper reads CI results from the GitHub Actions runs; fine-grained tokens have no Checks permission), **Metadata: Read** (nothing else). Choose an expiry (for example 1 year) and put a reminder in your calendar. When the token expires or is revoked, GitHub rejects it: the Deploys page shows the error and deploys stop (the app itself keeps running). Create a new token, delete `C:\HomeControl\deployer\github-token`, and re-run the setup script, which asks for it again.

### Run setup

From an elevated PowerShell in a clone of the repo (add `-DryRun` first to preview; a dry run asks for nothing and changes nothing):

```powershell
.\scripts\install-deployer.ps1 -Root C:\HomeControl -GitHubRepo <owner>/<name> -From C:\home-control
Get-Service HomeDeployer, HomeControl   # both Running
```

`-From` is the existing install folder: its `.env` is copied into `shared\` if there is none yet. Its `logs\` are not copied (the old logs folder is writable by the app's account, so copying from it as an administrator isn't safe); old logs stay in the old folder. Setup asks once for the token (typed hidden), clones the repo (the token is handed to git only through environment variables of that one command, never on the command line, in the remote URL or in git config; git 2.31 or newer is required), generates `deployer\api-token`, writes `deployer\deployer.json` with the absolute paths of node, pnpm, git, nssm, `pg_dump` (found through the PostgreSQL service), powershell and tar, builds the helper into `deployer\app`, locks permissions (first `C:\HomeControl` itself: owner Administrators, no inheritance from `C:\`, so Users cannot write into releases; then `deployer\` is Administrators/SYSTEM only except `api-token`, which LocalService also reads so the app can talk to the helper; `shared\tools-cache`, `repo\` and `shared\pnpm-store` are Administrators/SYSTEM only), and installs and starts the `HomeDeployer` service. `-Root` must not contain spaces. node, pnpm and git must be system-wide installs (for example under Program Files): the helper runs them as LocalSystem on every deploy, so setup refuses a pnpm or git inside a user profile (`%APPDATA%`, `%LOCALAPPDATA%`, `C:\Users\`, links resolved; a dry run only warns). Within about 2 minutes the first tick deploys the newest green commit and repoints `HomeControl` to `current`; until then the old install keeps running. The app finds the token through `DEPLOYER_TOKEN_FILE`, which every deploy writes into the `HomeControl` service settings (it is not needed in `.env`). The old install's service doesn't have it, so **until the first deploy succeeds the Deploys page says the helper isn't running**: follow the first deploy in `C:\HomeControl\deployer\service.out.log` and the event logs in `C:\HomeControl\deployer\logs\` instead.

#### If the first deploy fails

Before the first deploy changes `HomeControl`, the helper saves the service's Application, AppParameters, AppDirectory, AppEnvironmentExtra, AppStdout and AppStderr to `C:\HomeControl\deployer\first-deploy-service.json` (an existing file is kept, since it holds the original install's settings). Keep the old install folder until a first deploy succeeds. Either way the commit is marked failed (not retried automatically) and auto-deploy stays on, so the next green commit is tried.

- **Build, install or backup fails:** nothing was stopped; the old install keeps running.
- **Stopping the app, the switch or the health check fails, and no migration was pending:** the helper puts the saved settings back with `nssm set`, removes `current`, starts the old install and checks it answers. The event log says `Restored the previous install`. If that fails too, the event says `restoring the previous install also failed`: run `nssm set HomeControl <setting> <value>` from the saved file by hand (or re-run `install-service.ps1` from the old install, after removing the helper as in "Deploy without the helper"), then `nssm start HomeControl`.
- **The migration fails:** nothing was repointed yet, so the helper just starts the old install again (`migration failed; started the previous install again`). Check the event log: a migration that partly applied may need a look before the next try.
- **The health check fails after a migration ran:** as for any deploy, the new release stays in place under NSSM (the old code may not work with the newer database) and you push a fix. Until a release comes up, the Deploys page is not reachable; use the logs above.

The saved file is deleted once any deploy succeeds, or when the helper starts and `current` exists. If the helper stops partway through a first deploy, before the switch, it starts the old install again when it comes back. If you change the old install's service by hand before then, delete the file so the next first deploy saves the new settings.

**Don't open `C:\HomeControl` in File Explorer and click Continue** at "You don't currently have permission to access this folder": Explorer then gives your account Full Control of the whole tree, and setup refuses it on the next run. Read logs from an elevated PowerShell instead. If it happened, setup's error names the account; remove it with `icacls C:\HomeControl /remove:g *<that SID> /T /C /Q` and re-run.

Setup needs a fresh `C:\HomeControl` (it does not exist yet; setup creates it already locked, then creates every folder below it itself) or one from a previous install. It never adopts anything else: if the folder exists but is not a locked install (owner Administrators or SYSTEM; exactly the expected permissions on it, on `deployer\`, `repo\`, `shared\tools-cache` and `shared\pnpm-store`, and on the token files; `shared\.env`, if present, must be a real file owned by Administrators, which is what you get when you create or replace it from an elevated prompt, and setup then re-locks it; no links in place of its folders and files; `current` only as a junction to a folder in `releases\`), it stops before changing anything with `C:\HomeControl exists but isn't a locked HomeControl install; move it aside and re-run`. Re-running setup on an install updates it (tokens, `shared\` and `releases\` are kept).

### What the page shows

**Admin > Deploys**: the running release, the history (each deploy with its log, status and the reason for a failure), whether auto-deploy is on or paused (and why), **Deploy now**, **Restart app**, **Pause/Resume**, and **Roll back** on any kept earlier release. Rolling back pauses auto-deploy (reason `rolled back to <short-sha>`); only **Resume** turns it back on. A rollback is refused when it would go past a database migration (`Can't roll back past a database change; push a fix instead.`). The last 5 successful releases and the last 10 database backups are kept. If the helper is not running, the page says so and points here.

### When the app is down

The Deploys page is part of the app, so look at the files: event logs in `C:\HomeControl\deployer\logs\`, the helper's own output in `C:\HomeControl\deployer\service.out.log` and `service.err.log`, the app's logs in `C:\HomeControl\shared\logs\` (go2rtc's pid file is in `shared\logs\run\` too, so a go2rtc left behind by a crashed run is found whichever release starts next). If `deployer\history.json` was damaged (for example by a power cut), the helper moves it aside as `history.json.corrupt-<time>`, uses `history.json.tmp` if that is intact or else starts with an empty history, and says so in `service.err.log`.

### Restore a database backup

Backups are `pg_dump` custom-format files in `C:\HomeControl\deployer\backups\`. Pause auto-deploy first (so nothing restarts the app), stop the app, restore, start it:

```powershell
nssm stop HomeControl
& "C:\Program Files\PostgreSQL\<version>\bin\pg_restore.exe" --clean --dbname "<DATABASE_URL from shared\.env>" C:\HomeControl\deployer\backups\<file>
nssm start HomeControl
```

### Update the helper

A deploy does not replace the helper itself. After changing `apps/deployer`, pull in a clone and re-run `install-deployer.ps1` with the same arguments (it is re-runnable and keeps the tokens).

The CI pipeline on the Deploys page (each commit's workflow runs, jobs and steps, and CI job logs) comes from the helper, so it appears only after the helper has been updated this way. Until then the page shows deploys grouped by commit, without CI. The helper's CI watcher uses the same GitHub token and needs no new permissions. Its settings in `deployer.json` are all optional:

| Setting | Default | What it does |
|---|---|---|
| `ciIdlePollMs` | `20000` | How often it checks for new runs while none is in progress. These checks are conditional requests, which don't count against GitHub's rate limit when nothing changed. |
| `ciActivePollMs` | `5000` | How often it checks while a run is in progress. |
| `ciKeepCommits` | `50` | How many commits' runs it keeps, in `deployer\ci.json`. Cached job logs are in `deployer\ci-logs\`. |

When the `CI` run on the newest commit finishes, the helper checks for a deploy right away instead of waiting for its next 2-minute poll.

### Deploy without the helper

Remove the helper service first (`install-service.ps1` refuses to run while it exists, because the two would fight over `HomeControl`): `nssm stop HomeDeployer; nssm remove HomeDeployer confirm`. Then run `install-service.ps1` from a clone as in section 3; that points `HomeControl` back at that clone. To go back to automatic deploys, re-run `install-deployer.ps1` (it keeps the tokens, `shared\` and `releases\`).

### Delete the old install

After the first auto-deploy succeeds and the app works from `C:\HomeControl\current`, the old install folder (for example `C:\home-control`) is no longer used. Its `.env` now lives in `C:\HomeControl\shared`. Keep its `logs\` if you want the old log history, then delete the folder.

## 9. Android app

An Android app ("Home", a thin WebView around the web app) is built and signed by the `Android` GitHub workflow on pushes to `main` that change `apps/android/**` or the workflow file itself, published as release `android-v<versionCode>` (versionCode is 1000 + the workflow's run number) with the asset `home.apk`. The deploy helper downloads the newest one into `<install root>\shared\android\` on its normal poll, and the server offers it at `/app/home.apk`.

### One-time: create the signing key

1. Create the key (keep the passwords):

   ```
   keytool -genkeypair -v -keystore home.jks -alias home -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Base64 it, e.g. in PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes('home.jks'))`.
3. In the GitHub repo, add the Actions secrets `HOME_KEYSTORE_BASE64` (the base64 text), `HOME_KEYSTORE_PASSWORD`, `HOME_KEY_ALIAS` (`home`) and `HOME_KEY_PASSWORD`. Until all four exist the workflow doesn't publish an APK.
4. **Keep `home.jks` backed up** somewhere safe. Losing it means uninstalling and reinstalling the app on every phone.

### One-time: server steps

Run these as Administrator on the server PC, in an elevated PowerShell in a clone of the repo:

```powershell
.\scripts\install-deployer.ps1 -Root C:\HomeControl -GitHubRepo <owner>/<name>   # same arguments as in section 8
.\scripts\firewall.ps1
```

`scripts\install-deployer.ps1` updates the helper so it waits only for the `CI` workflow and syncs the newest APK into `<install root>\shared\android\`. It doesn't set anything on the `HomeControl` service: the service gets `ANDROID_APK_DIR` from `apply-service-settings` on the next deploy. `scripts\firewall.ps1` now also opens UDP 5353 for mDNS, which the app uses to find the server.

#### First rollout order

The helper that is installed before this change waits for every workflow on a commit, including `Android`. So for the first rollout:

1. Push the branch and open a PR. The `pull_request` trigger runs both `CI` and `Android`; confirm `Android` is green before merging.
2. Merge.
3. Right after the merge, re-run `scripts\install-deployer.ps1` as Administrator (as above), so the helper waits only on `CI` from then on.
4. Run `scripts\firewall.ps1` as Administrator.

### Installing on a phone

1. Open Home in Chrome on the phone and tap **Get the Android app** (on the login screen or in your profile).
2. Allow **Install unknown apps** for Chrome when asked, then install.
3. Open Home. It checks the saved address, otherwise searches the home Wi-Fi for about 5 seconds. When the server has a newer APK, an **Update available** bar appears.

The first release-signed update won't install over a debug build: uninstall the debug build once.

### Troubleshooting

- **"Home couldn't be reached":** tap **Retry**, or **Settings** and enter the address, e.g. `192.168.0.100:4000`. Long-pressing the app icon also offers a **Server settings** shortcut.
- **No "Get the Android app" link:** the server has no APK yet. Check the `Android` workflow ran with all four secrets set and that the deploy helper has polled since.
