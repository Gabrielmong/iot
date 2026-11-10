# Admin Devices & Integrations Pages — Design

*Date: 2026-11-07 · Status: reviewed, awaiting approval · Builds on: the admin pages (`apps/web/src/admin/`), the UI polish pass (theme, framer-motion), and the dashboard layouts branch*

## 1. Intent

The admin **Devices** page is a long, plain list ("too simple"), and **Integrations** stacks every integration on one long page. With 25+ devices, finding one, spotting problems, or working out which new device is which is harder than it should be.

This redesigns both pages for scanning and management, and adds a **Test** switch for new devices so the admin can flick a device on and off before adopting it and see which physical device it is.

## 2. Goals

- **Devices page:**
  - New devices appear in a strip at the top. Each has a **Test** on/off switch and an **Adopt** button.
  - Adopted devices appear in a **sortable, filterable table** (user's choice B in the mockup) with search, and Room, Type and Status filters.
- **Test before adopting:** switch an un-adopted plug, switch or light on and off from the admin page. Where the server can't, the switch is **greyed out with the reason**.
- **Integrations page:**
  - One sub-tab per integration (Tuya cloud, TP-Link (Kasa), Swann recorder), each with its own URL and a status dot.
  - Each tab shows that integration's forms, the devices that use it, and when it last synced.
- **Look and feel:** both pages match the current theme (amber accent, 10px corners) and animation style.

## 3. Non-goals

- New management actions. Rename, move room, change type, set key, access and remove stay as they are, reached from the row's ⋯ menu.
- Bulk actions (multi-select, bulk move or remove).
- Controlling adopted devices from the admin table. The dashboard and details pages do that.
- Redesigning the Rooms or Users admin pages.
- New integrations.

## 4. Anti-goals

- **Test leaves a lasting trace:** Test must not adopt the device, create grants or layouts, show it on dashboards, keep a connection open past the trial, or otherwise change it beyond the on/off it was asked for.
- **Test reachable by non-admins:** it must not be available to users, or to devices that are already adopted. Adopted devices use the normal command path.
- **Hiding problem devices:** filters and sorting must never make it harder to see devices that are Offline or Need setup. Their count is always visible.
- **Breaking the phone view:** the table must not scroll sideways on a phone. It collapses to compact rows instead.

## 5. Constraints

- Monorepo:
  - `apps/web`: React 19, MUI 9, Apollo 4, framer-motion 14.6.0.
  - `apps/server`: GraphQL SDL in `src/graphql/schema.graphql`; Prisma/Postgres; drivers per brand in `src/devices/drivers`, orchestrated by `DeviceManager`.
- The server only commands adopted devices today (`src/devices/command-guard.ts`: "not adopted"). Drivers are only fed adopted devices.
- What each brand needs before it can be switched:
  - Tuya needs a local key, usually from the Tuya cloud sync.
  - Kasa may need TP-Link credentials.
  - Govee works over the LAN.
  - Cameras have nothing to switch.
- Commands have a 3 s timeout (`COMMAND_TIMEOUT_MS`).
- Project rule: small, single-purpose files. Pure logic goes in `lib/` with tests.
- Existing admin features and their tests keep working: adopt, the Kasa hint, Add Kasa by IP, the device menu actions and dialogs, and the integration forms.

## 6. Decisions made with the user

1. **Devices layout: option B,** a sortable table with filters, plus a "New on network" strip at the top.
2. **Test switch:** shown on every new device. It uses a **trial connection** (the user's idea of a temporary adoption, refined): an in-memory link that reads and switches the real state and ends on adopt, on leaving the page, or after 2 minutes without use. When the server can't switch it, it is **greyed out with the reason** (for example "Needs the Tuya key first", "Cameras can't be switched", "Device is offline").
3. **Integrations: one sub-tab per integration,** not all on one page.
4. **Each integration tab also shows** which devices use it and when it last synced.

## 7. Behaviour

### 7.1 Devices page (`/admin/devices`)

- **Toolbar:**
  - A search box matching name, model, address and room, case-insensitive.
  - Filters: Room (any room, or "No room"), Type (Light, Switch, Plug, Camera, Unknown) and Status (Online, Offline, Needs setup).
  - Status count chips, e.g. "Needs setup · 2" and "Offline · 1". Clicking a chip applies that status filter.
  - **Add Kasa by IP**.
- **New on network strip:** shown only when there are un-adopted devices. It is a responsive grid of compact cards. Each card shows:
  - kind icon, name, brand, model and address
  - the **Test** switch with its reason when disabled
  - **Adopt**, which opens the existing adopt dialog
- **Your devices table:**
  - **Status** (builder-check call): one value per device. **Needs setup** (any status other than OK, including Key invalid) wins. Otherwise the device is **Online** or **Offline** from the same live connection state the dashboard uses, so `AdminDevice` gains `online: Boolean!` from the state cache. This is read on load and refetch; there are no live updates on this page.
  - Columns: kind icon · Name · Room · Brand / model · Address · Status · Last seen · ⋯ (existing `DeviceMenu`).
  - Sorting: click a header to sort by it; click again to reverse. Default is Room, then Name.
  - Status shows as a coloured chip (Online green, Needs setup amber, Offline red).
  - Filters and search apply to the table. A "No devices match" row offers **Clear filters**.
- **Phone (xs):** each table row becomes a two-line row: icon and name with the status chip, then room · brand/model · last seen, with ⋯ at the end. Nothing scrolls sideways.
- **Motion:** rows fade and slide in on load. When filters or sorting change, rows animate to their new place with framer-motion layout. Toggling Test gives immediate optimistic feedback.

### 7.2 Test: a trial connection (server)

The user's idea, refined with them: Test makes a **trial connection**. The server links the un-adopted device to its driver as if it were adopted, **in memory only**, so the real state can be read and switched.

- **Nothing is persisted:**
  - no `adopted` flag, grants, layouts or `devicesChanged` publish
  - the device never appears on any dashboard or in `devices` / `device` queries
  - no `deviceState` events reach non-admins
- **API (admin only):**
  - `startDeviceTrial(id: ID!): DeviceTrial!` opens or renews a trial. It returns `{ deviceId, state: DeviceState }`, with the current state read through the driver (within the 3 s timeout).
  - `setTrialState(id: ID!, on: Boolean!): DeviceTrial!` switches the device on or off and returns the new state. It renews the trial.
  - `endDeviceTrial(id: ID!): Boolean!` drops the link.
  - All three reject adopted devices and untestable devices with BAD_USER_INPUT carrying the reason. A timeout returns the usual unreachable error.
- **The switch shows the real state** once the trial starts: a short loading state, then on or off. Lights only switch on or off.
- **A trial ends when:**
  - the admin adopts the device, in which case it continues as a normal adopted link
  - the client ends it (leaving the page, or unmounting the card)
  - it has had **2 minutes without use** (server-side idle timeout, as a backstop for closed tabs)
  - the device is removed or disappears
- **`AdminDevice` gains** `testable: Boolean!` and `testBlockedReason: String` (null when testable).
- **Reasons**, computed on the server, checked in this order (builder-check call). The copy is final:
  1. camera: "Cameras can't be switched"
  2. Tuya without a local key: "Needs the Tuya key first"
  3. Kasa that needs credentials that aren't set: "Needs TP-Link sign-in first"
  4. unknown kind: "This kind of device can't be switched"
  5. not seen in the last 5 minutes: "Device is offline"
- **Before the trial starts,** the switch shows Test as off and neutral (no state), with a "Test" label.
- **How a driver links a device only in memory, and how the manager keeps trial links apart from adopted ones, is left to the builder.** Trial links must never feed the adopted-device paths (anti-goal 4.1).

### 7.3 Integrations page (`/admin/integrations/:integration`)

- **Sub-tabs:** under the Admin tabs, `integration ∈ {tuya, kasa, swann}`, labelled "Tuya cloud", "TP-Link (Kasa)" and "Swann recorder". Each tab label has a status dot: green when configured, grey otherwise.
- **Routing:**
  - `/admin/integrations` redirects to the first integration that isn't configured, or to `tuya` when all are.
  - An unknown `:integration` redirects the same way.
- **Each tab, top to bottom:**
  1. A one-line description and the Configured / Not configured status.
  2. **Last synced:** relative time ("5 min ago"), or "Never".
     - Tuya: last successful key sync.
     - Kasa: when the credentials were last saved successfully.
     - Swann: last successful recorder probe or save.
  3. The existing form(s). Tuya keeps its credentials form and sync panel.
  4. **Devices using it:** a compact list of adopted devices of that brand, with name, room and status chip, each linking to `/devices/:id`. When there are none, it shows "No devices use this yet."
- **Server for last synced:**
  - `IntegrationStatus` gains `tuyaLastSyncAt`, `kasaLastSavedAt` and `swannLastSyncAt`, as nullable ISO strings.
  - They are stored as `Setting` rows next to the existing keys and updated by the existing sync, save and probe services on success.

## 8. Success looks like

- With 25 devices, the admin finds "Cámara Pepe" by typing "pepe", and sees at a glance that 2 devices need setup.
- A new Kasa plug appears. The admin flicks Test, hears the plug click, names it "Kettle" and adopts it.
- A new Tuya device without a key shows a greyed-out Test switch saying "Needs the Tuya key first".
- On the phone, the devices table is readable without sideways scrolling.
- Integrations opens on the integration that still needs setting up. Its URL can be bookmarked, and its tab shows its devices and when it last synced.

## 9. Left to the builder

- How a driver runs a one-off command for an un-adopted device (7.2), and the exact "not seen recently" threshold. A sensible default is no sighting in the last 5 minutes.
- Table implementation: plain MUI `Table` vs a library. Prefer plain MUI and small pure sort/filter functions in `lib/`.
- Whether search and filters persist in the URL query string. A nice-to-have, not required.
- Visual details within the existing theme.
- Test coverage:
  - unit tests for sort, filter, search and the status counts
  - resolver tests for `testable` / `testBlockedReason`, `testDevice` (admin only, adopted rejected, untestable rejected) and the last-synced timestamps
  - component tests for the table, the filters, the phone rows (via a narrow-render or role check), the disabled Test reason, and integration sub-tab routing
