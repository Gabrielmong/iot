# Household Location, Weather Widgets and Weather Routines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins pin the house on a Google map; the server polls Xweather for that pin and serves weather to dashboard widgets, a phone strip and a /weather page; routines gain sunrise/sunset schedules and "Continue only if" / "If" weather steps.

**Architecture:** New server module `apps/server/src/weather/` (Xweather client, settings table, poller with persisted snapshot, local sun times) exposed over GraphQL with a `weatherUpdated` subscription. Credentials join the existing encrypted-`Setting` integrations. Dashboard layout items become "device or widget". Routine steps gain two condition kinds evaluated against the cached weather; runs keep `notes` explaining branches and stops.

**Tech Stack:** TypeScript, Node, Apollo GraphQL, Prisma 7/Postgres, Vitest; React 19, MUI 9, Apollo Client 4, `@vis.gl/react-google-maps`, `suncalc`.

**Spec:** `docs/superpowers/specs/2026-11-18-weather-location-design.md`

## Global Constraints

- Small files, one concern each (project rule); follow existing patterns in neighbouring files.
- Credentials: Xweather client ID + secret and Google Maps key are stored encrypted in `Setting` rows (Admin › Integrations), never in `.env`; no new environment variables.
- Coordinates/address are returned only to admins; `weather` never includes lat/lng. Xweather credentials never leave the server; the Maps key only goes to admins via `mapsApiKey`.
- `WeatherSettings` defaults: `refreshMinutes` 15 (5–120), `staleMinutes` 45 (≥ refreshMinutes, ≤ 720), `enabled` true.
- Widget kinds: `WEATHER`, `SUN`; at most one of each per tab; same four sizes `S1x1 W2x1 T1x2 L2x2`. Default (tab "all", no saved layout, weather OK): Weather at `W2x1` first.
- Sun schedule offset −180…+180 minutes. Conditions per step 1–5, ANDed.
- Unknown weather (no location, not configured, disabled, stale) in a condition → problem `WEATHER_UNAVAILABLE`, that routine stops. A stop inside a called routine stops only that routine; the caller continues.
- Metric units only (°C, km/h, mm). Tests never call Xweather live (recorded fixtures).
- Each new migration needs `pnpm db:deploy` on the server PC (deployer runs it).

## Review Focus

1. **Pin moved after a fetch** → the old snapshot (other coordinates) must not be shown or used by routines; a refresh runs at once. Test in Task 4.
2. **Xweather errors (bad credentials, quota, network)** → last good reading stays visible, `status` ERROR with a message for admins, and it goes stale on schedule. Test in Task 4.
3. **Sun offset crossing midnight** (e.g. sunset +180 at a late sunset, sunrise −180) → that schedule simply isn't due that day; no throw. Test in Task 6.
4. **Saved layout with a widget while weather is disabled / unconfigured** → widget hidden outside arrange mode but kept in arrange mode, and saving does not drop it. Test in Task 13.
5. **An IF branch routine deleted later** → run records `ROUTINE_REMOVED` (like ROUTINE steps), editor shows the branch as removed and blocks saving until replaced. Tests in Tasks 9 and 16.

---

## File Map

Server (`apps/server/`):
- `src/weather/types.ts` — weather data types, fetcher type.
- `src/weather/xweather-codes.ts` — Xweather `weatherPrimaryCoded` → `WeatherCondition`.
- `src/weather/xweather-client.ts` — `fetchXweather` (real HTTP + response mapping).
- `src/weather/sun.ts` — local sunrise/sunset/isSunUp (suncalc).
- `src/weather/settings.ts` — `WeatherSettings` row read/validate/update.
- `src/weather/credentials.ts` — Xweather/Maps credentials in `Setting`.
- `src/weather/snapshot-store.ts` — persisted last reading.
- `src/weather/service.ts` — poller, state, publish.
- `src/weather/view.ts` — state → GraphQL `Weather`.
- `src/graphql/resolvers/weather.ts` — queries/mutations/subscription.
- `src/routines/conditions.ts` — parse/evaluate/describe conditions.
- Modify: `prisma/schema.prisma`, `src/settings-keys.ts`, `src/services/integrations.ts`, `src/services/deps.ts`, `src/services/layout-items.ts`, `src/services/dashboard-layouts.ts`, `src/routines/{steps,schedule,scheduler,runner,run-outcome,run-store,problem-view,run-service}.ts`, `src/graphql/{schema.graphql,routine-mappers.ts,pubsub.ts,resolvers/index.ts,resolvers/integrations.ts}`, `src/devices/topics.ts`, `src/main.ts`, `test/api-harness.ts`.

Web (`apps/web/src/`):
- `weather/` — `data/documents.ts`, `data/useWeather.ts`, `lib/conditionLook.ts`, `lib/format.ts`, `CurrentSummary.tsx`, `HourlyStrip.tsx`, `DailyList.tsx`, `SunTimesRow.tsx`, `WeatherIcon.tsx`, `WeatherStrip.tsx`.
- `pages/WeatherPage.tsx`.
- `dashboard/widgets/` — `WidgetTile.tsx`, `WeatherWidget.tsx`, `SunWidget.tsx`, `AddWidgetButton.tsx`, `widgetKinds.ts`.
- `admin/integrations/XweatherForm.tsx`, `admin/integrations/GoogleMapsForm.tsx`, `admin/settings/HomeLocationCard.tsx`, `admin/settings/LocationMap.tsx`, `admin/settings/WeatherOptionsCard.tsx`, `admin/data/useWeatherSettings.ts`.
- `routines/editor/` — `ConditionList.tsx`, `ConditionRow.tsx`, `ContinueIfStepCard.tsx`, `IfStepCard.tsx`, `SunScheduleFields.tsx`; `routines/list/RunNotes.tsx`; `routines/lib/describeCondition.ts`.
- Modify: `admin/lib/integrations.ts`, `admin/IntegrationsPage.tsx`, `admin/SettingsPage.tsx`, `dashboard/lib/{reconcileLayout,arrangeOps}.ts`, `dashboard/layout/useArrange.ts`, `dashboard/{DeviceGrid,Dashboard}.tsx`, `dashboard/layout/ArrangeGrid.tsx`, `dashboard/rooms/RoomGrid.tsx`, `layout/nav/navItems.ts`, `AppRoutes.tsx`, `routines/lib/{draft,draftOps,scheduleSummary,runProgress}.ts`, `routines/editor/{StepList,ScheduleRow}.tsx`.

Docs: `docs/RUNNING.md`.

Server test command: `pnpm --filter @home/server exec vitest run <file>`; web: `pnpm --filter @home/web exec vitest run <file>` (run `pnpm --filter @home/web codegen` after any schema change).

---

### Task 1: Weather types and Xweather client

**Files:**
- Create: `apps/server/src/weather/types.ts`, `apps/server/src/weather/xweather-codes.ts`, `apps/server/src/weather/xweather-client.ts`
- Create fixtures: `apps/server/test/fixtures/xweather-batch.json`, `apps/server/test/fixtures/xweather-error.json`
- Test: `apps/server/test/weather-xweather.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type WeatherCondition = "CLEAR" | "PARTLY_CLOUDY" | "CLOUDY" | "FOG" | "DRIZZLE" | "RAIN" | "STORM" | "SNOW" | "WINDY" | "UNKNOWN";
  export type CurrentWeather = { tempC: number; feelsLikeC: number; humidity: number; windKph: number; condition: WeatherCondition; isDay: boolean; precipMm: number; raining: boolean };
  export type HourlyWeather = { time: Date; tempC: number; condition: WeatherCondition; rainChance: number };
  export type DailyWeather = { date: string /* YYYY-MM-DD local */; minC: number; maxC: number; condition: WeatherCondition; rainChance: number };
  export type WeatherData = { current: CurrentWeather; hourly: HourlyWeather[]; daily: DailyWeather[] };
  export type WeatherReading = WeatherData & { fetchedAt: Date; lat: number; lng: number };
  export type XweatherCredentials = { clientId: string; clientSecret: string };
  export type LatLng = { lat: number; lng: number };
  export type WeatherFetcher = (creds: XweatherCredentials, at: LatLng) => Promise<WeatherData>;
  export class WeatherFetchError extends Error { constructor(message: string, readonly auth: boolean) }
  export function conditionFromCode(coded: string | null | undefined): WeatherCondition;  // xweather-codes.ts
  export const fetchXweather: WeatherFetcher;  // xweather-client.ts; optional 3rd param fetchImpl = globalThis.fetch for tests
  ```

- [ ] **Step 1: Record fixtures.** From the dev PC, call `https://data.api.xweather.com/batch/<lat>,<lng>?requests=/conditions%3Ffilter%3D1hr%26plimit%3D1,/forecasts%3Ffilter%3D1hr%26limit%3D12,/forecasts%3Ffilter%3Dday%26limit%3D5&client_id=…&client_secret=…` with the values from the dev `.env` (`XWEATHER_CLIENTID`, `XWEATHER_CLIENTSECRET`) and any nearby point; save the body as `xweather-batch.json` (it holds no credentials). Repeat with a wrong secret for `xweather-error.json`.
- [ ] **Step 2: Write failing tests** in `weather-xweather.test.ts`:
  - `conditionFromCode`: `"::CL"`→CLEAR, `"::FW"`/`"::SC"`→PARTLY_CLOUDY, `"::BK"`/`"::OV"`→CLOUDY, `":L:RW"`→RAIN, `"::R"`→RAIN, `"::L"`→DRIZZLE, `"::T"`→STORM, `"::S"`→SNOW, `"::F"`/`"::BR"`/`"::H"`→FOG, `"::WG"`→WINDY, `null`/`"xx"`→UNKNOWN (weather part = segment after the last `:`).
  - `fetchXweather` with a fake `fetchImpl` returning the batch fixture: one request; URL contains `client_id=` and `client_secret=` and the `lat,lng`; result has `hourly.length === 12`, `daily.length === 5`, numeric `current.tempC`, `current.raining === ["RAIN","DRIZZLE","STORM"].includes(current.condition)`; `rainChance` is the `pop` field.
  - Error fixture (`success:false`, `error.code` `invalid_client`) → rejects `WeatherFetchError` with `auth: true`; HTTP 500 → `WeatherFetchError` with `auth: false`; network rejection → `WeatherFetchError`.
- [ ] **Step 3: Run** `pnpm --filter @home/server exec vitest run test/weather-xweather.test.ts` → FAIL (modules missing).
- [ ] **Step 4: Implement** the three files. Map field names from the fixture (`tempC`, `feelslikeC`, `humidity`, `windSpeedKPH`, `weatherPrimaryCoded`, `isDay`, `precipMM`, `pop`, `maxTempC`, `minTempC`, `dateTimeISO`, `validTime`); daily `date` = first 10 chars of `dateTimeISO`. Error messages must never contain the credentials.
- [ ] **Step 5: Run** the test → PASS.
- [ ] **Step 6: Commit** `feat(server): Xweather client and weather types`.

### Task 2: Xweather and Google Maps integrations (server)

**Files:**
- Modify: `apps/server/src/settings-keys.ts`, `apps/server/src/services/integrations.ts`, `apps/server/src/services/deps.ts`, `apps/server/src/graphql/schema.graphql`, `apps/server/src/graphql/resolvers/integrations.ts`, `apps/server/test/api-harness.ts`, `apps/server/src/main.ts`
- Create: `apps/server/src/weather/credentials.ts`
- Test: `apps/server/test/api-weather-integrations.test.ts`

**Interfaces:**
- Consumes: Task 1 `XweatherCredentials`, `WeatherFetcher`, `WeatherFetchError`, `fetchXweather`.
- Produces:
  - `SettingKey.xweatherClientId = "xweather.clientId"`, `xweatherClientSecret = "xweather.clientSecret"`, `googleMapsApiKey = "google.mapsApiKey"` (all encrypted).
  - `credentials.ts`: `xweatherCredentials(deps: Pick<ServiceDeps,"prisma"|"secretKey">): Promise<XweatherCredentials | undefined>`, `googleMapsKey(deps): Promise<string | undefined>`, `setXweatherCredentials(deps, clientId: string, clientSecret: string): Promise<void>`, `setGoogleMapsKey(deps, apiKey: string): Promise<void>`.
  - `ServiceDeps.weatherFetch: WeatherFetcher`; `HarnessOptions.weatherFetch?: WeatherFetcher` (default rejects `new WeatherFetchError("no xweather in tests", false)`).
  - `IntegrationStatus` gains `xweatherConfigured: Boolean!`, `googleMapsConfigured: Boolean!`.
  - GraphQL: `setXweatherCredentials(clientId: String!, clientSecret: String!): IntegrationStatus!`, `setGoogleMapsKey(apiKey: String!): IntegrationStatus!`, `testXweather: Boolean!` (admin; fetches for the saved pin, else `9.93,-84.08`; failure → coded `XWEATHER_FAILED` with message "Xweather rejected the credentials" when `auth`, else "Couldn't reach Xweather"), `mapsApiKey: String` (admin; decrypted key or null).

- [ ] **Step 1: Failing API tests:** admin saves Xweather creds → `{ xweatherConfigured: true }`, stored row value doesn't contain the secret and decrypts to it; blank ID → BAD_USER_INPUT; non-admin → FORBIDDEN for all four operations; `mapsApiKey` null before, `"k-123"` after `setGoogleMapsKey(apiKey:"k-123")`; `testXweather` true with a fake fetch, `XWEATHER_FAILED` with an auth `WeatherFetchError`. (`testXweather` without a saved location uses the fallback point — assert the fake received `{lat:9.93,lng:-84.08}`; Task 3 adds the saved-pin case.)
- [ ] **Step 2: Run** `pnpm --filter @home/server exec vitest run test/api-weather-integrations.test.ts` → FAIL.
- [ ] **Step 3: Implement**; wire `weatherFetch: fetchXweather` in `main.ts`. Keep secrets out of logs/errors.
- [ ] **Step 4: Run** test and `test/api-integrations.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(server): Xweather and Google Maps integrations`.

### Task 3: WeatherSettings table and sun times

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (+ migration `weather_settings`), `apps/server/package.json` (add `suncalc`, dev `@types/suncalc`), `schema.graphql`
- Create: `apps/server/src/weather/settings.ts`, `apps/server/src/weather/sun.ts`, `apps/server/src/graphql/resolvers/weather.ts` (register in `resolvers/index.ts`)
- Test: `apps/server/test/weather-sun.test.ts`, `apps/server/test/api-weather-settings.test.ts`

**Interfaces:**
- Produces:
  - Prisma: `model WeatherSettings { id String @id @default("home"); lat Float?; lng Float?; address String?; refreshMinutes Int @default(15); staleMinutes Int @default(45); enabled Boolean @default(true); updatedAt DateTime @updatedAt }`.
  - `settings.ts`: `type WeatherOptions = { lat: number|null; lng: number|null; address: string|null; refreshMinutes: number; staleMinutes: number; enabled: boolean }`; `readWeatherOptions(prisma): Promise<WeatherOptions>` (defaults when no row); `updateWeatherOptions(prisma, input: WeatherOptions): Promise<WeatherOptions>` (validation below); `locationOf(o): LatLng | null`.
  - `sun.ts`: `sunTimes(day: Date, at: LatLng): { sunrise: Date | null; sunset: Date | null }` (null in polar day/night); `isSunUp(now: Date, at: LatLng): boolean`.
  - GraphQL: `type WeatherSettings { lat: Float lng: Float address: String refreshMinutes: Int! staleMinutes: Int! enabled: Boolean! lastError: String }`, `input WeatherSettingsInput { lat: Float lng: Float address: String refreshMinutes: Int! staleMinutes: Int! enabled: Boolean! }`, `weatherSettings: WeatherSettings!` (admin), `updateWeatherSettings(input: WeatherSettingsInput!): WeatherSettings!` (admin). `lastError` is null until Task 4.

- [ ] **Step 1: Failing tests.** `weather-sun.test.ts`: for San José (9.93, −84.08) on 2026-06-21 sunrise is between 05:10 and 05:30 local and sunset between 17:50 and 18:15 local (compute expectation with the test's TZ — set `process.env.TZ = "America/Costa_Rica"` in the file before imports, or compare against UTC 11:10–11:30 / 23:50–00:15); `isSunUp` true at 12:00 local, false at 00:00. `api-weather-settings.test.ts`: defaults `{refreshMinutes:15, staleMinutes:45, enabled:true, lat:null}`; save `{lat:9.93,lng:-84.08,address:"Casa",refreshMinutes:15,staleMinutes:45,enabled:true}` round-trips; lat 91 / lng −181 / only one of lat,lng / refreshMinutes 4 or 121 / staleMinutes < refreshMinutes or > 720 → BAD_USER_INPUT; USER and GUEST → FORBIDDEN on both. Extend `api-weather-integrations.test.ts`: `testXweather` uses the saved pin.
- [ ] **Step 2: Run** both → FAIL.
- [ ] **Step 3: Implement**; `pnpm --filter @home/server exec prisma migrate dev --name weather_settings`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): weather settings table and sun times`.

### Task 4: Weather service, snapshot and `weather` API

**Files:**
- Modify: `schema.prisma` (+ migration `weather_snapshot`), `src/services/deps.ts`, `src/devices/topics.ts`, `src/graphql/pubsub.ts`, `src/graphql/resolvers/weather.ts`, `schema.graphql`, `src/main.ts`, `test/api-harness.ts`
- Create: `src/weather/snapshot-store.ts`, `src/weather/service.ts`, `src/weather/view.ts`
- Test: `test/weather-service.test.ts`, `test/api-weather.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - Prisma: `model WeatherSnapshot { id String @id @default("home"); fetchedAt DateTime; lat Float; lng Float; data Json }`.
  - `snapshot-store.ts`: `loadSnapshot(prisma): Promise<WeatherReading | null>`, `saveSnapshot(prisma, r: WeatherReading): Promise<void>`.
  - `service.ts`:
    ```ts
    export type WeatherStatus = "OK" | "NO_LOCATION" | "NOT_CONFIGURED" | "DISABLED" | "ERROR";
    export type WeatherState = { status: WeatherStatus; reading: WeatherReading | null; stale: boolean; lastError: string | null; location: LatLng | null };
    export type WeatherFacts = { reading: WeatherReading | null /* null unless fresh, enabled, for the current pin */; location: LatLng | null; now: Date };
    export class WeatherService {
      constructor(deps: { prisma; secretKey: Buffer; fetch: WeatherFetcher; pubsub: PubSubEngine; now: () => Date; log: Pick<Console,"warn"|"error">; setTimer?: (fn: () => void, ms: number) => { cancel(): void } });
      start(): Promise<void>;   // loads options + snapshot, refreshes if due, arms timer
      stop(): void;
      refreshNow(): Promise<void>; // fetch once (if enabled+location+creds), save, publish
      reconfigure(): Promise<void>; // re-read options/creds, drop a snapshot whose lat/lng ≠ pin, refreshNow, re-arm
      state(): WeatherState;
      facts(): WeatherFacts;
    }
    ```
    `stale` = `now − fetchedAt > staleMinutes`. On fetch error keep the reading, set `status: "ERROR"`, `lastError` (message), log warn; next attempt at the normal interval.
  - `ServiceDeps.weather: WeatherService`; `updateWeatherSettings`, `setXweatherCredentials` call `deps.weather.reconfigure()`; `WeatherSettings.lastError` from `state()`.
  - Topic `WEATHER_UPDATED`; `publishWeatherUpdated(pubsub)`, `weatherUpdatedEvents(pubsub)`.
  - `view.ts`: `toApiWeather(state: WeatherState, opts: WeatherOptions, now: Date)`.
  - GraphQL:
    ```graphql
    enum WeatherStatus { OK NO_LOCATION NOT_CONFIGURED DISABLED ERROR }
    enum WeatherCondition { CLEAR PARTLY_CLOUDY CLOUDY FOG DRIZZLE RAIN STORM SNOW WINDY UNKNOWN }
    type CurrentWeather { tempC: Float! feelsLikeC: Float! humidity: Int! windKph: Float! condition: WeatherCondition! isDay: Boolean! precipMm: Float! }
    type HourlyWeather { time: String! tempC: Float! condition: WeatherCondition! rainChance: Int! }
    type DailyWeather { date: String! minC: Float! maxC: Float! condition: WeatherCondition! rainChance: Int! }
    type SunTimes { sunrise: String sunset: String }
    type Weather { status: WeatherStatus! updatedAt: String stale: Boolean! current: CurrentWeather hourly: [HourlyWeather!]! daily: [DailyWeather!]! sun: SunTimes }
    # Query: weather: Weather!  (any signed-in user incl. guests)   Subscription: weatherUpdated: Weather!
    ```
    `sun` is set whenever a location exists (even DISABLED / NOT_CONFIGURED); `current/hourly/daily` empty/null when DISABLED.
  - Harness: constructs `WeatherService` with `opts.weatherFetch` and a no-op `setTimer`; exposes `h.weather`.

- [ ] **Step 1: Failing unit tests** (`weather-service.test.ts`, fake fetch/clock/timer): no creds → NOT_CONFIGURED; creds but no pin → NO_LOCATION; disabled → DISABLED and fetch never called; OK path saves snapshot and publishes; restart (`new WeatherService` + `start`) shows the saved reading before any fetch; **Review Focus 1**: snapshot at (1,1) then pin moved to (2,2) → `reconfigure()` drops it (`state().reading` null until the new fetch resolves, `facts().reading` null) and fetches for (2,2); **Review Focus 2**: OK fetch then failing fetch → reading kept, status ERROR, `lastError` set, `stale` becomes true after `staleMinutes` and `facts().reading` null then; timer re-arms every `refreshMinutes`.
- [ ] **Step 2: Failing API tests** (`api-weather.test.ts`): GUEST can query `weather { status current { tempC } sun { sunset } }` and the response has no lat/lng fields in the schema (`__type(name:"Weather")` field names exclude `lat`,`lng`); `weatherUpdated` subscription fires after `updateWeatherSettings`.
- [ ] **Step 3: Run** both → FAIL.
- [ ] **Step 4: Implement**; migration `weather_snapshot`; in `main.ts` create the service before `RoutineService`, `await weather.start()`, `weather.stop()` on shutdown.
- [ ] **Step 5: Run** both + `test/api-weather-settings.test.ts` → PASS.
- [ ] **Step 6: Commit** `feat(server): weather polling service and weather API`.

### Task 5: Widget items in dashboard layouts (server)

**Files:**
- Modify: `src/services/layout-items.ts`, `src/services/dashboard-layouts.ts`, `src/graphql/resolvers/layouts.ts`, `schema.graphql`
- Test: `test/layout-items.test.ts`, `test/api-dashboard-layouts.test.ts`

**Interfaces:**
- Produces: `type WidgetKind = "WEATHER" | "SUN"`; `type LayoutItem = { deviceId: string; widget?: undefined; size: TileSize } | { widget: WidgetKind; deviceId?: undefined; size: TileSize }`; GraphQL `enum WidgetKind { WEATHER SUN }`, `type LayoutItem { deviceId: ID widget: WidgetKind size: TileSize! }`, `input LayoutItemInput { deviceId: ID widget: WidgetKind size: TileSize! }`. Resolver normalizes GraphQL nulls to absent keys.

- [ ] **Step 1: Failing tests:** item with both / neither → BAD_USER_INPUT "Each item needs a device or a widget"; duplicate widget kind → "Duplicate widget in layout"; a non-admin user's saved layout keeps `{widget:"WEATHER",size:"W2x1"}` items while still dropping devices they can't see; existing device-only stored JSON still reads back unchanged.
- [ ] **Step 2: Run** `vitest run test/layout-items.test.ts test/api-dashboard-layouts.test.ts` → FAIL.
- [ ] **Step 3: Implement** (`onlyVisible` keeps widget items).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): weather and sun widgets in dashboard layouts`.

### Task 6: Sun-timed schedules (server)

**Files:**
- Modify: `schema.prisma` (+ migration `schedule_sun_anchor`), `src/routines/schedule.ts`, `src/routines/scheduler.ts`, `src/routines/store.ts` (writes new fields), `src/graphql/routine-mappers.ts`, `schema.graphql`, `src/main.ts`
- Test: `test/routine-schedule.test.ts`, `test/routine-scheduler.test.ts`, `test/api-routines.test.ts`

**Interfaces:**
- Consumes: Task 3 `sunTimes`; Task 4 `WeatherService.facts().location`.
- Produces:
  - Prisma `enum ScheduleAnchor { CLOCK SUNRISE SUNSET }`; `RoutineSchedule.anchor ScheduleAnchor @default(CLOCK)`, `offsetMinutes Int @default(0)`.
  - `ScheduleInput = { time?: string | null; days: number[]; enabled?: boolean | null; anchor?: "CLOCK" | "SUNRISE" | "SUNSET" | null; offsetMinutes?: number | null }`; `Schedule` gains `anchor`, `offsetMinutes` (minuteOfDay = 0 for sun anchors).
  - `type SunMinutes = { sunrise: number | null; sunset: number | null }` (local minute of day); `scheduleMinute(s: Schedule, sun: SunMinutes | null): number | null` (null when sun anchor and no sun data, or result outside 0–1439); `isDue(s, slot, sun: SunMinutes | null)`.
  - `SchedulerDeps.sunMinutes: (day: Date) => SunMinutes | null`; main wires it from `weather.facts().location` + `sunTimes`.
  - GraphQL: `enum ScheduleAnchor`, `RoutineSchedule { time: String anchor: ScheduleAnchor! offsetMinutes: Int! days enabled }` (`time` null for sun), input gains `anchor: ScheduleAnchor`, `offsetMinutes: Int`; `time` optional, required for CLOCK.
- [ ] **Step 1: Failing tests:** `parseSchedules` — CLOCK without time → "Times must be HH:MM"; SUNSET with offset −30 ok; offset 181 → "Offsets must be −180 to 180 minutes"; `scheduleMinute` SUNSET 1065 with −30 → 1035; **Review Focus 3**: SUNSET 1380 +180 → null, SUNRISE 60 −180 → null; sun anchor with `sun = null` → null. Scheduler: a SUNSET schedule fires at the computed minute with injected `sunMinutes`, never when `sunMinutes` returns null. API: save and read back `{anchor:SUNSET, offsetMinutes:-30, time:null}`; existing clock schedules read back `anchor: CLOCK, offsetMinutes: 0`.
- [ ] **Step 2: Run** the three files → FAIL.
- [ ] **Step 3: Implement** + migration.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): sunrise and sunset routine schedules`.

### Task 7: Weather conditions (pure module)

**Files:**
- Create: `apps/server/src/routines/conditions.ts`
- Test: `apps/server/test/routine-conditions.test.ts`

**Interfaces:**
- Consumes: Task 1 `WeatherReading`; Task 3 `isSunUp`; Task 4 `WeatherFacts`.
- Produces:
  ```ts
  export type ConditionMetric = "TEMP_C" | "FEELS_LIKE_C" | "HUMIDITY" | "WIND_KPH" | "RAINING_NOW" | "RAIN_CHANCE_TODAY" | "SUN";
  export type ConditionOp = "ABOVE" | "BELOW" | "IS" | "IS_NOT" | "IS_UP" | "IS_DOWN";
  export type Condition = { metric: ConditionMetric; op: ConditionOp; value?: number };
  export type ConditionInput = { metric: string; op: string; value?: number | null };
  export const MAX_CONDITIONS = 5;
  export function parseConditions(input: ConditionInput[]): Condition[];
  export function evaluate(conditions: Condition[], facts: WeatherFacts): boolean | "UNKNOWN";
  export function describeConditions(conditions: Condition[]): string; // "temperature above 28° and raining now"
  ```
  Ops per metric: numeric metrics `ABOVE|BELOW` (strict) with value; `RAINING_NOW` `IS|IS_NOT` no value; `SUN` `IS_UP|IS_DOWN` no value. Ranges: TEMP_C/FEELS_LIKE_C −50…60, HUMIDITY & RAIN_CHANCE_TODAY 0…100, WIND_KPH 0…300. `SUN` needs only `facts.location` (unknown without it); the others need `facts.reading`. RAIN_CHANCE_TODAY = max `rainChance` of hourly entries on `now`'s local date at/after `now`, else `daily[0].rainChance`.
- [ ] **Step 1: Failing tests:** 0 or 6 conditions → "Add 1 to 5 conditions"; `RAINING_NOW` with `ABOVE` → "That check doesn't fit"; TEMP_C without value → "Enter a value"; 61 → range error; evaluate: temp 29 ABOVE 28 → true, 28 ABOVE 28 → false; two conditions one false → false; reading null with TEMP_C → "UNKNOWN"; SUN IS_DOWN with location and reading null at local midnight → true; rain chance picks max of remaining hours today; describe text for the pair above equals `"temperature above 28° and raining now"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): routine weather conditions`.

### Task 8: CONTINUE_IF and IF steps — storage and API

**Files:**
- Modify: `src/routines/steps.ts`, `src/routines/calls.ts` (only if it reads ROUTINE steps directly), `src/graphql/routine-mappers.ts`, `src/graphql/resolvers/routines.ts`, `schema.graphql`
- Test: `test/routine-steps.test.ts`, `test/routine-calls.test.ts`, `test/api-routines.test.ts`

**Interfaces:**
- Consumes: Task 7.
- Produces:
  - `RoutineStep` adds `{ kind: "CONTINUE_IF"; conditions: Condition[] }` and `{ kind: "IF"; conditions: Condition[]; thenRoutineId: string; elseRoutineId: string | null }`; `StepInput` adds `conditions?: ConditionInput[] | null; thenRoutineId?: string | null; elseRoutineId?: string | null`.
  - `stepRoutineIds` includes IF then/else ids (so access, loops and nesting checks apply unchanged); an IF step satisfies "Add a device or a routine".
  - GraphQL: `StepKind` adds `CONTINUE_IF IF`; `enum ConditionMetric`, `enum ConditionOp`, `type Condition { metric: ConditionMetric! op: ConditionOp! value: Float }`, `input ConditionInput { metric: ConditionMetric! op: ConditionOp! value: Float }`; `RoutineStep` adds `conditions: [Condition!]!  thenRoutineId: ID  thenRoutineName: String  elseRoutineId: ID  elseRoutineName: String` (names null when removed, hidden name as for ROUTINE); `RoutineStepInput` adds `conditions`, `thenRoutineId`, `elseRoutineId`.
- [ ] **Step 1: Failing tests:** IF without `thenRoutineId` → "Pick a routine to run"; IF whose then calls back to the saved routine → existing LOOP error; a personal routine's IF pointing at another user's personal routine → existing access error; API round-trip of both step kinds incl. `elseRoutineId: null`; routine with only a CONTINUE_IF → "Add a device or a routine".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (also `test/routine-models.test.ts`).
- [ ] **Step 5: Commit** `feat(server): Continue-only-if and If routine steps`.

### Task 9: Running condition steps, run notes

**Files:**
- Modify: `schema.prisma` (+ migration `routine_run_notes`), `src/routines/run-outcome.ts`, `src/routines/runner.ts`, `src/routines/run-store.ts`, `src/routines/problem-view.ts`, `src/routines/run-service.ts`, `schema.graphql`, `src/main.ts`, `test/api-harness.ts`
- Test: `test/routine-runner.test.ts`, `test/api-routine-runs.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 7, 8.
- Produces:
  - `ProblemReason` adds `"WEATHER_UNAVAILABLE"` (TS + GraphQL enum).
  - `type RunNote = { step: number; routineName: string | null; kind: "IF_MET" | "IF_NOT_MET" | "STOPPED"; conditions: string; ranRoutineName: string | null }`; `RunSnapshot.notes: RunNote[]`; Prisma `RoutineRun.notes Json @default("[]")`; `toSnapshot` defaults missing notes to `[]`; `markInterrupted` unchanged.
  - `RunnerDeps.weather: () => WeatherFacts`; `RoutineServiceOptions.weather: () => WeatherFacts` (main: `() => weather.facts()`; harness: `() => h.weather.facts()`).
  - Runner: `StepsResult = "done" | "aborted" | "halted"`. CONTINUE_IF true → next; false → note STOPPED, return "halted"; IF → note IF_MET/IF_NOT_MET with the branch's routine name, run the branch through `runRoutine` (same failure reasons, `actionCount` rules), no else → nothing; UNKNOWN (either kind) → `actionCount += 1`, problem `{deviceId:null, deviceName:null, reason:"WEATHER_UNAVAILABLE"}`, return "halted". `runRoutine` maps a callee's "halted" to "done"; `execute` treats top-level "halted" like "done" (outcome via existing `outcome()`).
  - GraphQL `type RunNote { step: Int! routineName: String kind: RunNoteKind! conditions: String! ranRoutineName: String }`, `enum RunNoteKind { IF_MET IF_NOT_MET STOPPED }`, `RoutineRun.notes: [RunNote!]!`; `viewRun` passes `routineName`/`ranRoutineName` through the same hidden-name rule.
- [ ] **Step 1: Failing runner tests:** CONTINUE_IF false after a SET → status OK, later steps not run, note STOPPED with `conditions` text; CONTINUE_IF false after a SET that had a problem → PARTIAL; unknown weather → problem WEATHER_UNAVAILABLE, later steps not run, routine whose only action is that condition → FAILED; IF met runs then-routine, not met runs else, not met without else runs nothing and continues; a CONTINUE_IF false inside a called routine stops only it and the caller's next step runs; **Review Focus 5**: IF branch routine missing → problem ROUTINE_REMOVED and the run continues. API test: last run persists notes; a viewer who can't see the branch routine sees "Another routine" in `ranRoutineName`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** + migration. **Step 4: Run** both + `test/routine-calls.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(server): run weather-condition steps and keep run notes`.

### Task 10: Integrations tabs for Xweather and Google Maps (web)

**Files:**
- Modify: `admin/lib/integrations.ts`, `admin/IntegrationsPage.tsx`, `admin/data/` (integrations query documents + new mutation hooks following `useSetKasaCredentials`)
- Create: `admin/integrations/XweatherForm.tsx`, `admin/integrations/GoogleMapsForm.tsx`
- Test: `admin/IntegrationsPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 GraphQL.
- Produces: `IntegrationSlug` adds `'xweather' | 'google-maps'`; `IntegrationInfo.brand` becomes `Brand | null` (null for these two; `IntegrationDevices` not rendered when null). `defaultIntegration` still prefers device integrations (Tuya/Kasa/Swann) first.
- [ ] **Step 1: Failing tests:** `/admin/integrations/xweather` shows Client ID + secret fields (secret write-only, cleared after save) and a "Test connection" button showing "Connected" / the error message; `/admin/integrations/google-maps` shows the key field and the restriction note text "Restrict this key to the Maps JavaScript and Places APIs and to this app's address."; neither tab renders the devices list.
- [ ] **Step 2: Run** `pnpm --filter @home/web codegen && pnpm --filter @home/web exec vitest run src/admin/IntegrationsPage.test.tsx` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): Xweather and Google Maps integration tabs`.

### Task 11: Household location and weather options (web, admin settings)

**Files:**
- Modify: `admin/SettingsPage.tsx`, `apps/web/package.json` (add `@vis.gl/react-google-maps`)
- Create: `admin/data/useWeatherSettings.ts`, `admin/settings/HomeLocationCard.tsx`, `admin/settings/LocationMap.tsx`, `admin/settings/WeatherOptionsCard.tsx`
- Test: `admin/settings/HomeLocationCard.test.tsx`, `admin/settings/WeatherOptionsCard.test.tsx`

**Interfaces:**
- Consumes: Task 3/4 `weatherSettings`, `updateWeatherSettings`; Task 2 `mapsApiKey`.
- Produces: `LocationMap({ apiKey, value: LatLng | null, onChange(v: LatLng, address?: string) })` — `APIProvider` + `Map` + draggable marker, click-to-move, address search via `useMapsLibrary('places')` Autocomplete on a TextField; default centre the saved pin, else `9.93,-84.08` zoom 8 (zoom 18 once a pin exists). `HomeLocationCard` loads `mapsApiKey`; null → message "Add a Google Maps key in Integrations" (link to `/admin/integrations/google-maps`) plus Latitude/Longitude number fields. Save sends the full `WeatherSettingsInput` (keeping current options).
- [ ] **Step 1: Failing tests** (mock `LocationMap` in the card test; never load Google in tests): without key shows the link and lat/lng fields, Save sends `{lat, lng, address:null, refreshMinutes:15, staleMinutes:45, enabled:true}`; Save disabled until changed; `WeatherOptionsCard` validates refresh 5–120 and stale ≥ refresh ≤ 720 inline, shows `lastError` and "Updated n min ago" from `weather.updatedAt`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): household location map and weather options`.

### Task 12: Weather data, display pieces and /weather page (web)

**Files:**
- Create: `weather/data/documents.ts`, `weather/data/useWeather.ts`, `weather/lib/conditionLook.ts`, `weather/lib/format.ts`, `weather/WeatherIcon.tsx`, `weather/CurrentSummary.tsx`, `weather/HourlyStrip.tsx`, `weather/DailyList.tsx`, `weather/SunTimesRow.tsx`, `pages/WeatherPage.tsx`
- Modify: `AppRoutes.tsx` (`/weather` for all signed-in users), `layout/nav/navItems.ts` (MAIN_LINKS: `{ to: '/weather', label: 'Weather', Icon: WbSunnyOutlined }` after Dashboard)
- Test: `weather/lib/format.test.ts`, `pages/WeatherPage.test.tsx`

**Interfaces:**
- Consumes: Task 4 GraphQL.
- Produces: `useWeather(): { weather: Weather | undefined; loading: boolean }` (query + `weatherUpdated` subscription writing the cache; background context like `useRefetchOnDevicesChanged`); `conditionLook(c: WeatherCondition, isDay: boolean): { label: string; Icon: SvgIconComponent }`; `formatTemp(c: number) → "24°"` (rounded); `formatUpdated(iso, now) → "Updated 5 min ago"`; components take plain props (`current`, `hourly`, `daily`, `sun`) so widgets reuse them.
- [ ] **Step 1: Failing tests:** `formatTemp(23.6) === "24°"`, `formatTemp(-0.4) === "0°"`; page with OK data shows current temp, 12 hourly items, 5 days, sunrise/sunset; `stale` shows "Updated 1 h ago" warning; NOT_CONFIGURED shows "Weather isn't set up" (admins get a link to Integrations); NO_LOCATION shows "Set the home location" (admins link to `/admin/settings`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): weather page`.

### Task 13: Widgets on the dashboard grid (web)

**Files:**
- Modify: `dashboard/lib/reconcileLayout.ts`, `dashboard/lib/arrangeOps.ts`, `dashboard/layout/useArrange.ts`, `dashboard/layout/ArrangeGrid.tsx` (+ `SortableTile.tsx` keying), `dashboard/DeviceGrid.tsx`, `dashboard/Dashboard.tsx`, `dashboard/layout/data/documents.ts`
- Create: `dashboard/widgets/widgetKinds.ts`, `dashboard/widgets/WidgetTile.tsx`, `dashboard/widgets/WeatherWidget.tsx`, `dashboard/widgets/SunWidget.tsx`, `dashboard/widgets/AddWidgetButton.tsx`
- Test: `dashboard/lib/reconcileLayout.test.ts`, `dashboard/lib/arrangeOps.test.ts`, `dashboard/layout/ArrangeMode.test.tsx`, `dashboard/widgets/WeatherWidget.test.tsx`

**Interfaces:**
- Consumes: Task 5 GraphQL; Task 12 `useWeather` and display pieces.
- Produces:
  - `LayoutEntry = { deviceId: string; size: TileSize } | { widget: WidgetKind; size: TileSize }`; `ArrangedTile = { key: string; size: TileSize } & ({ device: Device } | { widget: WidgetKind })`; `entryKey(e: LayoutEntry): string` (`deviceId` or `` `widget:${kind}` ``); arrange ops (`moveEntry`, `moveEntryBy`, `resizeEntry`) take keys; new `addWidget(entries, kind)` (prepends at `W2x1` for WEATHER, `S1x1` for SUN) and `removeWidget(entries, kind)`.
  - `reconcileLayout(entries, devices, defaults: readonly LayoutEntry[] = [])` — `defaults` used only when `entries` is undefined; `Dashboard` passes `[{widget:'WEATHER',size:'W2x1'}]` for tab `all` when `weather.status` is OK or ERROR.
  - `useArrange` adds `addWidget(kind)`, `removeWidget(kind)`; `AddWidgetButton` (in `ArrangeBar` area) lists kinds not in the tab; widget tiles in arrange mode show a remove (×) button with aria-label "Remove Weather widget".
  - `WidgetTile` dispatches by kind; normal-mode tap navigates to `/weather`. Body per size per spec (1×1: icon+temp+label; 2×1: + H/L + rain chance; 1×2: + next 6 hours; 2×2: + hourly strip + 5 days). Sun: next event large, the other small; larger sizes add daylight length.
  - Outside arrange mode, `DeviceGrid` skips widget tiles when `weather.status` is NOT_CONFIGURED or DISABLED (SUN still shows when `sun` is set).
- [ ] **Step 1: Failing tests:** reconcile keeps widget entries regardless of devices and applies defaults only for undefined entries; key-based move/resize work on a widget tile; `addWidget` refuses a duplicate kind; arrange mode: add Weather, save → mutation items include `{widget:'WEATHER', size:'W2x1', deviceId: null}` (or absent — match generated input type); remove widget then save excludes it; **Review Focus 4**: saved layout with WEATHER while status DISABLED → hidden in normal mode, visible in arrange mode, and save keeps it; WeatherWidget renders "24°" and "Sunny" at 1×1 and 5 day rows at 2×2.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** these + `dashboard/DeviceGrid.test.tsx`, `dashboard/Dashboard.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(web): weather and sun widgets on the dashboard`.

### Task 14: Phone weather strip (web)

**Files:**
- Create: `weather/WeatherStrip.tsx`
- Modify: `dashboard/rooms/RoomGrid.tsx`
- Test: `weather/WeatherStrip.test.tsx`

**Interfaces:**
- Consumes: Task 12.
- Produces: `WeatherStrip()` — one tappable row (icon, temp, label, H/L, rain chance) linking to `/weather`; renders nothing for NOT_CONFIGURED/DISABLED or while loading; NO_LOCATION shows "Set the home location" link for admins, nothing for others. Rendered above the room cards in `RoomGrid`.
- [ ] **Step 1: Failing tests** for the four states and the link target.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): weather strip on the phone home`.

### Task 15: Sun schedules in the routine editor (web)

**Files:**
- Modify: `routines/lib/draft.ts` (`DraftSchedule` + to/from input), `routines/lib/scheduleSummary.ts`, `routines/editor/ScheduleRow.tsx`
- Create: `routines/editor/SunScheduleFields.tsx`
- Test: `routines/lib/scheduleSummary.test.ts`, `routines/lib/draft.test.ts`, `routines/editor/RoutineEditor.test.tsx`

**Interfaces:**
- Consumes: Task 6 GraphQL.
- Produces: `DraftSchedule = { key; anchor: ScheduleAnchor; time: string; offsetMinutes: number; days; enabled }` (time kept for switching back, sent only for CLOCK). `ScheduleRow` gets an "At" select (Time / Sunrise / Sunset); sun shows `SunScheduleFields` (minutes 0–180 + Before/After). Summary: `"Sunset −30 min · Mon–Fri"`, `"Sunrise · Every day"`. When `useWeather().weather.sun` is null, sun rows show "Needs the home location".
- [ ] **Step 1: Failing tests** for summary strings, draft round-trip (SUNSET −30 → input `{anchor:'SUNSET', offsetMinutes:-30, time:null}`), editor switch Time→Sunset hides the time field.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): sunrise and sunset schedules in the routine editor`.

### Task 16: Condition steps and run notes in the routine UI (web)

**Files:**
- Modify: `routines/lib/draft.ts`, `routines/lib/draftOps.ts`, `routines/lib/draftErrors.ts`, `routines/lib/runProgress.ts`, `routines/editor/StepList.tsx` (add-step menu + cards), `routines/data/documents.ts`
- Create: `routines/lib/describeCondition.ts`, `routines/editor/ConditionList.tsx`, `routines/editor/ConditionRow.tsx`, `routines/editor/ContinueIfStepCard.tsx`, `routines/editor/IfStepCard.tsx`, `routines/list/RunNotes.tsx`
- Test: `routines/lib/describeCondition.test.ts`, `routines/lib/draft.test.ts`, `routines/lib/draftErrors.test.ts`, `routines/editor/StepList.test.tsx`, `routines/list/RunNotes.test.tsx`

**Interfaces:**
- Consumes: Tasks 8–9 GraphQL; existing `RoutinePickerDialog`.
- Produces: `DraftStep` adds `{ kind: 'CONTINUE_IF'; conditions: DraftCondition[] }` and `{ kind: 'IF'; conditions: DraftCondition[]; thenRoutineId: string | null; thenRoutineName: string | null; elseRoutineId: string | null; elseRoutineName: string | null }`, `DraftCondition = { key; metric: ConditionMetric; op: ConditionOp; value: number | null }`. Card titles: "Only continue if…" and "If… then run… otherwise run…". `ConditionRow`: metric select (Temperature, Feels like, Humidity, Wind, Raining now, Chance of rain today, Sun), op select limited to that metric, number field with unit (°, %, km/h) when numeric. New step default condition: Temperature above 25. `describeCondition` mirrors the server's text. `RunNotes` lists notes under last run / live progress: "If temperature above 28° → ran Cool down", "Stopped: raining now wasn't met".
- [ ] **Step 1: Failing tests:** add-step menu offers both new kinds; IF without then-routine → draft error "Pick a routine to run"; **Review Focus 5**: an IF whose `thenRoutineName` is null shows "Removed routine" and blocks save with "Replace the removed routine"; condition op list for "Raining now" is Is / Is not; draft → input round-trip for both kinds; RunNotes texts above; a run with problem `WEATHER_UNAVAILABLE` shows "Weather unavailable".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** these + `routines/editor/RoutineEditor.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(web): weather condition steps and run notes in routines`.

### Task 17: Docs and full verification

**Files:**
- Modify: `docs/RUNNING.md`

- [ ] **Step 1:** Add a "Weather and maps" section: enter Xweather client ID/secret under Admin › Integrations › Xweather and use Test connection; Google Maps key under Integrations › Google Maps; in Google Cloud enable billing, restrict the key to Maps JavaScript API + Places API and HTTP referrers `http://192.168.0.100:*/*` (and the dev address); set the pin and options in Admin › Settings; new migrations are applied by `pnpm db:deploy`.
- [ ] **Step 2: Run** `pnpm test` from the repo root → all pass (note known flaky: GroupDialogs "keeps the current view", api-tuya-quiet "overlapping syncs" — rerun alone if they fail).
- [ ] **Step 3: Run** `pnpm build` → succeeds.
- [ ] **Step 4: Commit** `docs: weather and maps setup`.
