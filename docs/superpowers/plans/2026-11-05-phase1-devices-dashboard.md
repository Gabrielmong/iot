# Phase 1 — Devices, Dashboard & Logins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-hosted web app on the Windows server PC that discovers and locally controls the house's Tuya, Kasa and Govee devices, shows them on a live dashboard, and gates access with PIN logins and per-device permissions.

**Architecture:** pnpm monorepo. `packages/protocols` holds pure, DB-free TypeScript clients for each vendor's LAN protocol. `apps/server` (Node, Apollo Server, Prisma/Postgres) runs a device manager that owns driver instances, an in-memory state cache, and publishes changes over GraphQL subscriptions. `apps/web` (Vite, React, MUI, Apollo Client) is the dashboard/admin UI, served as static files by the server in production. One port, LAN only.

**Tech Stack:** TypeScript (strict), Node 22+, pnpm workspaces, Apollo Server + `graphql-ws` on Express, Prisma + PostgreSQL 18, React + MUI + Apollo Client + React Router, Vite, Vitest, GraphQL Code Generator. Latest stable version of every library at install time.

**Spec:** `docs/superpowers/specs/2026-11-05-home-control-design.md`

## Global Constraints

- TypeScript everywhere, `strict: true`. Latest stable versions of all libraries (`pnpm add <pkg>@latest`).
- Frontend: React + MUI. API: Apollo GraphQL on server and client; live updates via GraphQL subscriptions. Persistence: Prisma + PostgreSQL.
- Server runs **natively on Windows** (not Docker/WSL2); must start on boot and restart on crash.
- **LAN only.** No vendor cloud during normal operation. Cloud is touched only by the Tuya key sync action.
- Clients: Android Chrome (phones, wall tablet) and desktop browsers. Large touch targets; works full-screen.
- Login: tap your name → enter PIN. Roles: `ADMIN` (everything) and `USER` (operate granted devices only).
- Shared screens return to the user picker after inactivity; personal devices stay signed in.
- Govee: on/off, brightness, color, color temperature only — **no scenes**.
- Secrets (Tuya local keys, Tuya cloud secret, TP-Link password) never leave the server through the API.
- Metric units; app name in UI: "Home".
- Server listens on port `4000` (env `PORT`).

## Decisions this plan makes (not in the spec)

- **Monorepo:** pnpm workspaces: `packages/protocols`, `apps/server`, `apps/web`.
- **Tests:** Vitest everywhere. Server integration tests run against a real Postgres database named `home_test`.
- **PIN hashing:** Node `crypto.scrypt` (no native addons on Windows). PIN = 4–8 digits.
- **Sessions:** opaque random token (32 bytes, base64url) sent as `Authorization: Bearer` on HTTP and `connectionParams.authToken` on WebSocket; only its SHA-256 is stored. Personal sessions: 90-day sliding expiry. Shared-screen sessions: **3-minute** idle expiry (server-enforced) plus client-side return to picker after 3 minutes without input.
- **PIN lockout:** 5 wrong PINs for one user → that user locked for 60 s.
- **Secret storage:** AES-256-GCM with a 32-byte key from env `SECRET_KEY` (base64). Stored as `iv.tag.ciphertext` base64 string.
- **KP303 outlets:** each outlet is its own `Device` (kind `PLUG`, `parentId` → the strip), so grants work per outlet.
- **Kasa:** only the KLAP protocol is implemented (the only Kasa device present uses it). Discovery via UDP 20002 plus "add by IP".
- **Protocol correctness:** byte-level behavior is pinned by **golden vectors** generated from the reference Python implementations (`tinytuya`, `python-kasa`) with fixed keys/nonces, committed as JSON fixtures. Our TS must reproduce them byte-for-byte.
- **Windows service:** NSSM (`choco install nssm`), installed by `scripts/install-service.ps1`. Firewall rules by `scripts/firewall.ps1`.
- **State delivery:** Tuya: persistent TCP per adopted device (heartbeat every 10 s, push updates). Kasa & Govee: poll every 5 s. Commands time out after **3 s**.

## Review Focus

1. **Device unreachable during a command** (unplugged bulb, wall switch off) → `setDeviceState` fails within 3 s with a `DEVICE_UNREACHABLE` error, device shows `online: false`, UI shows a snackbar and the tile greys out; nothing hangs. *Tests in Tasks 9 and 14.*
2. **Stale Tuya local key** (bulb re-paired in Smart Life) → device status `KEY_INVALID` surfaced in admin and on the tile; reconnect backs off (max once per 60 s) instead of hammering. *Test in Task 6.*
3. **Device IP changes** (DHCP) → discovery packet with known external id updates the stored IP and the driver reconnects to the new address. *Test in Task 9.*
4. **Permission leak through live updates** → a USER never receives subscription events for ungranted devices, and revoking a grant stops events immediately for already-open subscriptions. *Test in Task 11.*
5. **PIN guessing on the wall tablet** → 6th attempt within the lockout window is rejected even with the correct PIN; error says how long to wait. *Test in Task 10.*

---

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, .gitignore, .env.example
scripts/
  firewall.ps1            # inbound rules, Private profile
  install-service.ps1     # NSSM service "HomeControl"
  golden/                 # python scripts that generate protocol fixtures
packages/protocols/src/
  tuya/frame.ts           # 55AA / 6699 framing + CRC/HMAC
  tuya/crypto.ts          # per-version encrypt/decrypt, session key derivation
  tuya/discovery.ts       # UDP 6666/6667/7000 listener
  tuya/client.ts          # TCP connection, handshake, query/control/heartbeat, push events
  tuya/cloud.ts           # Tuya OpenAPI client (token, device list, local keys, DP specs)
  tuya/light-dps.ts       # DP <-> normalized light state mapping
  kasa/klap.ts            # KLAP handshake + encrypted transport
  kasa/client.ts          # sysinfo, relay control, children
  kasa/discovery.ts       # UDP 20002
  govee/client.ts         # LAN API scan / devStatus / turn / brightness / colorwc
  types.ts                # Rgb, normalized state types shared by server
  test/fixtures/*.json    # golden vectors
apps/server/
  prisma/schema.prisma
  src/config.ts, src/main.ts, src/http.ts
  src/secrets.ts
  src/auth/{pin.ts,sessions.ts,context.ts}
  src/devices/{types.ts,manager.ts,state-cache.ts}
  src/devices/drivers/{tuya.ts,kasa.ts,govee.ts,fake.ts}
  src/graphql/{schema.graphql,resolvers/*.ts,pubsub.ts}
  test/{helpers.ts, *.test.ts}
apps/web/src/
  apollo.ts, main.tsx, App.tsx, theme.ts
  auth/{LoginScreen.tsx,PinPad.tsx,useIdleLogout.ts,session.ts}
  dashboard/{Dashboard.tsx,DeviceTile.tsx,DeviceDialog.tsx,LightControls.tsx}
  admin/{DevicesPage.tsx,RoomsPage.tsx,UsersPage.tsx,IntegrationsPage.tsx}
  gql/                    # codegen output
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `packages/protocols/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`, `apps/server/{package.json,tsconfig.json}`, `apps/web` (via `pnpm create vite@latest web --template react-ts`)
- Test: `packages/protocols/src/smoke.test.ts`

**Interfaces:**
- Produces: workspace packages `@home/protocols`, `@home/server`, `@home/web`; root scripts `pnpm test`, `pnpm build`, `pnpm dev` (runs server + web concurrently).

- [ ] **Step 1:** `git init`, create root files. `.gitignore` includes `node_modules`, `dist`, `.env`, `.superpowers/`, `apps/web/src/gql/`.
- [ ] **Step 2:** Create the three packages; `tsconfig.base.json` with `strict`, `module`/`moduleResolution` `NodeNext` (web keeps Vite's `bundler`), `target ES2023`.
- [ ] **Step 3:** Add a smoke test `expect(1 + 1).toBe(2)` in protocols; run `pnpm -r test`. Expected: 1 passed.
- [ ] **Step 4:** `.env.example` with `DATABASE_URL`, `DATABASE_URL_TEST`, `SECRET_KEY`, `PORT=4000`, `LAN_ADDRESS` (server's LAN IPv4, used for multicast binding).
- [ ] **Step 5:** Commit `chore: scaffold monorepo`.

---

### Task 2: Golden vectors from reference implementations

**Files:**
- Create: `scripts/golden/requirements.txt` (`tinytuya`, `python-kasa`), `scripts/golden/tuya_vectors.py`, `scripts/golden/kasa_vectors.py`, `scripts/golden/README.md`
- Produce: `packages/protocols/src/test/fixtures/tuya-vectors.json`, `kasa-vectors.json`, `tuya-cloud-sign.json`

**Interfaces:**
- Produces fixture shapes used by Tasks 3–5:
  - `tuya-vectors.json`: `{ "version": "3.1"|"3.3"|"3.4"|"3.5", "localKey": string, "seq": number, "cmd": number, "payload": object, "frameHex": string, "sessionKeyHex"?: string, "localNonceHex"?: string, "remoteNonceHex"?: string }[]` — one entry per version for DP_QUERY, CONTROL, and (3.4/3.5) each handshake message plus the derived session key.
  - `kasa-vectors.json`: `{ username, password, localSeedHex, remoteSeedHex, authHashHex, handshake2Hex, keyHex, ivHex, seq, sigHex, plaintext, requestBodyHex, responseBodyHex }`.
  - `tuya-cloud-sign.json`: `{ accessId: "id", accessSecret: "secret", t: "1700000000000", nonce: "", method: "GET", path: "/v1.0/token?grant_type=1", body: "", sign: string }` (from tinytuya's `Cloud` signing).

- [ ] **Step 1:** In a venv under `scripts/golden/.venv` (gitignored), install requirements.
- [ ] **Step 2:** Write the generators by calling the libraries' internal encoders with fixed inputs (`localKey = "0123456789abcdef"`, nonces `"0123456789abcdef"`/`"fedcba9876543210"`, seq 1, payload `{"dps":{"20":true}}`). Where a library generates randomness internally, monkeypatch `os.urandom`/`random` to fixed bytes. README documents exact library versions used.
- [ ] **Step 3:** Run both scripts; confirm JSON files exist and every hex field is non-empty.
- [ ] **Step 4:** Commit `test: add protocol golden vectors`.

---

### Task 3: Tuya framing and crypto (all versions)

**Files:**
- Create: `packages/protocols/src/tuya/{frame.ts,crypto.ts}`, `packages/protocols/src/types.ts`
- Test: `packages/protocols/src/tuya/frame.test.ts`, `crypto.test.ts`

**Interfaces:**
- Produces:
  - `type TuyaVersion = '3.1' | '3.3' | '3.4' | '3.5'`
  - `const TuyaCmd = { SESS_KEY_NEG_START: 0x03, SESS_KEY_NEG_RESP: 0x04, SESS_KEY_NEG_FINISH: 0x05, CONTROL: 0x07, STATUS: 0x08, HEART_BEAT: 0x09, DP_QUERY: 0x0a, CONTROL_NEW: 0x0d, DP_QUERY_NEW: 0x10, UDP_NEW: 0x13 } as const`
  - `encodeFrame(opts: { version: TuyaVersion; key: Buffer; seq: number; cmd: number; payload: Buffer }): Buffer`
  - `decodeFrames(buf: Buffer, version: TuyaVersion, key: Buffer): { frames: { seq: number; cmd: number; retcode?: number; payload: Buffer }[]; rest: Buffer }` — handles partial/multiple frames in one TCP chunk.
  - `deriveSessionKey(version: '3.4' | '3.5', localKey: Buffer, localNonce: Buffer, remoteNonce: Buffer): Buffer`
  - `udpKey: Buffer` (= md5("yGAdlopoPVldABfn"))

- [ ] **Step 1: Failing tests** — for each vector in `tuya-vectors.json`: `expect(encodeFrame(...).toString('hex')).toBe(v.frameHex)`; `decodeFrames(Buffer.from(v.frameHex,'hex'), ...)` returns the original payload; `deriveSessionKey` equals `sessionKeyHex`. Plus: two frames concatenated + half a third → 2 frames and `rest.length > 0`; a frame with corrupted CRC/HMAC/GCM tag throws `TuyaFrameError`.
- [ ] **Step 2:** Run `pnpm --filter @home/protocols test tuya` — FAIL.
- [ ] **Step 3:** Implement. Reference behavior is tinytuya's `pack_message`/`unpack_message`: 3.1 plaintext + md5 signature on CONTROL; 3.3 AES-128-ECB + version header `3.3\0\0\0…` (12 bytes) except on DP_QUERY; 3.4 ECB with HMAC-SHA256 trailer using session key; 3.5 `0x6699` prefix, AES-128-GCM with 12-byte IV, 14-byte AAD header, 16-byte tag. The vectors are the arbiter.
- [ ] **Step 4:** Run tests — PASS.
- [ ] **Step 5:** Commit `feat(protocols): tuya framing and crypto`.

---

### Task 4: Tuya discovery and TCP client

**Files:**
- Create: `packages/protocols/src/tuya/{discovery.ts,client.ts,light-dps.ts}`
- Test: `discovery.test.ts`, `client.test.ts` (against an in-process fake device server built from the same frame functions), `light-dps.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `startTuyaDiscovery(onDevice: (d: TuyaBroadcast) => void, opts?: { bindAddress?: string }): Promise<{ stop(): Promise<void> }>` where `TuyaBroadcast = { ip: string; gwId: string; productKey: string; version: TuyaVersion }`. Listens on UDP 6666 (plain), 6667 (ECB/udpKey), 7000 (GCM/udpKey). Ignores undecodable packets.
  - `class TuyaClient extends EventEmitter` — `constructor(opts: { ip: string; id: string; localKey: string; version: TuyaVersion; timeoutMs?: number })`, `connect(): Promise<void>`, `getDps(): Promise<Record<string, unknown>>`, `setDps(dps: Record<string, unknown>): Promise<void>`, `close(): void`. Events: `'dps'` (partial dps pushed by device), `'disconnected'`, `'error'`. Errors: `TuyaTimeoutError`, `TuyaKeyError` (handshake HMAC mismatch or undecryptable reply ⇒ wrong key).
  - `type DpSchema = { switch: string; mode?: string; brightness?: string; colorTemp?: string; color?: string; brightnessRange: [number, number]; colorFormat: 'hsv12' | 'rgbhsv14' }` (default v2 lights: `20/21/22/23/24`, range `[10,1000]`, `hsv12`; v1 lights: `1/2/3/4/5`, range `[25,255]`, `rgbhsv14`).
  - `dpsToLightState(dps, schema): LightState`, `lightPatchToDps(patch: LightPatch, schema): Record<string, unknown>`.
  - In `types.ts`: `type Rgb = { r: number; g: number; b: number }`, `type LightState = { on: boolean; brightness: number /*0-100*/; mode: 'color' | 'white'; color?: Rgb; colorTempK?: number }`, `type LightPatch = Partial<Omit<LightState, 'mode'>>`. Color temp range normalized to 2700–6500 K.

- [ ] **Step 1: Failing tests:**
  - discovery: send a 6667 packet built with `encodeFrame(version '3.3', key udpKey, cmd UDP_NEW…)` to localhost → callback gets `{ ip:'127.0.0.1', gwId, version:'3.3' }`. Same for a 7000 GCM packet → `version:'3.5'`.
  - client, per version: fake device accepts handshake (3.4/3.5), answers DP_QUERY with `{"20":true,"22":500}` → `getDps()` resolves to that; `setDps({"20":false})` sends a CONTROL/CONTROL_NEW frame the fake decodes to `{ "20": false }`; fake pushes STATUS → `'dps'` event emitted.
  - client with wrong key on 3.4 → `connect()` rejects `TuyaKeyError`. Fake that never answers → `getDps()` rejects `TuyaTimeoutError` after `timeoutMs`.
  - light-dps: `dpsToLightState({"20":true,"21":"colour","22":1000,"24":"00f003e803e8"}, v2)` → `{ on:true, brightness:100, mode:'color', color:{r:255,g:0,b:0} }`; `lightPatchToDps({ brightness: 50 }, v2)` → `{"22": 505}` (10 + 0.5×990, rounded); `lightPatchToDps({ colorTempK: 2700 }, v2)` → `{"21":"white","23":0}`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Heartbeat every 10 s; a missed heartbeat reply → `'disconnected'`. 3.4/3.5 use `*_NEW` command codes.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(protocols): tuya discovery and client`.

---

### Task 5: Tuya cloud key sync client

**Files:**
- Create: `packages/protocols/src/tuya/cloud.ts`
- Test: `cloud.test.ts` (with `undici` `MockAgent` or `msw`)

**Interfaces:**
- Produces: `class TuyaCloud { constructor(opts: { accessId: string; accessSecret: string; region: 'us' | 'eu' | 'cn' | 'in'; fetchImpl?: typeof fetch }); listDevices(): Promise<TuyaCloudDevice[]> }` where `TuyaCloudDevice = { id: string; name: string; category: string; productId: string; localKey: string; ip?: string; dpSchema?: DpSchema }`. Errors: `TuyaCloudAuthError` (bad credentials), `TuyaCloudExpiredError` (code indicating the IoT Core trial lapsed).

- [ ] **Step 1: Failing tests:** request signing — given fixed `t=1700000000000`, `nonce=''`, accessId `"id"`, secret `"secret"`, `GET /v1.0/token?grant_type=1`, the `sign` header equals `sign` in `tuya-cloud-sign.json` (Task 2). `listDevices()` against mocked token + device-list + specification responses returns mapped devices with `localKey` and a `dpSchema` derived from the spec's DP codes (`switch_led`, `work_mode`, `bright_value(_v2)`, `temp_value(_v2)`, `colour_data(_v2)`). Mocked auth-failure response → `TuyaCloudAuthError`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement against the Tuya OpenAPI as used by tinytuya's `Cloud` class (token endpoint, device list, device specification); endpoints and region hosts copied from tinytuya, with a comment linking the source.
- [ ] **Step 4:** Run — PASS. Commit `feat(protocols): tuya cloud key sync`.

---

### Task 6: Kasa KLAP client and discovery

**Files:**
- Create: `packages/protocols/src/kasa/{klap.ts,client.ts,discovery.ts}`
- Test: `klap.test.ts`, `client.test.ts` (fake HTTP device server)

**Interfaces:**
- Produces:
  - `class KlapSession { constructor(opts: { ip: string; username: string; password: string; timeoutMs?: number; fetchImpl?: typeof fetch }); request<T>(json: object): Promise<T> }` — performs handshake1/handshake2 lazily and again on 403/session expiry. Error `KasaAuthError` when server hash doesn't match either auth-hash variant.
  - `class KasaClient { constructor(session: KlapSession); getSysInfo(): Promise<KasaSysInfo>; setRelay(on: boolean, childId?: string): Promise<void> }`, `KasaSysInfo = { deviceId: string; model: string; alias: string; children?: { id: string; alias: string; on: boolean }[]; on?: boolean }`.
  - `discoverKasa(timeoutMs: number, opts?: { bindAddress?: string }): Promise<{ ip: string; deviceId: string; model: string }[]>` — UDP 20002 probe, per python-kasa's `_DiscoverProtocol` v2 query.

- [ ] **Step 1: Failing tests:** using `kasa-vectors.json`, derived key/iv/sig and the encrypted request body match byte-for-byte; response body decrypts to the vector plaintext. Fake HTTP device implementing `/app/handshake1`, `/app/handshake2`, `/app/request?seq=` with the TP_SESSIONID cookie → `getSysInfo()` returns KP303-shaped data with 3 children; `setRelay(false, child2)` sends `{"context":{"child_ids":[child2]},"system":{"set_relay_state":{"state":0}}}`. Wrong password → `KasaAuthError`. Fake returns 403 once mid-session → client re-handshakes and succeeds.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement per python-kasa `KlapTransport` / `KlapTransportV2` (try v2 auth hash, fall back to v1).
- [ ] **Step 4:** Run — PASS. Commit `feat(protocols): kasa klap client`.

---

### Task 7: Govee LAN client

**Files:**
- Create: `packages/protocols/src/govee/client.ts`
- Test: `client.test.ts` (fake device on localhost UDP)

**Interfaces:**
- Produces: `class GoveeLan extends EventEmitter { constructor(opts: { bindAddress?: string; listenPort?: number /*4002*/; devicePort?: number /*4003*/; scanPort?: number /*4001*/; multicastAddress?: string }); start(): Promise<void>; stop(): Promise<void>; scan(): void; status(ip: string): Promise<LightState>; setOn(ip, on): Promise<void>; setBrightness(ip, pct): Promise<void>; setColor(ip, rgb: Rgb): Promise<void>; setColorTemp(ip, kelvin: number): Promise<void> }`. Event `'device'` with `{ ip, device: string /*MAC id*/, sku: string }`. Ports injectable for tests.

- [ ] **Step 1: Failing tests:** fake answers `scan` with `{"msg":{"cmd":"scan","data":{"ip":"127.0.0.1","device":"AA:BB","sku":"H618C"}}}` → `'device'` event; `status()` maps `{"onOff":1,"brightness":70,"color":{"r":155,"g":89,"b":255},"colorTemInKelvin":0}` → `{ on:true, brightness:70, mode:'color', color:{r:155,g:89,b:255} }`; `setColorTemp(ip, 3000)` sends `colorwc` with `colorTemInKelvin: 3000`; `status()` with no reply rejects after 3 s with `GoveeTimeoutError`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement (multicast via `setMulticastInterface(bindAddress)` + `addMembership`). **Step 4:** PASS. **Step 5:** Commit `feat(protocols): govee lan client`.

---

### Task 8: Database schema, config and secrets

**Files:**
- Create: `apps/server/prisma/schema.prisma`, `apps/server/src/{config.ts,secrets.ts,db.ts}`, `apps/server/test/helpers.ts`
- Test: `apps/server/test/secrets.test.ts`, `schema.test.ts`

**Interfaces:**
- Produces Prisma models (exact names used by later tasks):
  - `User { id String @id @default(cuid()); name String @unique; avatarColor String; role Role; pinHash String; failedPinCount Int @default(0); lockedUntil DateTime?; createdAt DateTime @default(now()) }`, `enum Role { ADMIN USER }`
  - `Session { id String @id @default(cuid()); tokenHash String @unique; userId String; shared Boolean; lastSeenAt DateTime; expiresAt DateTime }`
  - `Room { id String @id @default(cuid()); name String @unique; sortOrder Int }`
  - `Device { id String @id @default(cuid()); brand Brand; kind DeviceKind; externalId String; name String; model String?; ip String?; adopted Boolean @default(false); roomId String?; parentId String?; config Json; secret String?; status DeviceStatus @default(OK); lastSeenAt DateTime?; @@unique([brand, externalId]) }`, `enum Brand { TUYA KASA GOVEE }`, `enum DeviceKind { LIGHT SWITCH PLUG CAMERA UNKNOWN }`, `enum DeviceStatus { OK KEY_INVALID NEEDS_KEY NEEDS_CREDENTIALS }`
  - `DeviceGrant { userId String; deviceId String; @@id([userId, deviceId]) }` (cascade delete both sides)
  - `Setting { key String @id; value String }` (secret values encrypted)
- `config.ts`: `loadConfig(env = process.env): { databaseUrl: string; port: number; secretKey: Buffer; lanAddress?: string }` — throws listing every missing/invalid var.
- `secrets.ts`: `encryptSecret(plain: string, key: Buffer): string`, `decryptSecret(blob: string, key: Buffer): string`.
- `test/helpers.ts`: `resetDb(): Promise<PrismaClient>` (truncate all tables on `DATABASE_URL_TEST`).

- [ ] **Step 1: Failing tests:** encrypt→decrypt round-trip; two encryptions of the same plaintext differ; tampered blob throws. `loadConfig({})` throws mentioning `DATABASE_URL` and `SECRET_KEY`; `SECRET_KEY` not 32 bytes → throws. Creating two `Device`s with the same `(brand, externalId)` fails.
- [ ] **Step 2:** Create local DBs `home` and `home_test` (`psql -U postgres -c "create database home"`), run `pnpm prisma migrate dev --name init`. Tests FAIL before implementing config/secrets.
- [ ] **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(server): schema, config, secrets`.

---

### Task 9: Device manager, drivers and state cache

**Files:**
- Create: `apps/server/src/devices/{types.ts,manager.ts,state-cache.ts}`, `apps/server/src/devices/drivers/{tuya.ts,kasa.ts,govee.ts,fake.ts}`
- Test: `apps/server/test/device-manager.test.ts` (uses `FakeDriver`), `drivers-tuya.test.ts` (uses Task 4's fake device server)

**Interfaces:**
- Consumes: Tasks 3–8.
- Produces:
  - `type DeviceState = { online: boolean; light?: LightState; on?: boolean /* switch/plug */ }`
  - `type StatePatch = { on?: boolean; brightness?: number; color?: Rgb; colorTempK?: number }`
  - `type Discovered = { brand: Brand; externalId: string; ip: string; model?: string; kind?: DeviceKind; config?: Record<string, unknown>; children?: { externalId: string; name: string }[] }`
  - `interface Driver { brand: Brand; start(ctx: DriverContext): Promise<void>; stop(): Promise<void>; sync(devices: DeviceRecord[]): Promise<void> /* adopted devices with decrypted secrets */; setState(device: DeviceRecord, patch: StatePatch): Promise<void> }`
  - `interface DriverContext { discovered(d: Discovered): void; state(deviceId: string, s: DeviceState): void; status(deviceId: string, status: DeviceStatus): void; log: Pick<Console, 'info' | 'warn' | 'error'> }`
  - `type DeviceRecord = Device /* Prisma */ & { secretPlain?: string /* decrypted local key */ }`
  - `class DeviceManager { constructor(prisma, drivers: Driver[], pubsub: PubSub /* from graphql-subscriptions */, secretKey: Buffer); start(); stop(); getState(deviceId): DeviceState; setState(deviceId, patch): Promise<void> /* throws GraphQLError code DEVICE_UNREACHABLE | DEVICE_NOT_READY */; refresh(): Promise<void> /* re-sync drivers after adopt/remove/key change */ }`
  - PubSub topics: `DEVICE_STATE` payload `{ deviceId: string; state: DeviceState }`, `DEVICES_CHANGED` payload `{}`.
- Behavior pinned by tests:
  - Discovery of an unknown `(brand, externalId)` creates a non-adopted `Device` (Kasa children create child devices with `parentId`); a known one updates `ip`/`lastSeenAt` and, if `ip` changed, the manager calls `driver.sync` so it reconnects.
  - `setState` on a device whose driver throws timeout → device `online:false` published, error code `DEVICE_UNREACHABLE`, returns within 3.5 s.
  - Tuya driver: no local key → status `NEEDS_KEY`; `TuyaKeyError` → status `KEY_INVALID`, reconnect attempts for that device at most once per 60 s (fake timers). Kasa driver without TP-Link credentials → `NEEDS_CREDENTIALS`.
  - Tuya kind from cloud category: `dj`/`dd`/`fwd` → LIGHT, `kg`/`tdq` → SWITCH, `cz`/`pc` → PLUG, `sp` → CAMERA (camera devices are recorded but not controlled in Phase 1).

- [ ] **Step 1:** Write failing tests for each behavior above.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(server): device manager and drivers`.

---

### Task 10: Auth — PIN, sessions, lockout

**Files:**
- Create: `apps/server/src/auth/{pin.ts,sessions.ts,context.ts}`
- Test: `apps/server/test/auth.test.ts`

**Interfaces:**
- Produces: `hashPin(pin: string): Promise<string>`, `verifyPin(pin, hash): Promise<boolean>`; `login(prisma, userId, pin, shared: boolean): Promise<{ token: string; user: User }>` (throws `GraphQLError` codes `INVALID_PIN` with `extensions.attemptsLeft`, `LOCKED` with `extensions.retryAfterSeconds`); `resolveSession(prisma, token): Promise<{ user: User; session: Session } | null>` (slides `lastSeenAt`/`expiresAt`, rejects expired); `logout(prisma, token)`; `type Ctx = { user: User | null; isAdmin: boolean; prisma; manager: DeviceManager; pubsub }` built by `buildContext`.

- [ ] **Step 1: Failing tests:** valid PIN → token; PIN must match `/^\d{4,8}$/` on set; 5 wrong PINs → 6th attempt with the *correct* PIN throws `LOCKED` with `retryAfterSeconds` ≤ 60; after 60 s (fake clock) correct PIN works and counter resets; shared session unused for 3 min → `resolveSession` returns null; personal session after 3 min still valid; DB contains only the SHA-256 of the token.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(server): pin auth and sessions`.

---

### Task 11: GraphQL API and subscriptions

**Files:**
- Create: `apps/server/src/graphql/schema.graphql`, `resolvers/{auth.ts,devices.ts,rooms.ts,users.ts,integrations.ts,index.ts}`, `pubsub.ts`, `apps/server/src/{http.ts,main.ts}`
- Test: `apps/server/test/api.test.ts` (Apollo `executeOperation` + a real `graphql-ws` client against an ephemeral port, `FakeDriver`)

**Interfaces:**
- Produces the schema the web app codegens against:

```graphql
type User { id: ID!  name: String!  avatarColor: String!  role: Role! }
enum Role { ADMIN USER }
type Room { id: ID!  name: String!  sortOrder: Int! }
type Rgb { r: Int!  g: Int!  b: Int! }
type LightState { on: Boolean!  brightness: Int!  mode: String!  color: Rgb  colorTempK: Int }
type DeviceState { online: Boolean!  on: Boolean  light: LightState }
enum Brand { TUYA KASA GOVEE }
enum DeviceKind { LIGHT SWITCH PLUG CAMERA UNKNOWN }
enum DeviceStatus { OK KEY_INVALID NEEDS_KEY NEEDS_CREDENTIALS }
type Device { id: ID!  name: String!  brand: Brand!  kind: DeviceKind!  model: String  room: Room  parentId: ID  state: DeviceState!  status: DeviceStatus! }
type AdminDevice { id: ID!  name: String!  brand: Brand!  kind: DeviceKind!  model: String  ip: String  adopted: Boolean!  room: Room  parentId: ID  status: DeviceStatus!  hasKey: Boolean!  lastSeenAt: String }
type AuthPayload { token: String!  user: User! }
type IntegrationStatus { tuyaCloudConfigured: Boolean!  kasaConfigured: Boolean! }
type SyncResult { matched: Int!  unmatched: [String!]! }
input StatePatchInput { on: Boolean  brightness: Int  color: RgbInput  colorTempK: Int }
input RgbInput { r: Int!  g: Int!  b: Int! }

type Query {
  loginUsers: [User!]!            # public
  me: User
  rooms: [Room!]!
  devices: [Device!]!             # adopted + granted (all adopted for admin)
  adminDevices: [AdminDevice!]!   # admin
  users: [User!]!                 # admin
  grants(userId: ID!): [ID!]!     # admin
  integrations: IntegrationStatus! # admin
}
type Mutation {
  login(userId: ID!, pin: String!, shared: Boolean!): AuthPayload!
  logout: Boolean!
  setDeviceState(id: ID!, patch: StatePatchInput!): Device!
  createUser(name: String!, pin: String!, role: Role!, avatarColor: String!): User!
  updateUser(id: ID!, name: String, role: Role, avatarColor: String, pin: String): User!
  deleteUser(id: ID!): Boolean!
  setGrants(userId: ID!, deviceIds: [ID!]!): [ID!]!
  createRoom(name: String!): Room!
  updateRoom(id: ID!, name: String, sortOrder: Int): Room!
  deleteRoom(id: ID!): Boolean!
  adoptDevice(id: ID!, name: String!, roomId: ID, kind: DeviceKind): AdminDevice!
  updateDevice(id: ID!, name: String, roomId: ID, kind: DeviceKind): AdminDevice!
  removeDevice(id: ID!): Boolean!
  setTuyaCloud(accessId: String!, accessSecret: String!, region: String!): IntegrationStatus!
  syncTuyaKeys: SyncResult!
  setTuyaLocalKey(deviceId: ID!, localKey: String!): AdminDevice!
  setKasaCredentials(username: String!, password: String!): IntegrationStatus!
  addKasaByIp(ip: String!): AdminDevice!
}
type Subscription {
  deviceState: Device!     # filtered per user
  devicesChanged: Boolean! # list/grant/room changes; client refetches `devices`
}
```

- Rules: everything except `loginUsers`/`login` requires a session (`UNAUTHENTICATED`); admin-only fields throw `FORBIDDEN` for USER; `setDeviceState` on an ungranted device → `FORBIDDEN`; no field anywhere returns a local key, cloud secret, or TP-Link password; deleting the last ADMIN or demoting yourself as last ADMIN → `BAD_USER_INPUT`. If there are zero users at startup, `main.ts` creates `Admin` with PIN from env `BOOTSTRAP_ADMIN_PIN` (required in that case) and logs that it did.
- `deviceState` filter re-reads the user's grants on each event (no caching), so revocation applies instantly. WebSocket `onConnect` authenticates via `connectionParams.authToken`; expired shared sessions close the socket with code 4401.
- In production `http.ts` serves `apps/web/dist` with SPA fallback on the same port.

- [ ] **Step 1: Failing tests:** USER sees only granted devices in `devices`; USER calling `adminDevices` → `FORBIDDEN`; `setDeviceState` ungranted → `FORBIDDEN`; subscription: USER A granted d1, d2 not granted — FakeDriver emits d1 and d2 updates → A receives only d1; admin revokes d1 via `setGrants` → next d1 update not received; introspect every type and assert no field named like `/key|secret|password/i` except `hasKey`; `syncTuyaKeys` with a mocked `TuyaCloud` stores encrypted keys, sets status `OK`, returns `unmatched` for cloud devices never seen on LAN.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Manual check: `pnpm --filter @home/server dev` with real `.env`; within 30 s the admin `adminDevices` query lists ~16 Tuya devices and the KP303. Record the count in the commit message. Commit `feat(server): graphql api`.

---

### Task 12: Web foundation — Apollo, theme, login

**Files:**
- Create: `apps/web/src/{apollo.ts,theme.ts,main.tsx,App.tsx}`, `auth/{LoginScreen.tsx,PinPad.tsx,session.ts,useIdleLogout.ts}`, `apps/web/codegen.ts`
- Test: `auth/LoginScreen.test.tsx`, `auth/useIdleLogout.test.ts`

**Interfaces:**
- Consumes: Task 11 schema (codegen `client` preset from `apps/server/src/graphql/schema.graphql` → `src/gql/`).
- Produces: `session.ts`: `getToken()`, `setToken(t)`, `clearToken()`, `isSharedScreen()`, `setSharedScreen(b)` (localStorage; wrapped in try/catch). `apollo.ts`: `createApolloClient()` with HTTP link + `GraphQLWsLink` (split by operation), auth header/connectionParams from `getToken()`, and an error link that clears the token and routes to `/login` on `UNAUTHENTICATED` or WS close 4401. Routes: `/login`, `/` (dashboard), `/admin/devices|rooms|users|integrations` (admin-only guard).
- UI: dark MUI theme by default. Login = grid of avatar buttons from `loginUsers` → PIN pad (big 0–9 keys, backspace, auto-submit at 4+ digits on "OK"). Error states show "Wrong PIN — N tries left" / "Locked — try again in Ns". Settings icon on login screen toggles "This is a shared screen" (stored per browser).

- [ ] **Step 1: Failing tests (RTL + MockedProvider):** tapping a user then `1`,`2`,`3`,`4`,OK calls `login` with `{ userId, pin:'1234', shared:false }` and stores the token; `INVALID_PIN` with `attemptsLeft:2` shows "Wrong PIN — 2 tries left"; `useIdleLogout` with shared=true calls logout after 180 000 ms of no `pointerdown`/`keydown` (fake timers) and not when shared=false.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(web): login and apollo setup`.

---

### Task 13: Dashboard and device controls

**Files:**
- Create: `apps/web/src/dashboard/{Dashboard.tsx,DeviceTile.tsx,DeviceDialog.tsx,LightControls.tsx}`
- Test: `DeviceTile.test.tsx`, `Dashboard.test.tsx`

**Interfaces:**
- Consumes: `devices`, `rooms`, `setDeviceState`, `deviceState`, `devicesChanged`.
- Behavior:
  - Room tabs: "All" + rooms by `sortOrder` (only rooms containing visible devices). Responsive grid: 2 columns on phones, 3–4 on tablet, 6 on desktop.
  - Tile: name, room, state line ("Purple · 70%", "Warm · 40%", "On", "Off", "Offline"). Light tiles show a color dot in the current color (grey when off). Tap = toggle `on` (optimistic, reverted on error). Long-press or "⋯" opens `DeviceDialog`. Offline tiles are greyed and not toggleable. Status `KEY_INVALID`/`NEEDS_KEY` shows "Needs setup" (admins get a link to Devices).
  - `LightControls`: on/off switch, brightness slider (1–100, sends on release), color swatches (8 presets) + MUI-compatible color picker, white-temperature slider 2700–6500 K. Only controls the device supports are shown (Govee/Tuya lights: all; switch/plug: on/off only).
  - KP303 outlets appear as individual plug tiles named by their outlet alias.
  - Live: `deviceState` subscription updates the Apollo cache by `Device:id`; `devicesChanged` triggers refetch of `devices`.
  - Errors from `setDeviceState` show a snackbar: "Couldn't reach <name>".
- [ ] **Step 1: Failing tests:** tile renders "Purple · 70%" for `{r:155,g:89,b:255}`, 70% (color naming via nearest of a fixed named palette — pick 12 names); offline tile has `aria-disabled`; tapping an on light calls `setDeviceState(id, {on:false})` and shows Off immediately; mocked `DEVICE_UNREACHABLE` reverts to On and shows the snackbar; a subscription event changing brightness re-renders the tile.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(web): dashboard`.

---

### Task 14: Admin pages — devices, rooms, users, integrations

**Files:**
- Create: `apps/web/src/admin/{DevicesPage.tsx,RoomsPage.tsx,UsersPage.tsx,IntegrationsPage.tsx}`
- Test: `DevicesPage.test.tsx`, `UsersPage.test.tsx`

**Interfaces:**
- Consumes: admin queries/mutations from Task 11.
- Behavior:
  - **Devices:** two sections, "New on network" (not adopted) and "Your devices". Rows show brand, model, IP, status chip, last seen. Adopt dialog: name, room, kind. Per-device menu: rename, move room, set Tuya local key (password field, never prefilled), remove. "Add Kasa by IP".
  - **Rooms:** create, rename, reorder (up/down buttons), delete (devices become unassigned).
  - **Users:** list; create/edit (name, color, role, PIN — PIN field write-only); per-user grants editor: checklist of adopted devices grouped by room, with "all in room" toggles; save calls `setGrants`.
  - **Integrations:** Tuya cloud form (Access ID, Access Secret, region select) + "Sync keys from Tuya" button showing `matched` and listing `unmatched`; TP-Link credentials form. Status chips from `integrations`. Link text explains Tuya keys are pulled from the cloud only when you press sync.
- [ ] **Step 1: Failing tests:** adopting a "New on network" device calls `adoptDevice` and moves it to "Your devices" after refetch; grants editor "all in room" checks every device in that room and `setGrants` receives exactly those IDs; sync result `{matched: 14, unmatched: ['x']}` renders "14 devices updated" and lists `x`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(web): admin pages`.

---

### Task 15: Windows deployment and end-to-end check on real devices

**Files:**
- Create: `scripts/firewall.ps1`, `scripts/install-service.ps1`, `docs/RUNNING.md`
- Modify: root `package.json` (`build`, `start` scripts)

**Interfaces:**
- `firewall.ps1`: idempotent `New-NetFirewallRule` (Private profile) for inbound TCP 4000, UDP 6666, 6667, 7000, 4002, 20002, scoped to `node.exe` at the path printed by `(Get-Command node).Source`.
- `install-service.ps1`: builds (`pnpm build`), runs `prisma migrate deploy`, installs NSSM service `HomeControl` running `node apps/server/dist/main.js` with `AppDirectory` = repo root, env from `.env`, `Start=SERVICE_AUTO_START`, restart on exit after 5 s, stdout/stderr to `logs/` with rotation. Re-running updates the existing service.
- `RUNNING.md`: one-time setup (set network profile to Private, `.env`, create DBs, firewall, service, first login with `BOOTSTRAP_ADMIN_PIN`, Tuya cloud setup steps, TP-Link credentials, Govee LAN toggle + troubleshooting the multicast issue).

- [ ] **Step 1:** Write the scripts and docs.
- [ ] **Step 2:** Run both scripts as admin on the server PC. Expected: `Get-Service HomeControl` → `Running`; reboot → still `Running`; `Stop-Process` the node PID → service back within ~10 s.
- [ ] **Step 3: Real-device acceptance** from an Android phone browser at `http://<server-ip>:4000`:
  - Log in as admin; Integrations → Tuya sync → matched ≥ 14 of the 16 LAN Tuya devices (cameras may be listed but are not controlled).
  - Toggle and recolor one bulb of each Tuya version present (3.1, 3.3, 3.4, 3.5): the physical bulb changes within 1 s.
  - Change a bulb in the Smart Life app → tile updates within 2 s.
  - KP303: each of the 3 outlets toggles independently.
  - Unplug a bulb → tile shows Offline within 30 s; toggling shows "Couldn't reach …".
  - Create a USER with 2 granted lights; on a second browser marked as shared screen, that user sees only those 2; idle 3 min → back to picker.
  - Govee: if devices now respond, verify on/off/brightness/color on each; if not, record the outcome in `RUNNING.md` (Phase 1 is complete without Govee per the spec).
- [ ] **Step 4:** Commit `chore: windows service, firewall, runbook`.
