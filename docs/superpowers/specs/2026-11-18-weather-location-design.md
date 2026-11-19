# Household Location, Weather Widgets and Weather Routines — Design

*Date: 2026-11-18 · Status: reviewed, awaiting approval · Builds on: dashboard layouts (2026-11-06-dashboard-layouts-design.md), routines (2026-11-09-routines-design.md, 2026-11-16-routines-calling-routines-design.md), admin settings (home name)*

## 1. Intent

The user added a Google Maps API key and an Xweather key to `.env`. They want the app to know where the house is and show the weather there: current temperature and conditions plus a forecast, on the desktop dashboard and on a phone home screen that shows information, not only navigation. They also want weather in routines ("seems fun"): routines timed by the sun and routines that check the weather.

## 2. Goals

1. **Household location (admin).** A Google map in Admin › Settings, with address search, where the admin drops a pin exactly on the house. One location for the whole household, stored like the home name.
2. **Weather service (server).** The server fetches current conditions and forecast for the pin from Xweather on a timer, caches the latest result, and pushes updates live. The Xweather key never leaves the server.
3. **Weather widgets as dashboard tiles.** Widgets live in the same grid as devices, with the same four sizes (1×1, 2×1, 1×2, 2×2), dragged and resized in arrange mode, saved per tab with the same admin-default + per-user-override rules.
   - Widget kinds in v1: **Weather** (now + forecast) and **Sun** (sunrise / sunset / daylight).
   - Content grows with size:
     ```
     Weather 1×1: ☀ 24°  Sunny            Sun 1×1: ↓ 17:42 (sunset next)
     Weather 2×1: 24° Sunny · H27 / L18 · 💧10%
     Weather 1×2: now + next 6 hours
     Weather 2×2: now + hourly strip + 5-day forecast
     ```
4. **Phone home.** The phone home (room-card grid) gets a compact weather strip above the room cards; tapping it opens a full **/weather** page (now, hourly, 5-day, sunrise/sunset). The same page is reachable from the side menu on desktop.
5. **Sun-timed schedules.** A routine schedule can be at a clock time (as now), **at sunrise** or **at sunset**, with an offset (e.g. "30 min before sunset").
6. **Weather conditions in routines.**
   - **"Continue only if" step (C):** one or more conditions, all must hold; otherwise the routine stops there (a normal, successful end, not a failure).
   - **"If" step (A):** one or more conditions (all must hold); if they hold, run routine X; otherwise run routine Y (optional). Branches are existing routines, reusing the ROUTINE step's call machinery and nesting limit.

## 3. Non-goals

- Weather **triggers** ("when it starts raining, run…"). Parked for later; the condition model is meant to be reusable for it.
- Steps nested inside an "If" (option B). Branches are always separate routines.
- OR / NOT combinations beyond what each condition's operator expresses; conditions in one step are ANDed.
- Indoor temperature/humidity sensors (none exist today).
- Weather maps/radar layers, severe weather alerts, air quality.
- More than one location, or per-user locations.
- Fahrenheit / imperial units (metric only: °C, km/h, mm).

## 4. Anti-goals

- **Leaking the house's location or keys.** Coordinates and the address are returned only to admins. Non-admins and guests get weather data, never lat/lng. The Xweather key never reaches a browser. The Maps key is only handed to admins, only when the map is opened.
- **Routines acting on stale or missing weather.** If there is no location or the cached weather is older than the staleness limit, a weather condition is "unknown": the routine records a problem ("Weather unavailable") and does not take either branch / does not continue. It must never silently treat unknown as true or false.
- **Burning the Xweather quota.** Fetching is server-side and on a timer, independent of how many screens are open. No per-client or per-routine calls.
- **A broken weather provider breaking the dashboard.** Widgets show "Weather unavailable" (with last-updated time if any cached data exists); device tiles and arrange mode keep working.
- **Changing everyday dashboard behaviour.** Device tiles, tap/long-press, glow and existing layouts behave exactly as now. Existing saved layouts keep working without migration of their meaning.

## 5. Constraints

- Monorepo: `apps/server` (Node, Apollo GraphQL `src/graphql/schema.graphql`, Prisma/Postgres, migrations in `apps/server/prisma/migrations`), `apps/web` (React 19, MUI 9, Apollo 4, framer-motion, Vite). Android app is a WebView of the web app, so "mobile" means the web app at phone width.
- Small files, one concern each (project rule).
- **Keys live in Admin › Integrations, not `.env`** (user decision). Existing integrations (Tuya, Kasa, Swann) store credentials encrypted in `Setting` rows via `writeEncryptedSettings` / `readEncryptedSettings` (`apps/server/src/services/settings-store.ts`, keys in `settings-keys.ts`) and are edited in `apps/web/src/admin/IntegrationsPage.tsx` sub-tabs (`apps/server/src/services/integrations.ts`). Xweather and Google Maps follow that pattern exactly. The `GOOGLE_API_KEY` / `XWEATHER_*` values the user put in the dev `.env` are not read by the app; they're just where the user will copy them from.
- **Xweather auth** uses a `client_id` + `client_secret` pair on each request.
- Both integrations are optional: unconfigured, the server runs normally and the related features show a clear "not configured" state (admins get a link to Integrations; others just see weather unavailable).
- Google Maps JS requires a billing-enabled project. The key must be restricted in Google Cloud to the Maps JavaScript + Places APIs and to HTTP referrers of the app (the server's LAN address, e.g. `http://192.168.0.100:<port>/*`; the Android WebView loads the same origin). Document this in `docs/RUNNING.md`.
- Routine schedules today are `minuteOfDay` in server local time (`apps/server/src/routines/schedule.ts`), checked each minute by `RoutineScheduler` (`scheduler.ts`). Steps are a JSON array of `SET | WAIT | ROUTINE` (`steps.ts`, `LIMITS.maxNesting = 3`).
- Dashboard layouts store `{ deviceId, size }` items (`apps/server/src/services/layout-items.ts`, GraphQL `LayoutItem`).
- Server local timezone is the house's timezone (the server PC is in the house).

## 6. Approaches considered

### 6.1 Weather conditions in routines (user picked A + C)

| | Approach | Trade-off |
|---|---|---|
| **A** | "If" step that runs another routine for yes / otherwise | Reuses ROUTINE calls; editor stays flat. Branches must be saved as separate routines. |
| B | "If" step with nested steps | Most flexible, everything in one routine; editor, live progress and engine all go recursive, ~2–3× the work. |
| **C** | "Continue only if" gate | Smallest; covers the common "only if" case; no "otherwise". |

**Picked: A + C**, because C covers most real cases cheaply and A gives true if/else without nesting.

### 6.2 Routine weather integration scope (user picked 1 + 2)

1. Sun-timed schedules — **picked**. 2. Weather conditions — **picked**. 3. Weather triggers — **deferred** (needs continuous watching and more provider calls).

### 6.3 Widgets placement

- Fixed strip outside the grid — simplest, but not arrangeable.
- **Widgets as grid tiles with device sizing — picked by the user** ("same sizing as the others").

### 6.4 Claude's calls (user did not object)

- **Weather fetch:** server polls on a timer (default every 15 min, set in `WeatherSettings`), caches the latest result in memory and in the DB (so a restart has data immediately), pushes it over a GraphQL subscription. Routines read the cache.
- **Maps key delivery:** stored encrypted with the integrations, served by the API to admins on demand, not baked into the Vite build.
- **Weather options in their own table (user decision):** a typed single-row `WeatherSettings` table rather than more `Setting` text rows, so the database enforces types.
- **Map library:** `@vis.gl/react-google-maps` (Google's official React wrapper) with Places autocomplete for address search.
- **Layout item shape:** an item is either a device or a widget kind; at most one of each widget kind per tab. No separate widget table.
- **Units:** metric.

## 7. Design

### 7.0 Storage

- **Integrations (encrypted `Setting` rows, existing pattern):** new keys in `settings-keys.ts`: `xweather.clientId`, `xweather.clientSecret`, `google.mapsApiKey`. Admin › Integrations gets **Xweather** and **Google Maps** sub-tabs built like the existing ones (save, show configured / not configured, never echo secrets back, a **Test** action: Xweather fetches current conditions for the saved location or a fixed sample point; Google Maps is validated client-side by loading the map). Saving or clearing Xweather credentials restarts the poller.
- **`WeatherSettings` table (new, one row, id fixed e.g. `"home"`):**
  - `lat Float?`, `lng Float?`, `address String?` — the household pin (null until set)
  - `refreshMinutes Int @default(15)` — validated 5–120
  - `staleMinutes Int @default(45)` — validated ≥ refreshMinutes, ≤ 720; older data is "unknown" to routines
  - `enabled Boolean @default(true)` — off stops polling; widgets/strip hide; weather conditions are unknown; sun times and sun schedules still work (they need only the pin)
  - `updatedAt DateTime @updatedAt`
- The last fetched snapshot is persisted separately (builder's choice of table/column), not mixed into this row's settings.

### 7.1 Household location

- Stored in the new `WeatherSettings` table (§7.0).
- GraphQL:
  - `weatherSettings: WeatherSettings` — admin only. `{ lat: Float  lng: Float  address: String  refreshMinutes: Int!  staleMinutes: Int!  enabled: Boolean! }`.
  - `updateWeatherSettings(input: WeatherSettingsInput!): WeatherSettings!` — admin only; validates lat/lng ranges and the minute limits.
  - `mapsApiKey: String` — admin only; the decrypted Google Maps key, null when not configured.
- Saving a new location triggers an immediate weather refresh.
- Web: `apps/web/src/admin/settings/` gets a `HomeLocationCard` next to `HomeNameForm`: address search box, map with a draggable pin (click map to move pin), coordinates shown read-only, Save / Cancel. Without a Maps key: a message linking to Integrations › Google Maps and, as a fallback, plain lat/lng fields so the feature still works.

### 7.2 Weather service (server)

- `apps/server/src/weather/`: small modules — Xweather client (fetch + map response to our types), poller (timer, backoff on error), cache/store, staleness check, sun times.
- Xweather endpoints: `conditions` (current, plus hourly next ~12h) and `forecasts` (daily, 5 days), metric fields. Exact endpoints/params are the builder's choice; at most a couple of requests per refresh.
- **Sun times are computed locally** from the pin (e.g. the `suncalc` package), not fetched — no quota, works offline, needed every day by the scheduler.
- Cached snapshot shape (exposed via GraphQL `weather: Weather`, any signed-in user incl. guests):
  - `updatedAt`, `stale: Boolean!`, `status` (OK / NO_LOCATION / NOT_CONFIGURED / ERROR)
  - `current { tempC feelsLikeC humidity windKph condition icon isDay precipMm }`
  - `hourly [{ time tempC condition icon rainChance }]`
  - `daily [{ date minC maxC condition icon rainChance }]`
  - `sun { sunrise sunset }` (today, local)
- `condition` is our own small enum (CLEAR, PARTLY_CLOUDY, CLOUDY, FOG, DRIZZLE, RAIN, STORM, SNOW, WINDY, UNKNOWN) mapped from Xweather codes; `icon` is our own icon key, not Xweather's image URL.
- Subscription `weatherUpdated: Weather`.
- Staleness: data older than `staleMinutes` (default 45) is `stale`. Stale data still displays (with "updated 1 h ago") but routine conditions treat it as unknown.
- Persist the last snapshot (Setting `weather.snapshot` or a tiny table) so restarts aren't blank.
- Admin › Settings: a **Weather** card under the map with enabled switch, refresh interval, stale-after, and status (last update, last error).

### 7.3 Widgets in dashboard layouts

- Server `LayoutItem` becomes `{ deviceId?: string; widget?: WidgetKind; size }`, exactly one of the two. `enum WidgetKind { WEATHER SUN }`. Validation: no duplicate device, no duplicate widget kind in a tab.
- GraphQL: `LayoutItem { deviceId: ID  widget: WidgetKind  size: TileSize! }`, input likewise. Existing stored items (device-only) stay valid unchanged.
- Filtering for access: widget items are visible to everyone; device items keep current filtering.
- **Default when a tab has no layout / items never placed:** the "All" tab shows the Weather widget first (2×1) once a location is set; room tabs show no widgets unless added. A widget removed in arrange mode stays removed (it is absent from the saved items; "never placed" is only the no-layout case).
- Arrange mode (`apps/web/src/dashboard/layout/`): an **Add widget** button opens a small picker of widget kinds not already in this tab; each widget tile in arrange mode has a remove (×) control. Device tiles keep having no remove.
- Normal mode: tapping a Weather or Sun widget opens `/weather`.
- Widget components under `apps/web/src/dashboard/widgets/` (one file per kind per concern; size-specific bodies).

### 7.4 Phone home and weather page

- Phone home (room grid, `apps/web/src/dashboard/rooms/RoomGrid.tsx`): a compact weather strip above the cards: icon, temp, condition, H/L, rain chance. Tap → `/weather`. Hidden when weather status is NOT_CONFIGURED or weather is disabled; shows "Set the home location in Settings" for admins when NO_LOCATION (nothing for others).
- `/weather` page: current conditions, hourly strip (12 h), 5-day list, sunrise/sunset, "updated n min ago". Side menu entry "Weather" (all roles).

### 7.5 Sun-timed schedules

- `RoutineSchedule` gains `anchor` (`CLOCK | SUNRISE | SUNSET`, default CLOCK) and `offsetMinutes` (−180…+180, default 0; SUN anchors only). `minuteOfDay` is used only for CLOCK. Migration adds the columns with defaults.
- GraphQL `RoutineSchedule` / input gain `anchor` and `offsetMinutes`; `time` stays required only for CLOCK.
- Scheduler: for each slot, a sun schedule's minute is computed from today's sun time for the pin (+ offset), then the existing `isDue` logic applies. No location → sun schedules never fire, and the routine editor/list shows "Needs the home location".
- Editor (`ScheduleRow.tsx`): a "At: time / sunrise / sunset" choice; for sun, an offset field ("30 min before / after"). List text e.g. "Sunset −30 min · Mon–Fri".

### 7.6 Weather conditions and the two new steps

- Condition `{ metric, op, value? }`, metrics v1:
  - `TEMP_C`, `FEELS_LIKE_C`, `HUMIDITY`, `WIND_KPH` — op `ABOVE | BELOW`, numeric value.
  - `RAINING_NOW` — op `IS | IS_NOT` (no value).
  - `RAIN_CHANCE_TODAY` (max of remaining hourly/daily chance today, %) — `ABOVE | BELOW`.
  - `SUN` — `IS_UP | IS_DOWN` (computed locally; never stale if location set).
- Steps (`apps/server/src/routines/steps.ts`): add
  - `{ kind: "CONTINUE_IF"; conditions: Condition[] }`
  - `{ kind: "IF"; conditions: Condition[]; thenRoutineId: string; elseRoutineId?: string }`
  - 1–5 conditions per step, ANDed. IF branches go through the same called-routine loading, access checks, cycle detection and `maxNesting` as ROUTINE steps.
- Run semantics:
  - CONTINUE_IF true → next step; false → run ends successfully with a note "Stopped: <condition> wasn't met".
  - IF true → run then-routine; false → run else-routine or nothing; then continue with the next step.
  - Any condition unknown (no location, not configured, stale) → record a run problem "Weather unavailable" and end the run (for both step kinds).
- **Run status (Claude's call):** "Weather unavailable" is a new `ProblemReason` (`WEATHER_UNAVAILABLE`); the run's status then follows the existing `outcome()` rules (FAILED or PARTIAL). A CONTINUE_IF that isn't met adds no problem: the status is whatever the steps before it earned (OK, or PARTIAL if earlier devices had problems).
- **Last run keeps the story (Claude's call):** `RoutineRun` gains a persisted `notes` JSON column (migration) holding IF outcomes ("If 28°+ → ran Cool down") and the stop reason ("Stopped: raining now wasn't met"). Exposed in GraphQL `RoutineRun.notes`, shown in live progress and last run; routine names in notes go through the same visibility filtering as `problem-view.ts`.
- `parseSteps` "must have a device or routine" rule: an IF step counts as having a routine.
- Editor: two new step cards ("Only continue if…", "If… then run… otherwise run…") with a condition list editor; IF reuses `RoutinePickerDialog`. Add-step menu gains both.
- Conditions are available to all roles that can edit routines; guests remain read-only.

### 7.7 Docs

- `docs/RUNNING.md`: enter Xweather and Google Maps credentials in Admin › Integrations; restrict the Google key in Google Cloud (Maps JavaScript + Places APIs, HTTP referrers of the app's LAN address); billing note.
- No new environment variables.

## 8. Left to the builder

- Exact Xweather endpoints/params and the code→condition mapping table.
- Icon set (MUI icons or a small custom set that fits the "house at night" theme).
- Where the weather snapshot is persisted (Setting vs table).
- Visual design of each widget size, the strip and the page, within the existing theme.
- Test strategy (follow the repo's existing server and web test patterns; Xweather client tested against recorded fixtures, never live).

## 9. Decisions from review

- **A stop inside a called routine stops only that routine.** If a "Continue only if" isn't met, or weather is unknown, inside a routine called by a ROUTINE step or an IF branch, only that called routine ends; the caller carries on with its next step (user, 2026-11-18). The note and any problem are still recorded on the top-level run.
- **Credentials live in Admin › Integrations** (encrypted, existing pattern), not `.env` (user, 2026-11-18). Xweather uses a separate client ID and secret.
- **Weather options get their own `WeatherSettings` table** (user, 2026-11-18).
- Automated tests use recorded Xweather fixtures only; a live check can be done by hand via the Integrations Test button.
