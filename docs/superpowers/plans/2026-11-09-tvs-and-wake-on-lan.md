# TV Control and Wake-on-LAN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Control Android/Google TVs, Samsung Tizen TVs and Hisense VIDAA TVs from the app (power, remote keys, app shortcuts), and wake wired Windows PCs with Wake-on-LAN.

**Architecture:**
- Each TV protocol is a new driver behind the existing `Driver` interface (`apps/server/src/devices/types.ts`), with its wire code in `packages/protocols`.
- TVs and PCs are ordinary `Device` rows with new kinds (`TV`, `COMPUTER`), so grants, rooms, layouts and routines keep working.
- Remote keys, app launches and pairing are new driver capabilities (an optional `tv` member on `Driver`) reached through new GraphQL mutations.
- Power goes through the existing `setDeviceState`.

**Tech Stack:** TypeScript, Node (`dgram`, `net`, `tls`), Prisma 7/Postgres, Apollo Server 5, React + MUI + Apollo Client, Vitest. New dependencies: `node-forge`, `protobufjs`, `mqtt` (protocols package only).

**Spec:** `docs/superpowers/specs/2026-11-09-tvs-and-wake-on-lan-design.md`

## Global Constraints

- **Kinds, brands, statuses:**
  - New `DeviceKind` values: `TV`, `COMPUTER`.
  - New `Brand` values: `ANDROID_TV`, `SAMSUNG`, `HISENSE`, `WOL` (manually added PCs).
  - New `DeviceStatus` value: `NEEDS_PAIRING`.
- **Guests:** guests get **no cameras and no computers**. This is enforced in `visibleDevices`/`device-rows.ts`, `setGrants`, `setDeviceGrants`, `GrantsEditor`, and the device `AccessChecklist`. The error message is `Guests can't have computers`.
- **Secrets:** pairing secrets (certificates, keys, tokens) are stored only in `Device.secret`, encrypted with `encryptSecret` (`apps/server/src/secrets.ts`), and never returned through GraphQL.
- **TLS to TVs:** TVs present self-signed certificates, so CA validation is replaced by **pinning**, never by plain `rejectUnauthorized: false`. The TV certificate's SHA-256 fingerprint seen during pairing is stored inside the encrypted secret. Every later connection checks it in `checkServerIdentity` (or right after the handshake) and closes on a mismatch, reporting `NEEDS_PAIRING`. Pairing itself is trust-on-first-use.
- **Timeouts:** every TV/PC command runs under the existing 3 s command timeout (`COMMAND_TIMEOUT_MS`). An unreachable TV gives `DEVICE_UNREACHABLE`, never a hang.
- **Magic packet:** UDP to port **9**, sent to `255.255.255.255` **and** to the directed broadcast of every non-internal IPv4 interface. Payload: 6× `0xFF`, then the 6-byte MAC 16 times (102 bytes).
- **PC status probe:** TCP connect to **445, 3389, 22**, each with a 1 s timeout. Any connection means awake. Run every **10 s**. No ICMP.
- **Pending pairing:** held in memory, dropped after **2 minutes**. A new start for the same device replaces the old one.
- **App shortcuts:** `YOUTUBE`, `NETFLIX`, `PRIME_VIDEO`, `DISNEY_PLUS`, `SPOTIFY`. A TV lists only those its driver can launch.
- **Remote keys:** `POWER`, `VOLUME_UP`, `VOLUME_DOWN`, `MUTE`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `OK`, `BACK`, `HOME`. Hold-to-repeat is client-side: resend every **200 ms** while held, for volume and arrows only.
- **No new dependencies** beyond `node-forge`, `@types/node-forge`, `protobufjs` and `mqtt`, all in `packages/protocols`.
- **Code style:**
  - Small files, one responsibility each (user rule).
  - Server tests use `ApiHarness` (`apps/server/test/api-harness.ts`), and drivers use the fakes in `apps/server/test/fakes` and `packages/protocols/src/test`.
  - After changing `schema.graphql`, run `pnpm --filter @home/web codegen`.
- **Shared test database:** never leave a background test run going.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **MAC addresses typed in any common form** (`AA-BB-CC-DD-EE-FF`, `aa:bb:…`, `aabb.ccdd.eeff`, `AABBCCDDEEFF`, surrounding spaces) normalise to `aa:bb:cc:dd:ee:ff`. Anything else gives `Enter a MAC address like AA:BB:CC:DD:EE:FF`. A MAC already used by another PC gives `That computer is already added`. Tests: Tasks 2 and 3.
2. **A remote key or app launch on a TV that is off, unplugged or mid-reconnect** fails within the command timeout with `DEVICE_UNREACHABLE`, and the page shows a toast instead of freezing. Test: Task 4 (a fake TV driver whose `sendKey` never resolves).
3. **Pairing abandoned or started twice:** a second start replaces the first, an expired pairing gives `Pairing expired — start again`, and a wrong code leaves the device `NEEDS_PAIRING` with `Wrong code — check the TV and try again`. Tests: Task 4.
4. **A TV whose IP changes (DHCP)** is rediscovered as the same device, matched by its stable id (`externalId`), with the new IP. Its pairing survives. Tests: Tasks 6, 7, 8.
5. **A guest given a computer** through either grant path is refused, and a guest's device list never contains one, even if a grant row already exists. Tests: Task 1.

---

### Task 1: Data model, enums and guest rule

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (enums `Brand`, `DeviceKind`, `DeviceStatus`)
- Create: migration `apps/server/prisma/migrations/<timestamp>_tvs_and_computers/migration.sql` (via `pnpm --filter @home/server exec prisma migrate dev --name tvs_and_computers --create-only`, then apply)
- Modify: `apps/server/src/graphql/schema.graphql` (lines 7, 10, 11: enum values)
- Modify: `apps/server/src/services/guest-rules.ts`, `services/device-rows.ts:13`, `services/grants.ts:26`, `services/device-grants.ts:22`
- Modify: `apps/server/src/devices/command-guard.ts` (`CONTROLLABLE` gains `TV`, `COMPUTER`)
- Modify: `apps/web/src/admin/users/GrantsEditor.tsx:41`, `apps/web/src/device/admin/AccessChecklist.tsx:18`
- Create: `apps/web/src/common/guestHidden.ts`
- Test: `apps/server/test/api-guest-limits.test.ts` (extend), `apps/web/src/admin/UsersPage.test.tsx` or the existing grants editor test (extend)

**Interfaces:**
- Produces (server, `guest-rules.ts`): `GUEST_HIDDEN_KINDS: readonly DeviceKind[] = ["CAMERA", "COMPUTER"]` and `guestRefusalFor(kind: DeviceKind): string` (`"Guests can't have cameras"` / `"Guests can't have computers"`).
- Produces (web, `common/guestHidden.ts`): `hiddenFromGuests(kind: DeviceKind): boolean`.

- [ ] **Step 1: Write failing server tests** in `api-guest-limits.test.ts`:
  - `setGrants` for a guest that includes a `COMPUTER` device rejects with `BAD_USER_INPUT` and the message `Guests can't have computers`.
  - `setDeviceGrants` on a `COMPUTER` device with a guest id rejects with the same message.
  - With a grant row inserted directly via Prisma, the guest's `devices` query does not include the computer.
  - `setDeviceState` on a `TV` device no longer fails with "tv devices are not controlled" (fake driver answers OK).
- [ ] **Step 2: Run them**: `pnpm --filter @home/server test api-guest-limits`. Expected: FAIL (enum values don't exist).
- [ ] **Step 3: Add the enum values and the migration, and apply it** (`pnpm --filter @home/server exec prisma migrate dev`). Update `schema.graphql` enums. Replace the camera-only checks with `GUEST_HIDDEN_KINDS` / `guestRefusalFor`. Add `TV` and `COMPUTER` to `CONTROLLABLE`.
- [ ] **Step 4: Web.** Run `pnpm --filter @home/web codegen`. `GrantsEditor` and `AccessChecklist` hide both kinds from guests through `hiddenFromGuests`. Extend the grants editor test: a guest's checklist omits a computer and a camera.
- [ ] **Step 5: Verify.** Run server tests, web typecheck and web tests. Expected: all pass (the known flaky `GroupDialogs` test excepted).
- [ ] **Step 6: Commit**: `feat: TV and computer device kinds; guests get no computers`

---

### Task 2: Wake-on-LAN and TCP probe (protocols)

**Files:**
- Create: `packages/protocols/src/wol/mac.ts`, `wol/magic-packet.ts`, `wol/broadcast-addresses.ts`, `wol/send.ts`, `net/tcp-probe.ts`
- Modify: `packages/protocols/src/index.ts` (exports)
- Test: `packages/protocols/src/wol/*.test.ts`, `net/tcp-probe.test.ts`

**Interfaces:**
- Produces:
  - `parseMac(input: string): string | null`: normalised `aa:bb:cc:dd:ee:ff`, or null.
  - `magicPacket(mac: string): Buffer`: 102 bytes.
  - `broadcastAddresses(ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string[]`: `255.255.255.255` first, then each non-internal IPv4 interface's directed broadcast (`address | ~netmask`), deduplicated.
  - `sendMagicPacket(mac: string, opts?: { addresses?: string[]; port?: number; socket?: () => dgram.Socket }): Promise<void>`: defaults are `broadcastAddresses(os.networkInterfaces())` and port 9. It sets `setBroadcast(true)` and sends to every address, then closes. It rejects only if every send failed.
  - `probeTcp(host: string, ports: readonly number[], timeoutMs: number): Promise<boolean>`: true if any port connects. Tries ports in parallel and resolves on the first success.

- [ ] **Step 1: Failing tests**:
  - `parseMac`: each form in Review Focus 1 → `"aa:bb:cc:dd:ee:ff"`. `"aa:bb:cc:dd:ee"`, `"zz:bb:cc:dd:ee:ff"` and `""` → null.
  - `magicPacket("aa:bb:cc:dd:ee:ff")`: length 102, first 6 bytes `0xff`, bytes 6–11 equal `aabbccddeeff`, bytes 96–101 equal `aabbccddeeff`.
  - `broadcastAddresses({ eth: [{ family: "IPv4", address: "192.168.0.10", netmask: "255.255.255.0", internal: false }], lo: [{ family: "IPv4", address: "127.0.0.1", netmask: "255.0.0.0", internal: true }], vpn: [{ family: "IPv4", address: "10.8.0.2", netmask: "255.255.0.0", internal: false }] })` → `["255.255.255.255", "192.168.0.255", "10.8.255.255"]`.
  - `sendMagicPacket` with a fake socket records one send per address on port 9, sets broadcast, and closes.
  - `probeTcp` against a local `net.createServer` on an ephemeral port → true. Against a closed port → false within `timeoutMs + 200` ms.
- [ ] **Step 2: Run them**: `pnpm --filter @home/protocols test wol net`. Expected: FAIL.
- [ ] **Step 3: Implement** with Node built-ins only.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(protocols): Wake-on-LAN magic packet and TCP probe`

---

### Task 3: Computers: WoL driver and Add/Edit PC

**Files:**
- Create: `apps/server/src/devices/drivers/wol.ts` (driver), `drivers/wol-link.ts` (per-PC status poller using `Poller`)
- Create: `apps/server/src/services/computers.ts` (`addComputer`, `updateComputer`)
- Create: `apps/server/src/graphql/resolvers/computers.ts`, and register it with the other resolvers
- Modify: `apps/server/src/devices/drivers/index.ts` (add `new WolDriver()`)
- Modify: `apps/server/src/devices/command-guard.ts`: add `assertPatchFits(device, patch)`, which throws `badInput("Computers can only be woken, not turned off")` for a `COMPUTER` with `on === false`. `DeviceManager.setState` calls it before the driver.
- Modify: `schema.graphql`: `addComputer(name: String!, roomId: ID, mac: String!, ip: String): AdminDevice!` and `updateComputer(id: ID!, mac: String!, ip: String): AdminDevice!`, both admin-only.
- Test: `apps/server/test/drivers-wol.test.ts`, `apps/server/test/api-computers.test.ts`

**Interfaces:**
- Consumes: `parseMac`, `sendMagicPacket`, `probeTcp` (Task 2).
- Produces:
  - A `WOL` device: `externalId` = normalised MAC, `config.mac` = MAC, `ip` = optional IP, `kind` = `COMPUTER`, `adopted: true` on creation.
  - State: `{ online: true, on: boolean | undefined }`. `online` is always true (the server can always send a packet). `on` is the probe result, or `undefined` when there is no IP.
  - `WolDriver` constructor options: `{ send?: typeof sendMagicPacket; probe?: typeof probeTcp; pollIntervalMs?: number }`.

- [ ] **Step 1: Failing tests**:
  - **Driver:**
    - `setState(pc, { on: true })` calls `send` with the PC's MAC.
    - A PC with an IP whose probe returns true reports `{ online: true, on: true }`, and false reports `on: false`.
    - A PC without an IP reports `{ online: true }` and is never probed.
  - **API:**
    - `addComputer` as admin with `mac: "AA-BB-CC-DD-EE-FF"` returns kind `COMPUTER`, brand `WOL`, and the stored MAC `aa:bb:cc:dd:ee:ff`.
    - A bad MAC gives `BAD_USER_INPUT` "Enter a MAC address like AA:BB:CC:DD:EE:FF".
    - The same MAC twice gives "That computer is already added".
    - A non-IPv4 `ip` gives "Enter an IPv4 address".
    - A non-admin caller gets `FORBIDDEN`.
    - `setDeviceState(pc, { on: false })` gives `BAD_USER_INPUT` "Computers can only be woken, not turned off".
    - A user with a grant can wake the PC. A user without one gets `FORBIDDEN`/`NOT_FOUND`, as for other devices.
- [ ] **Step 2: Run** `pnpm --filter @home/server test wol computers`. Expected: FAIL.
- [ ] **Step 3: Implement** the driver, link, services and resolvers. `updateComputer` changes MAC/IP; changing the MAC to one used by another PC is refused.
- [ ] **Step 4: Run.** Expected: PASS. Run the full server suite and tsc.
- [ ] **Step 5: Commit**: `feat(server): computers with Wake-on-LAN and online status`

---

### Task 4: TV capability, pairing and remote API (driver-agnostic)

**Files:**
- Modify: `apps/server/src/devices/types.ts`: add `TvKey`, `TvApp`, `PairingMode` and `TvCapability`, and an optional `tv?: TvCapability` on `Driver`.
- Create: `apps/server/src/devices/pending-pairings.ts` (2-minute expiry map, injected `now`)
- Create: `apps/server/src/services/tv-pairing.ts` (`startTvPairing`, `finishTvPairing`, `cancelTvPairing`)
- Create: `apps/server/src/services/tv-remote.ts` (`sendTvKey`, `launchTvApp`: access check exactly as `setDeviceState`, then the manager)
- Modify: `apps/server/src/devices/manager.ts`: add `sendTvKey(deviceId, key)`, `launchTvApp(deviceId, app)` and `tvInfo(device)`, under the command timeout via a small `runTvCommand` next to `runCommand` in `command-runner.ts`.
- Create: `apps/server/src/graphql/resolvers/tv.ts`
- Modify: `schema.graphql`:
  ```graphql
  enum TvKey { POWER VOLUME_UP VOLUME_DOWN MUTE UP DOWN LEFT RIGHT OK BACK HOME }
  enum TvApp { YOUTUBE NETFLIX PRIME_VIDEO DISNEY_PLUS SPOTIFY }
  enum PairingMode { CODE ACCEPT_ON_TV }
  type TvInfo { apps: [TvApp!]!  canPowerOn: Boolean! }
  # Device gains:  tv: TvInfo   (null unless kind TV)
  # Mutation gains:
  sendTvKey(deviceId: ID!, key: TvKey!): Boolean!
  launchTvApp(deviceId: ID!, app: TvApp!): Boolean!
  startTvPairing(deviceId: ID!): PairingMode!          # admin
  finishTvPairing(deviceId: ID!, code: String): AdminDevice!   # admin; code required for CODE, omitted for ACCEPT_ON_TV (waits up to 30 s)
  cancelTvPairing(deviceId: ID!): Boolean!             # admin
  ```
- Create: `apps/server/test/fakes/fake-tv-driver.ts`
- Test: `apps/server/test/api-tv.test.ts`, `apps/server/test/pending-pairings.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type TvKey = "POWER" | "VOLUME_UP" | "VOLUME_DOWN" | "MUTE" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "OK" | "BACK" | "HOME";
  export type TvApp = "YOUTUBE" | "NETFLIX" | "PRIME_VIDEO" | "DISNEY_PLUS" | "SPOTIFY";
  export type PairingMode = "CODE" | "ACCEPT_ON_TV";
  export interface TvCapability {
    sendKey(device: DeviceRecord, key: TvKey): Promise<void>;
    launchApp(device: DeviceRecord, app: TvApp): Promise<void>;
    apps(device: DeviceRecord): TvApp[];
    canPowerOn(device: DeviceRecord): boolean;
    /** Opens a pairing session; the returned handle is kept in PendingPairings. */
    startPairing(device: DeviceRecord): Promise<{ mode: PairingMode; finish(code?: string): Promise<string /* plain secret to store */>; cancel(): void }>;
  }
  // Also on Driver (not TvCapability), optional: used by addTvByIp (Task 12), implemented by the TV drivers in Tasks 6–8.
  identify?(ip: string): Promise<Discovered | undefined>;
  ```
- Errors from `finish`:
  - `WrongPairingCodeError` → `BAD_USER_INPUT` "Wrong code — check the TV and try again" (the session stays pending).
  - `PairingRejectedError` → `BAD_USER_INPUT` "The TV refused the pairing".
  - A missing or expired session → `BAD_USER_INPUT` "Pairing expired — start again".
- On success, `finishTvPairing` stores `encryptSecret(secret)` in `Device.secret`, sets status `OK`, and triggers the manager's resync.
- Drivers report `NEEDS_PAIRING` through `ctx.status` when no secret is stored, or when the TV rejects the stored one.

- [ ] **Step 1: Failing tests**, with a fake TV driver registered for brand `ANDROID_TV`:
  - **Remote:**
    - `sendTvKey` as a granted user calls the fake's `sendKey` with `"VOLUME_UP"`.
    - Without a grant → `FORBIDDEN`/`NOT_FOUND`, as `setDeviceState` does.
    - A `sendKey` that never resolves → `DEVICE_UNREACHABLE` within 3.5 s.
    - On a device with status `NEEDS_PAIRING` → `DEVICE_NOT_READY`.
  - **TV info:** `Device.tv` returns the fake's apps and `canPowerOn`, and is null for a LIGHT.
  - **Pairing:**
    - `startTvPairing` → `CODE`.
    - `finishTvPairing` with the wrong code → the wrong-code error, and a second attempt with the right code succeeds.
    - Success stores an encrypted secret (`Device.secret` is non-null and not equal to the plain secret) and sets status `OK`.
    - A second `startTvPairing` cancels the first handle.
    - `pending-pairings.test.ts`: past 2 minutes, `get` returns undefined and `cancel` was called.
    - The pairing mutations from a non-admin → `FORBIDDEN`.
- [ ] **Step 2: Run** `pnpm --filter @home/server test api-tv pending-pairings`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then run `pnpm --filter @home/web codegen` and the full server suite.
- [ ] **Step 5: Commit**: `feat(server): TV remote keys, app launch and pairing API`

---

### Task 5: SSDP search (protocols)

**Files:**
- Create: `packages/protocols/src/ssdp/search.ts`
- Test: `packages/protocols/src/ssdp/search.test.ts`

**Interfaces:**
- Produces: `ssdpSearch(opts: { st: string[]; timeoutMs: number; bindAddress?: string; socket?: () => dgram.Socket }): Promise<SsdpReply[]>`, with `SsdpReply = { ip: string; server: string; location: string; usn: string; st: string }`.
  - It sends each `M-SEARCH` twice to `239.255.255.250:1900` with `MX: 2`.
  - It collects replies until `timeoutMs`.
  - It returns one reply per `(ip, usn)`.

- [ ] **Step 1: Failing test**: a fake socket replying with the Chromecast, Samsung and Hisense headers recorded in the spec's table (e.g. `SERVER: Linux/5.15.180-android14-11, UPnP/1.0, Chromecast/1.6.18`, `LOCATION: http://192.168.0.163:8008/ssdp/device-desc.xml`, `USN: uuid:0f6e3cac-…::urn:dial-multiscreen-org:service:dial:1`) gives parsed replies. Duplicates are collapsed, and headers are matched case-insensitively.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(protocols): SSDP search`

---

### Task 6: Android TV Remote v2 (protocol + driver)

**Files:**
- Create: `packages/protocols/src/androidtv/`:
  - `proto/polo.proto` and `proto/remotemessage.proto`: transcribed from the MIT-licensed `androidtv-remote` npm package, with a license header naming the source.
  - `messages.ts`: protobufjs load + encode/decode, varint length-prefixed framing.
  - `certificate.ts`: self-signed RSA-2048 client cert via node-forge, CN `home-control`.
  - `pairing-secret.ts`
  - `pairing-client.ts`: TLS to port 6467.
  - `remote-client.ts`: TLS to port 6466.
  - `keys.ts`: `TvKey` → Android keycode.
  - `apps.ts`: `TvApp` → app link.
  - `errors.ts`
- Create: `apps/server/src/devices/drivers/android-tv.ts`, `drivers/android-tv-link.ts`, `drivers/android-tv-mapping.ts`
- Modify: `drivers/index.ts`
- Create: `packages/protocols/src/test/fake-android-tv.ts` (a TLS server speaking the framing)
- Test: `packages/protocols/src/androidtv/*.test.ts`, `apps/server/test/drivers-android-tv.test.ts`

**Interfaces:**
- Consumes: `ssdpSearch` (Task 5), `TvCapability` (Task 4), `sendMagicPacket` is not needed (power on is a key).
- Produces:
  - `createClientCertificate(): { certPem: string; keyPem: string }`
  - `pairingSecret(clientCertPem: string, serverCertDer: Buffer, code: string): Buffer | null`: null when the code's check byte doesn't match.
  - `AndroidTvPairing.start(host, cert)`: shows the code on the TV.
  - `.finish(code)`: resolves, or throws `WrongPairingCodeError`.
  - `AndroidTvRemote(host, cert)`, an EventEmitter with events `power(on: boolean)`, `connected` and `disconnected`. Methods: `connect()`, `sendKey(keycode)`, `launch(appLink)`, `close()`.
  - Stored secret: `JSON.stringify({ certPem, keyPem, tvCertSha256 })`. The TV certificate fingerprint is pinned on every remote connection (Global Constraints).
  - `identify(ip)`: fetch `http://<ip>:8008/ssdp/device-desc.xml` and check that 6466 is open.
  - `externalId`: the SSDP UUID without the `uuid:` prefix.
  - The driver discovers via `ssdpSearch` (`st: urn:dial-multiscreen-org:service:dial:1`) and keeps replies whose `server` contains `Chromecast/` and whose IP accepts TCP on 6466 (`probeTcp`). Discovered kind `TV`. Name from `device-desc.xml` `friendlyName`, model from `modelName`.

Protocol notes (from `androidtv-remote`; verify against its source and tests, don't guess):
- **Pairing (6467):** PairingRequest → Options (hexadecimal, 6 symbols) → Configuration → the TV shows a 6-character code.
  - The secret is SHA-256 of: client modulus, client exponent, server modulus, server exponent, and the code's last 4 hex chars as bytes.
  - The hash's first byte must equal the code's first 2 hex chars. That check is how a wrong code is detected locally.
- **Remote (6466):** answer RemoteConfigure and RemoteSetActive.
  - **Reply to every RemotePingRequest**, or the TV drops the connection.
  - RemoteStart.started gives the power state.
  - Keys: RemoteKeyInject direction SHORT. Apps: RemoteAppLinkLaunchRequest.
- **Keycodes:**
  - POWER 26, VOLUME_UP 24, VOLUME_DOWN 25, MUTE 164
  - UP 19, DOWN 20, LEFT 21, RIGHT 22, OK 23
  - BACK 4, HOME 3
- **App links:**
  - YouTube `https://www.youtube.com`
  - Netflix `https://www.netflix.com/title`
  - Prime Video `https://app.primevideo.com`
  - Disney+ `https://www.disneyplus.com`
  - Spotify `spotify://`
- **Power:**
  - `setState({ on })` sends POWER only when the reported power differs from the request, so the toggle is idempotent.
  - `canPowerOn` is always true.

- [ ] **Step 1: Failing protocol tests**:
  - Framing round-trip of a RemoteKeyInject.
  - `pairingSecret` against the vector in `androidtv-remote`'s tests: right code → the expected hash, wrong check byte → null.
  - `createClientCertificate` gives PEM that `tls.createSecureContext` accepts.
  - A remote connection to a fake TV presenting a different certificate than the pinned one closes with `CertificateMismatchError`.
  - Against `fake-android-tv`: pairing with the right code succeeds and the wrong code throws `WrongPairingCodeError`.
  - The remote answers pings, emits `power(true)` on RemoteStart, and sends keycode 24 for `VOLUME_UP`.
- [ ] **Step 2: Run** `pnpm --filter @home/protocols test androidtv`. Expected: FAIL. **Step 3: Implement the protocol.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Failing driver tests** (fake remote injected):
  - **Discovery:** SSDP replies → `discovered` with kind `TV`, brand `ANDROID_TV`, and `externalId` = UUID. A second discovery with a new IP and the same UUID updates the same device (Review Focus 4).
  - **Status:** a device without a secret → status `NEEDS_PAIRING`, and no connection is attempted.
  - **Power:** a power event updates state `on`. `setState({ on: false })` while on sends POWER, and while off sends nothing.
  - **Reconnect:** the link uses `Reconnector` and reports `online: false` on disconnect.
- [ ] **Step 6: Run, implement the driver, run.** Expected: PASS, and the full server suite passes.
- [ ] **Step 7: Live check (dev PC on the home LAN):** pair the TCL at 192.168.0.163 with a scratch script (`scripts/` is not committed; use the scratchpad), then send `VOLUME_UP`. Record the result in the task report. If the live TV disagrees with the fake, fix the protocol and add a regression test.
- [ ] **Step 8: Commit**: `feat: Android TV Remote v2 driver`

---

### Task 7: Samsung Tizen (protocol + driver)

**Files:**
- Create: `packages/protocols/src/samsung/`:
  - `info.ts`: GET `http://<ip>:8001/api/v2/` → `{ id, name, modelName, wifiMac, powerState? }`.
  - `remote.ts`: `wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=<base64("Home Control")>&token=<token>`, with the TV certificate's fingerprint pinned (Global Constraints). Pairing records the fingerprint, and the secret is `JSON.stringify({ token, tvCertSha256 })`.
  - `apps.ts`, `keys.ts`, `errors.ts`
- Create: `apps/server/src/devices/drivers/samsung.ts`, `drivers/samsung-link.ts`
- Modify: `drivers/index.ts`
- Create: `packages/protocols/src/test/fake-samsung-tv.ts`
- Test: `packages/protocols/src/samsung/*.test.ts`, `apps/server/test/drivers-samsung.test.ts`

**Interfaces:**
- Consumes: `ssdpSearch`, `sendMagicPacket`, `TvCapability`, `ws` (move it to, or add it as a dependency of, `@home/protocols` with the same `^8.22.1` range).
- Produces:
  - **Pairing** is `ACCEPT_ON_TV`. `startPairing` opens the socket without a token. `finish()` waits up to 30 s for `ms.channel.connect` carrying `data.token`, and returns the token as the secret. On `ms.channel.unauthorized` it throws `PairingRejectedError`.
  - **Keys** are sent as `{"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":<KEY_*>,"Option":"false","TypeOfRemote":"SendRemoteKey"}}`:
    - POWER `KEY_POWER`, VOLUME_UP `KEY_VOLUP`, VOLUME_DOWN `KEY_VOLDOWN`, MUTE `KEY_MUTE`
    - UP `KEY_UP`, DOWN `KEY_DOWN`, LEFT `KEY_LEFT`, RIGHT `KEY_RIGHT`, OK `KEY_ENTER`
    - BACK `KEY_RETURN`, HOME `KEY_HOME`
  - **Apps:** `{"method":"ms.channel.emit","params":{"event":"ed.apps.launch","to":"host","data":{"appId":<id>,"action_type":"DEEP_LINK"}}}`. Use these IDs and verify each on the live TV:
    - YouTube `111299001912`
    - Netflix `3201907018807`
    - Prime Video `3201910019365`
    - Disney+ `3201901017640`
    - Spotify `3201606009684`
  - **`externalId`:** `/api/v2/` `device.duid` without the `uuid:` prefix. Store `config.mac` from `wifiMac` (or `wiredMac`).
  - **Power state:** on when `/api/v2/` answers and `powerState` is absent or `"on"`; off when it doesn't answer or says `"standby"`. Poll every 5 s with `Poller`.
  - **Power on:** `sendMagicPacket(config.mac)`. **Power off:** `KEY_POWER` when on.
  - **`canPowerOn`:** true when `config.mac` is set.
  - **Discovery:** SSDP replies whose `server` contains `Samsung`, confirmed by `/api/v2/`. A Samsung that doesn't answer `/api/v2/` isn't reported. `identify(ip)` uses the same `/api/v2/` check.

- [ ] **Step 1: Failing protocol tests** against `fake-samsung-tv`:
  - The info parse matches the JSON captured on 2026-11-09 (UN55NU7100, `wifiMac` `9C:8C:6E:EC:7D:36`, duid `uuid:8a36aaf0-536b-41b3-a5d2-86694337e408`).
  - Pairing resolves with the token the fake sends, and an unauthorized message throws `PairingRejectedError`.
  - `sendKey("VOLUME_UP")` sends the `KEY_VOLUP` JSON.
- [ ] **Step 2: Run, implement, run.** Expected: PASS.
- [ ] **Step 3: Failing driver tests:**
  - Discovery gives `externalId` `8a36aaf0-536b-41b3-a5d2-86694337e408`, `config.mac` `9c:8c:6e:ec:7d:36` and kind `TV`. Rediscovery on a new IP keeps the same id.
  - `setState({ on: true })` while off calls the injected `send` with the MAC.
  - A token rejected on connect → status `NEEDS_PAIRING`.
- [ ] **Step 4: Run, implement, run.** Expected: PASS, and the full server suite passes.
- [ ] **Step 5: Live check:** pair "Tele cuarto" (192.168.0.235), send `VOLUME_UP`, and launch YouTube. Put it in standby and try power on. Record whether WoL over Wi-Fi woke it. If it didn't, the TV needs *Power On with Mobile*; note that in the report.
- [ ] **Step 6: Commit**: `feat: Samsung Tizen TV driver`

---

### Task 8: Hisense VIDAA (protocol + driver, spike first)

**Files:**
- Create: `packages/protocols/src/hisense/` (`client.ts`: MQTT over TLS to port 36669 via `mqtt`; `topics.ts`; `keys.ts`; `apps.ts`; `errors.ts`; `credentials.ts`)
- Create: `apps/server/src/devices/drivers/hisense.ts`, `drivers/hisense-link.ts`
- Modify: `drivers/index.ts`
- Test: `packages/protocols/src/hisense/*.test.ts` (against an in-process `mqtt` broker stub or a fake transport), `apps/server/test/drivers-hisense.test.ts`

**Interfaces:**
- Consumes: `ssdpSearch`, `sendMagicPacket`, `TvCapability`.
- Produces:
  - **Pairing** is `CODE`:
    - Publish to `/remoteapp/tv/ui_service/<clientId>/actions/gettvstate`, and the TV shows a 4-digit code.
    - `finish(code)` publishes `{"authNum": <code>}` to `/remoteapp/tv/ui_service/<clientId>/actions/authenticationcode` and waits for `{"result":1}` on `/remoteapp/mobile/<clientId>/ui_service/data/authenticationcode`.
    - The secret is `JSON.stringify({ clientId, ...credentialsUsed })`.
  - **Keys:** publish the key name to `/remoteapp/tv/remote_service/<clientId>$normal/actions/sendkey`:
    - POWER `KEY_POWER`, VOLUME_UP `KEY_VOLUMEUP`, VOLUME_DOWN `KEY_VOLUMEDOWN`, MUTE `KEY_MUTE`
    - UP `KEY_UP`, DOWN `KEY_DOWN`, LEFT `KEY_LEFT`, RIGHT `KEY_RIGHT`, OK `KEY_OK`
    - BACK `KEY_RETURNS`, HOME `KEY_HOME`
  - **Apps:** launch via `/remoteapp/tv/ui_service/<clientId>/actions/launchapp`. List only the apps the TV's app list contains (`…/actions/applist`).
  - **`externalId`:** the SSDP UUID (`HISETV…`). `identify(ip)`: fetch `http://<ip>:3366/dd.xml` and require manufacturer `Hisense`.
  - **TLS:** pin the broker certificate fingerprint seen at pairing, as above.
  - **Power on:** WoL to the MAC from `getdeviceinfo` when known. `canPowerOn` is true only then.

- [ ] **Step 1: Spike (live, before any production code)**:
  - In the scratchpad, connect to `192.168.0.208:36669` with TLS, username `hisenseservice` and password `multimqttservice`, first without and then with the community client certificate (`rcm_certchain_pem.cer` / `rcm_pem_privkey.pkcs8` from the `hisense_tv` / `vidaa` community projects).
  - Newer VIDAA firmware derives the username and password from the MAC and a timestamp. If the static credentials are refused, implement the derived-credentials scheme in `credentials.ts` from a community source you can cite in a comment.
  - Record in the task report: which credentials worked, the pairing exchange, and one key press.
- [ ] **Step 2: Decide.** If no credentials work after the spike, **stop the task**. Add a "Hisense VIDAA" section to `docs/NICE-TO-HAVES.md` recording what was tried and the exact failure, commit it, and report `DONE_WITH_CONCERNS`. The rest of the plan does not depend on this task.
- [ ] **Step 3: Failing protocol tests** for the topics, payloads and pairing result handling (`{"result":1}` succeeds, anything else gives `WrongPairingCodeError`), using a fake transport built from the spike's captured messages.
- [ ] **Step 4: Run, implement, run.** Expected: PASS.
- [ ] **Step 5: Failing driver tests:** the discovery/rediscovery id is kept, `NEEDS_PAIRING` without a secret, and the key mapping. **Run, implement, run.**
- [ ] **Step 6: Live check** on "TV del dormitorio": pair, `VOLUME_UP`, launch YouTube.
- [ ] **Step 7: Commit**: `feat: Hisense VIDAA TV driver`

---

### Task 9: Routines with TVs and computers

**Files:**
- Modify: `apps/server/src/routines/action-rules.ts` (`canUseInRoutine`, `assertActionFits`, `fitAction`)
- Modify: `apps/web/src/routines/lib/usableDevices.ts`, `apps/web/src/routines/editor/PowerChoice.tsx`
- Test: `apps/server/test/routine-steps.test.ts` or `api-routines.test.ts` (extend), `apps/web/src/routines/editor/RoutineEditor.test.tsx` (extend)

**Interfaces:**
- Produces:
  - Server: `canUseInRoutine` accepts `TV` and `COMPUTER`.
  - For a COMPUTER, `assertActionFits` refuses `on: false` with `"<name> can only be woken"` and refuses light details.
  - For a TV, it accepts only `on`, as for plugs.
  - `fitAction` keeps `on: true` for computers and drops `on: false`.
  - Web: `usableDevices` includes TVs and computers. For a computer, `PowerChoice` offers only "Wake" (`on: true`), labelled "Wake".

- [ ] **Step 1: Failing tests**:
  - Saving a routine with a TV `on: true` and a PC `on: true` succeeds.
  - A PC with `on: false` → `BAD_USER_INPUT` "Office PC can only be woken".
  - Running it calls the fake drivers.
  - In the web editor, the device picker lists a TV and a computer, and the computer's action dialog shows "Wake" and no "Off".
- [ ] **Step 2: Run, implement, run.** Expected: PASS.
- [ ] **Step 3: Commit**: `feat: TVs and computers in routines`

---

### Task 10: Dashboard tiles for TVs and computers

**Files:**
- Modify: `apps/web/src/dashboard/lib/capabilities.ts`: add `isTv` and `isComputer`. `isSupportedKind` includes both. `canToggle` includes a TV that is online and doesn't need setup. `needsSetup` includes `NEEDS_PAIRING`.
- Create: `apps/web/src/dashboard/tile/ComputerTileAction.tsx`: a "Wake" button. Tapping a computer tile wakes it, shows "Waking…" for 5 s, then the probe state shows.
- Modify: `apps/web/src/dashboard/tile/DeviceTile.tsx`, `TileStateLine.tsx`. A computer shows "Online" / "Offline", or nothing without an IP (`state.on == null`). A TV shows "On" / "Off".
- Modify: `apps/web/src/admin/devices/KindIcon.tsx` (`TvOutlined`, `ComputerOutlined`), `KindSelect.tsx` (TV and Computer are not offered for changing kind on other brands; `ChangeKindDialog` is unchanged for them)
- Modify: `apps/web/src/dashboard/data/` device query (`tv { apps canPowerOn }`)
- Test: `apps/web/src/dashboard/tile/DeviceTile.test.tsx` (extend)

- [ ] **Step 1: Failing tests:**
  - A TV tile toggles via `setDeviceState`.
  - A TV with `NEEDS_PAIRING` shows the needs-setup link for an admin and is inert for others.
  - A computer tile's tap calls `setDeviceState({ on: true })` and shows "Waking…".
  - A computer with `state.on === true` shows "Online", and with `null` shows no status.
- [ ] **Step 2: Run, implement, run.** Expected: PASS.
- [ ] **Step 3: Commit**: `feat(web): TV and computer tiles`

---

### Task 11: TV remote and computer card on the device page

**Files:**
- Create: `apps/web/src/device/tv/`:
  - `TvRemoteCard.tsx`: lays out the parts below.
  - `PowerButton.tsx`
  - `VolumeButtons.tsx`
  - `DirectionPad.tsx`: arrows + OK, with Back and Home under it.
  - `AppShortcuts.tsx`: only `device.tv.apps`.
  - `useHoldRepeat.ts`: fires immediately, then every 200 ms while held; stops on pointer up/leave/cancel.
  - `useTvCommands.ts`: the `sendTvKey`/`launchTvApp` mutations, with errors shown in the existing error snackbar.
  - `tvLabels.ts`: icons and labels for keys and apps.
- Create: `apps/web/src/device/computer/ComputerCard.tsx`: status, a big Wake button, and a link to the setup checklist, shown to admins.
- Modify: `apps/web/src/device/DeviceLayout.tsx`: a TV shows `TvRemoteCard` and a computer shows `ComputerCard`, in the controls column.
- Modify: `apps/web/src/device/data/` device-detail query (`tv { apps canPowerOn }`)
- Test: `apps/web/src/device/tv/TvRemoteCard.test.tsx`, `useHoldRepeat.test.ts`, `apps/web/src/device/computer/ComputerCard.test.tsx`

- [ ] **Step 1: Failing tests:**
  - Pressing OK sends `sendTvKey(OK)` once.
  - Holding VOLUME_UP for 650 ms with fake timers sends it 4 times (0, 200, 400, 600 ms).
  - Holding OK doesn't repeat.
  - Only the apps in `tv.apps` render, and tapping Netflix sends `launchTvApp(NETFLIX)`.
  - A `DEVICE_UNREACHABLE` error shows "Tele cuarto isn't answering".
  - When `canPowerOn` is false and the TV is off, the power button is disabled with the hint "This TV can only be turned off from the app".
  - The computer card's Wake sends `setDeviceState({ on: true })`.
- [ ] **Step 2: Run, implement, run.** Expected: PASS. The remote buttons are at least 56 px at phone width.
- [ ] **Step 3: Commit**: `feat(web): TV remote and computer card`

---

### Task 12: Admin: add a PC, add a TV by IP, pair a TV

**Files:**
- Create: `apps/web/src/admin/devices/AddComputerDialog.tsx` (name, room, MAC, optional IP, and a link to the setup checklist), `AddTvDialog.tsx` (IP)
- Create: `apps/web/src/admin/devices/pairing/`:
  - `PairTvDialog.tsx`: steps start → code field or "Accept on the TV" spinner → done or error.
  - `usePairTv.ts`
  - `PairingCodeField.tsx`
- Modify: `apps/web/src/admin/devices/DevicesToolbar.tsx` ("Add PC", "Add TV" next to the Kasa add), `DeviceMenu.tsx` ("Pair" for TVs, "Edit MAC/IP" for computers), `DeviceDialogs.tsx`, `HealthChip.tsx` (`NEEDS_PAIRING` → "Needs pairing")
- Create: `apps/server/src/services/tv-add.ts`: `addTvByIp(deps, ip)` asks each TV driver's `identify(ip)` in turn (Android → Samsung → Hisense) and records the first match as `recordDiscovered`. When none match, the error is `No supported TV answered at <ip>`. A Samsung without `/api/v2/` gives `This Samsung model isn't supported`.
- Modify: `schema.graphql`: `addTvByIp(ip: String!): AdminDevice!` (admin).
- Create: `docs/WAKE-ON-LAN.md`: the PC setup checklist from spec §3 (BIOS WoL, adapter "Wake on Magic Packet", Fast Startup off, wired, same subnet) and how to find the MAC (`getmac /v` or `ipconfig /all`).
- Test: `apps/server/test/api-tv-add.test.ts`, `apps/web/src/admin/DevicesPage.test.tsx` (extend), `apps/web/src/admin/devices/pairing/PairTvDialog.test.tsx`

- [ ] **Step 1: Failing tests:**
  - **Server:**
    - `addTvByIp` with a fake driver whose `identify` matches → an `AdminDevice` of kind TV.
    - No match → `DEVICE_UNREACHABLE` "No supported TV answered at 10.0.0.9".
    - A bad IP → "Enter an IPv4 address".
  - **Web:**
    - Add PC validates the MAC client-side with the same message, submits, and the new row appears.
    - The Pair dialog for `CODE` shows the code field and submits. A wrong-code error keeps the dialog open with the message.
    - For `ACCEPT_ON_TV` it shows "Accept the request on the TV" and resolves to done.
    - Closing the dialog calls `cancelTvPairing`.
- [ ] **Step 2: Run, implement, run.** Expected: PASS, with server and web suites, typecheck and lint clean.
- [ ] **Step 3: Commit**: `feat: add PCs and TVs by hand, pair TVs`

---

### Task 13: Docs and wrap-up

**Files:**
- Modify: `docs/NICE-TO-HAVES.md`: remove the "Smart TV control" and "Wake-on-LAN for computers" sections, keeping a one-line pointer to the spec. Keep the Hisense notes if Task 8 parked it.
- Modify: `docs/RUNNING.md`: the new migration needs `pnpm db:deploy`. TVs need one-time pairing from Admin > Devices.

- [ ] **Step 1:** Edit both docs.
- [ ] **Step 2: Verify:** server tsc + tests, protocols tests, web typecheck + lint + tests. Expected: all pass (the known flaky `GroupDialogs` test excepted, and it passes when rerun alone).
- [ ] **Step 3: Commit**: `docs: TVs and Wake-on-LAN`
