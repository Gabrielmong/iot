# Routines — Design

*Date: 2026-11-09 · Status: reviewed, awaiting approval · Builds on: the dashboard (`apps/web/src/dashboard/`), device commands (`DeviceManager.setState`), device grants, and the "All off" button (commit 932ff2e)*

## 1. Intent

Today every device is switched by hand, one tile at a time. "All off" helped with the most common case, but the user wants Alexa-style **routines**: a named button that puts a group of devices into chosen states, for example "Movie night": floor lamp on at 20% warm white, TV plug on, kitchen lights off. A routine can also run steps over time ("…wait 45 min, then lamp off") and can start by itself at set times on chosen weekdays.

The admin can share routines with chosen users, for example a default routine for a room. Regular users can build their own private routines from the devices they have access to.

## 2. Goals

- One tap on a routine button applies it. Devices in the same step change **at the same moment** (commands go out in parallel, not one after another).
- Routines are made of ordered **steps**:
  - **Set devices**: a list of devices, each with its own target settings. All of them are applied together.
  - **Wait**: a delay before the next step.
- Per-device settings use whatever the device supports. Plugs and switches get **power** only. Govee/Tuya lights get **power, brightness, and either an RGB color or a white temperature**. Any setting left untouched is left as it is.
- **Schedules:** each routine can have zero or more triggers, each one a **time of day plus a set of weekdays** (e.g. 7:00 Mon–Fri). Schedules run on the server, so they fire even when no app is open.
- **Ownership and visibility:**
  - Any user can create **personal** routines. Only they see them, and they can only include devices they have a grant for.
  - The admin can create **shared** routines and picks which users see them. Those users can run a shared routine but not edit it.
  - The admin can see, edit and delete every routine, including other users' personal ones.
- **Where they appear:** each routine is tagged with a room or with **Whole house**. A room tab on the dashboard shows that room's routines as a row of buttons under the tabs. **All** shows every routine the user can see. (The user chose option B in the mockups.)
- A **Routines page** (in the app header, for everyone) lists routines and is where you create, edit, delete, and enable or disable schedules.
- A **routine editor** (accepted mockup, kept at `.superpowers/brainstorm/112-1794239538/content/routine-editor.html`) has a name, a "Show on" room picker, a step list (add Set devices / Wait, drag to reorder), schedule rows, a "Who can see it" checklist (admin, shared routines only), **Try it**, and **Save**. Editing a device in a step opens a panel with the same controls as the device details page.
- The button shows run feedback: *running…* while active (including during waits), then ✓, or ⚠ when some devices failed or were skipped, with their names available.

## 3. Non-goals

- Voice control (the user explicitly deferred it).
- Sunrise/sunset or other astronomical triggers. The user said time plus weekdays is enough for now.
- Triggers from device events ("when the door opens…"), conditions, and if/else logic.
- Cameras in routines (nothing to set).
- Run history beyond the **last run** of each routine.
- Routine tiles inside the device grid, or arranging routine buttons (options A and C were rejected).
- Catching up on schedules missed while the server was down.

## 4. Anti-goals

- **A routine handing out control the admin didn't intend.** A personal routine can never act on a device its owner doesn't have a grant for at run time, even if the routine was saved while they had it. Only the admin can make shared routines.
- **One dead device spoiling the routine.** A failed or unreachable device never stops the other devices in its step or later steps.
- **Two copies of one routine fighting.** A routine runs at most once at a time.
- **Devices changing one by one in a visible wave.** Commands within a step are issued concurrently.
- **Breaking the everyday dashboard.** Tiles, All off, Arrange and the room tabs keep working exactly as now, and with no routines the dashboard looks unchanged.

## 5. Constraints

- Stack as in the rest of the project: `apps/server` (Apollo GraphQL, `src/graphql/schema.graphql`, Prisma on Postgres, migrations under `apps/server/prisma/migrations`) and `apps/web` (React 19, MUI, Apollo client, codegen, framer-motion).
- Device commands go through `DeviceManager.setState(deviceId, patch)` (`apps/server/src/devices/manager.ts`). It enforces readiness and timeouts, and throws `DEVICE_UNREACHABLE`, `DEVICE_NOT_READY` or `NOT_FOUND`. Patch shape and validation: `parseStatePatch` in `apps/server/src/services/state-patch.ts` (`on`, `brightness` 0–100, `color` RGB, `colorTempK` 1000–10000).
- Access rule: `canAccessDevice` in `apps/server/src/services/grants.ts` (admin: everything; user: granted devices only).
- What a device supports: `lightCapabilities` and `isSwitchable` in `apps/web/src/dashboard/lib/capabilities.ts`. The server must enforce the same rule when saving.
- Power-strip parents are hidden when their outlets are shown (`visibleTiles`), so routines offer the same visible devices as the dashboard.
- Project rule: small files and components, one concern each. Pure logic goes in `lib/` with tests.
- LAN-only, single server PC, no remote. Scheduled times use the **server PC's local time zone**.

## 6. Decisions made with the user

1. A tap runs a routine. Devices in a step should change at the same time where possible.
2. Steps over time are in scope (Set devices / Wait).
3. Schedules: a time of day on chosen weekdays. No sunrise/sunset for now.
4. Admin can do anything. Users build personal routines for themselves. Admin builds shared ("default") routines, can tag them to a room, and chooses who sees them.
5. Dashboard placement: option B. Routines are tagged to a room or Whole house and follow the room tab; All shows all of them.
6. The routine editor mockup was accepted as shown.
7. **Whole house routines appear only under All**, not on every room tab.
8. **A running routine keeps going when someone touches its devices.** If someone taps All off or switches a device by hand during a Wait, the routine's later steps still run, as Alexa does. All off and manual commands have no link to the run registry.

## 7. Calls I made (not discussed; flagged for review)

1. **A shared routine runs fully for anyone it's shared with**, including devices that user has no grant for. Sharing is the admin's permission. (The stricter alternative would be to skip ungranted devices.)
2. **Personal routines are filtered at run time.** Devices the owner no longer has a grant for are skipped and reported as "skipped: no access". The editor marks such entries with a warning, and the owner can remove them.
3. **The admin's own routines** are personal unless the admin marks them shared. A shared routine with nobody ticked is visible only to the admin.
4. **The dashboard row** shows the user's own routines plus shared routines they can see. The admin's dashboard does *not* show other users' personal routines. Those appear only on the Routines page, in an "Other users" section.
5. **The room tag only decides where the button appears.** It does not limit which devices a routine may use, and it does not hide the routine from users without access to that room. A routine tagged with a room the user has no tab for (no visible devices there) still appears under All. If a room is deleted, its routines become Whole house.
6. **Re-running restarts.** Tapping a routine that is mid-run (e.g. during a Wait) cancels the current run and starts again from step 1. The Routines page has a **Stop** action for a running routine. A schedule firing while the routine is running also restarts it.
7. **Runs live in server memory.** If the server restarts mid-run, that run is abandoned. Its last run is recorded as "interrupted" on startup, and remaining steps are not resumed.
8. **Missed schedules are skipped.** A trigger fires only if the server is up within its scheduled minute. There is no catch-up after downtime.
9. **Limits:** waits from 1 minute to 12 hours (whole minutes). At most 20 steps per routine, 50 devices per Set step, and 10 schedule rows. Names are 1–40 characters and unique per owner (shared routines are unique among shared). An optional emoji goes at the start of the name.
10. **A device may appear at most once per Set step**, but it can appear in several steps.
11. **Light settings:** power is **On, Off, or Leave as is**. With On or Leave as is, the entry may also set brightness, plus either a color or a white temperature (not both). That way "dim the lamp to 20% if it's on" is possible. Off ignores the other fields. An entry must change at least one thing. Brightness 0 is not allowed (use Off). Plugs and switches are On or Off only.
12. **Try it** runs the editor's *unsaved* draft once, including waits, under the editor user's own permissions. A shared draft tried by the admin runs fully. The run isn't recorded as the routine's last run, and Try it shows the same feedback as a button.
13. **Results:** each run records its start time, end time, status (`OK`, `PARTIAL`, `FAILED`, `INTERRUPTED`, `STOPPED`) and per-device problems (device name plus reason: unreachable, not ready, no access, removed). `FAILED` means every device in the run failed or was skipped. Clients learn about status changes through a GraphQL subscription, so every open dashboard updates its buttons live.
14. **Removed devices:** entries pointing at a deleted device are skipped and reported as "removed". When a routine is loaded into the editor, those entries are dropped (with a notice), so the next Save cleans them up.
15. **Deleting a user** deletes their personal routines and removes them from shared routines' audiences.
16. **Scheduled runs of personal routines** use the owner's current grants (call 2). Scheduled shared routines run fully.
17. **Disabling** a schedule row is a toggle on that row. A routine with no enabled schedule is tap-only.
18. **Navigation:** a "Routines" entry in the app header for all users at `/routines`. The editor is at `/routines/new` and `/routines/:id`.
19. **Several admins.** The code allows more than one admin. Shared routines are one pool that **any admin** can edit, delete and re-share. They keep a `createdBy` for display only, and deleting or demoting that admin doesn't affect them. An admin's personal routines behave like anyone's: other admins see them under "Other users". A demoted admin keeps their personal routines, filtered by their grants from then on (call 2).
20. **Admin editing a user's personal routine:** Save validates devices against the **owner's** grants, and the editor's device picker offers only the owner's devices. Routines can't be converted between personal and shared. To do that, make a new one.
21. **Edits during a run:** saving or deleting a routine cancels its current run (status `STOPPED`). Personal routines re-check the owner's grants before **each** Set step, not only at the start.
22. **Who sees run status:** there is one last-run record per routine, and everyone who can see the routine sees its live *running…*, ✓ or ⚠ state, whoever started it. A viewer sees problem device names only for devices they can access, and the rest are summarised as "N other devices". Admins see all names.

## 8. Left to the builder

- Data model specifics (e.g. `Routine`, `RoutineSchedule`, `RoutineAudience` tables, steps as validated JSON or as rows), migrations, and GraphQL type and field names.
- How the scheduler ticks (e.g. a once-a-minute timer aligned to the minute) and how it is started and stopped with the server's existing lifecycle (`shutdown.ts`).
- How the in-memory run registry cancels Waits and publishes status.
- Component breakdown of the Routines page, editor, step cards, device settings panel and dashboard routine row, including reuse of the device page's light controls.
- Exact visual styling, within the existing theme and the accepted mockups.
- Test strategy, following the existing patterns (server `test/api-*.test.ts` with `api-harness.ts`, web vitest + Testing Library with `test/testClient`).
