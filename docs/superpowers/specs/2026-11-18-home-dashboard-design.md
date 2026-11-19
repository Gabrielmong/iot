# Home dashboard and more widgets — design

## Intent

Today `/` is "All devices" on a computer and the room grid on a phone: everything, unordered by what matters. The household wants a **Home** page that is the default landing screen everywhere, showing only what each person chose to put there (devices from any room, plus widgets), so the first screen is calm and useful — a wall tablet, a phone glance. "All devices" stays, as its own page. More widgets make Home worth landing on.

This is project 1 of 2. Project 2 (later, its own design) is shared household timers with Firebase push notifications to phones, including the Timer widget.

## Goals

- `/` is **Home** on phone and computer. Home is curated: it shows only devices and widgets the person added.
- **New devices never appear on Home by themselves**; they show on All and their room as today.
- **All devices** moves to `/all` with its own menu entry; behaviour unchanged.
- On phones, the room grid moves to `/rooms` (a "Rooms" entry in the phone navigation); Home replaces it as the landing screen (see Phones below).
- Widgets get **instances with settings**: each placed widget has its own id and config, so several of one kind can sit on a tab (two cameras, three routine buttons).
- New widget kinds (below). Widgets can be placed on Home and on room tabs; All shows devices only plus the existing weather default.
- Each user has their own Home; an admin can save the default Home that users without their own start with (same mechanism as room tabs today).

## Non-goals

- Timers and phone notifications (project 2).
- Energy, presence, calendar, household board, camera motion events, travel time, weather alerts / air quality / radar (later projects).
- A PC widget: PCs are already devices with online state and Wake; they go on Home as device tiles.
- Changing the APK download flow.

## Anti-goals

- Home silently filling up with devices (defeats the point).
- A widget showing something the viewer can't access (a camera, routine or room they have no rights to).
- Breaking existing saved layouts for room tabs or All.

## Constraints

- Reuse the existing per-user, per-tab layout storage (`UserDashboardLayout` / `DefaultDashboardLayout`, JSON `items`) and arrange mode (`useArrange`, `reconcileLayout`, `SortableTile`). Home is the tab key `home`.
- Tile sizes stay 1×1, 2×1, 1×2, 2×2.
- Existing stored widget items (`{ widget: 'WEATHER' | 'SUN', size }`) must keep working.
- Small components, separation of concerns (repo norm).
- Access rules: users see only devices granted to them; guests can't control PCs; routines/cameras follow their existing visibility rules.

## Approaches considered

1. **Home as a layout tab, widgets as instances inside the layout JSON** *(chosen)* — Home is tab `home` in the existing tables; each widget item gets `id` (client-generated) and `config` (kind-specific JSON, validated on the server). Cheapest; reuses arrange mode, defaults, reset.
2. Separate `Widget` table referenced from layouts — cleaner for querying widgets across tabs, but no feature needs that, and it adds a migration and joins for nothing.
3. A distinct Home model separate from tabs — duplicates arrange/default/reset machinery.

Home curation differs from rooms in one rule only: **reconcile does not append unplaced devices on `home`** (rooms and All still do), and devices on Home may come from any room the user can see.

## Decided behaviour

### Home
- Route `/`. Header "Home" with **Edit Home** (enters arrange mode).
- Arrange mode on Home offers **Add device** (picker of all devices the user can see, grouped by room, excluding ones already on Home) and **Add widget** (kinds below; kinds that need a setting open a picker). Each tile has Remove (devices on Home are removed from Home only).
- A device removed from the system or no longer granted disappears from Home (existing reconcile drop rule).
- Empty Home: a short message and an **Add to Home** button that opens arrange mode.
- Default when the user has no Home layout and no admin default: Weather widget 2×1 (when weather is working) — otherwise empty state.
- Admins can "Save as default" for Home like other tabs; users can reset to default.

### All devices
- Route `/all`, menu entry "All devices". Same content and behaviour as today's All tab, including its saved layout (stored key stays `all`).
- `/rooms/all` redirects to `/all`.

### Navigation (desktop side menu)
Home (`/`), then All devices (`/all`) with the rooms listed under it as today, then the existing entries (Weather, Routines, Cameras, Admin). *(Designer's call.)*

### Phones
- Bottom/phone navigation gains **Rooms** (`/rooms`, the existing room grid). `/` is Home.
- The weather strip shows at the top of Home on phones unless Home already contains a Weather widget.

### Widgets
Each widget item: `{ id, widget: kind, size, config }`. Server validates kind, size and config shape; unknown kinds are rejected; duplicates are now checked by `id` (and still one item per device).

| Kind | Setting | Shows | Tap |
|---|---|---|---|
| WEATHER (existing) | — | as today | /weather |
| SUN (existing) | — | as today | /weather |
| ROUTINE | routine | Name and ▶; running state with Stop | runs / stops it |
| CAMERA | camera | Live view (low quality stream, muted) with name, **only while the tile is visible and the page is shown**; stops when off screen, on another page or when the screen sleeps | /cameras with that camera |
| ROOM | room | Room name, "2 lights on", count offline | opens the room |
| CLOCK | — | Time and date, large; seconds hidden | — |
| RAIN_SOON | — | "Rain likely around 3 PM (70%)" / "Raining now" / "No rain in the next 12 h", from the hourly forecast | /weather |
| MOON | — | Moon phase name and icon, daylight left today ("3 h 20 min of daylight left" / "Sunrise in 6 h") | — |
| OFFLINE | — | "All devices online" or "3 devices offline" with names (devices the viewer can see) | opens a dialog listing them, each linking to its device page |

- Widgets whose target is gone or not visible to the viewer (deleted routine, camera without access) are **hidden in normal view** and shown as a muted "Not available" tile only in arrange mode, where they can be removed. They are not dropped from the saved layout, so access returning restores them. This also covers widgets from an admin's default Home that a user can't see. *(Designer's call.)*
- **OFFLINE** counts devices the viewer can see that are adopted and not responding (`online` false). PCs are excluded (being off is normal), and so are devices still waiting on setup. It always covers the whole house, wherever it is placed. *(Designer's call.)*
- **RAIN_SOON** works from the existing hourly forecast only, no new Xweather data. "Rain" means an hour with a rain chance of 50% or more, or a RAIN / DRIZZLE / STORM condition; it names the first such hour in the next 12. *(Designer's call; finer "in ~40 min" timing needs minute data and is out of scope.)*
- **CAMERA streams are capped at 2 live tiles per screen**; further camera tiles show the camera name and a play button and start only when tapped (which stops the oldest live one). This protects cameras that allow few connections (Tuya). *(Decided with the user.)*
- **ROOM** offers any room the viewer can see, wherever it is placed. *(Designer's call.)*
- MOON and SUN use the home pin; without a pin they show "Set the home location" (admins) / are hidden (others), like SUN today. Moon phase is computed locally (suncalc), no API.
- RAIN_SOON needs weather working; otherwise hidden like WEATHER.
- Start sizes: ROUTINE 1×1, CAMERA 2×2, ROOM 1×1, CLOCK 2×1, RAIN_SOON 2×1, MOON 1×1, OFFLINE 1×1.
- Guests: can place widgets on their own Home; ROUTINE only offers routines they can run; CAMERA only cameras they can see.

## Left to the builder

- Exact copy for empty/edge states beyond the above, icons, and per-size content of each widget.
- Picker UI for widget settings (dialog vs menu).
- How the server validates config (per-kind schema) and how the web generates ids.
- Navigation component changes for the Rooms entry.
