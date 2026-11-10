# Guest Profiles and Changing Your Own PIN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GUEST role (optional PIN, admin-picked devices, no cameras, no settings, runs only shared routines) and let anyone with a PIN change their own.

**Architecture:** Most server checks are already "ADMIN → everything, else grant-based", so GUEST inherits USER's device visibility for free. Guest restrictions are added at the few entry points that create things or touch cameras. PIN-less sign-in is a separate `loginGuest` mutation so the PIN path and its lockout stay untouched. `changeMyPin` reuses the sign-in lockout and ends only the caller's *other* sessions.

**Tech Stack:** Node + Apollo Server 5 + Prisma 7 (Postgres) in `apps/server`; React + MUI + Apollo Client + Vitest/Testing Library in `apps/web` (GraphQL types via `pnpm codegen`).

**Spec:** `docs/superpowers/specs/2026-11-09-guests-and-own-pin-design.md`

## Global Constraints

- PIN format stays `^\d{4,8}$` ("PIN must be 4 to 8 digits"). No auto-submit on the PIN pad (the user declined it).
- Only GUEST may have `pinHash = null`. ADMIN and USER always have one; the server enforces this, not just the UI.
- Guests: no cameras anywhere (grants, camera pages, camera groups, streams), no admin pages, no profile edits (name/color/picture), no creating, editing or trying routines. They may run shared routines whose audience includes them, and save their own dashboard layout.
- An admin setting/removing a guest's PIN, or any role change, signs that user out everywhere (existing `sessionsRevoked` behavior).
- `changeMyPin` must share the 5-try lockout (`auth/lockout.ts`) and must not end the caller's current session.
- Small, single-purpose files and components (repo convention); follow existing patterns.
- Server tests: `pnpm --filter @home/server test -- <file>`. Web tests: `pnpm --filter @home/web test -- <file>` (runs codegen first). Typecheck: `pnpm --filter @home/web typecheck`, `pnpm --filter @home/server exec tsc --noEmit`.

## Review Focus

1. **A PIN-less login for a non-guest:** `loginGuest` on a USER, ADMIN, or a guest that has a PIN must fail with the same error as an unknown id (no account probing). Pinned in Task 3.
2. **A guest whose PIN was just removed or added** while signed in elsewhere: all their sessions end. Pinned in Task 2.
3. **Demoting the only admin to GUEST** must be refused like ADMIN → USER. Pinned in Task 2.
4. **A camera granted to a guest through the device's own access list** (`setDeviceGrants`), not just the user's dialog: refused. Pinned in Task 4.
5. **Changing your own PIN to the same PIN, or with a wrong current PIN 5 times:** rejected with `BAD_USER_INPUT` / then `LOCKED`, and the 6th try, even with the right PIN, is still `LOCKED`. Pinned in Task 5.

---

### Task 1: GUEST role, nullable PIN, `hasPin`

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (enum `Role` + `User.pinHash String?`)
- Create: `apps/server/prisma/migrations/<timestamp>_guest_role/migration.sql` (via `pnpm --filter @home/server db:migrate --name guest_role`)
- Modify: `apps/server/src/graphql/schema.graphql` (`enum Role { ADMIN USER GUEST }`, `User.hasPin: Boolean!`)
- Modify: `apps/server/src/graphql/mappers.ts` (`ApiUser` gains `hasPin`)
- Modify: `apps/server/src/auth/login.ts` (a null `pinHash` never verifies)
- Test: `apps/server/test/api-guests.test.ts` (new)

**Interfaces:**
- Produces: `toApiUser(u: User): ApiUser` where `ApiUser = Pick<User, "id"|"name"|"avatarColor"|"avatarImage"|"role"> & { hasPin: boolean }` (`hasPin = u.pinHash !== null`). Prisma `Role` now includes `"GUEST"`.

- [ ] **Step 1: Write failing tests** in `api-guests.test.ts` (use `ApiHarness`; insert a PIN-less guest directly with `prisma.user.create({ data: { name: "Guest", role: "GUEST", avatarColor: "#8e24aa", pinHash: null } })`):
  - `"loginUsers exposes hasPin"`: `{ loginUsers { name hasPin } }` with no token → Guest `hasPin: false`, a normal user `hasPin: true`.
  - `"login with a PIN never signs in a PIN-less guest"`: `login(userId: guest, pin: "0000", shared: false)` → `codes = ["INVALID_PIN"]`.
- [ ] **Step 2: Run** `pnpm --filter @home/server test -- api-guests` → FAIL (no `hasPin` field / GUEST enum).
- [ ] **Step 3: Implement** the schema/migration/mapper changes. In `login`, treat `user.pinHash === null` as a wrong PIN (still after `reserveAttempt`, so timing and lockout match). Fix any `pinHash: string` type fallout (e.g. `createUser` stays non-null until Task 2).
- [ ] **Step 4: Run** the test file and the full server suite → PASS.
- [ ] **Step 5: Commit** `feat(server): GUEST role and optional PIN storage`.

### Task 2: Admin user management for guests

**Files:**
- Modify: `apps/server/src/services/users.ts`
- Create: `apps/server/src/services/become-guest.ts` (cleanup when a user turns into a guest)
- Modify: `apps/server/src/graphql/schema.graphql` (`createUser(... pin: String ...)`, `updateUser(... clearPin: Boolean ...)`)
- Modify: `apps/server/src/graphql/resolvers/users.ts`
- Test: `apps/server/test/api-guests.test.ts`

**Interfaces:**
- Consumes: Task 1's `Role` and nullable `pinHash`.
- Produces:
  - `NewUser = { name; pin?: string | null; role: Role; avatarColor; avatarImage? }`
  - `UserPatch` gains `clearPin?: boolean | null`
  - `prepareGuest(tx: Prisma.TransactionClient, userId: string): Promise<string[]>` in `become-guest.ts`. It deletes the user's camera grants, their PERSONAL routines and camera groups, and their camera-group audience rows, and returns the deleted routine ids so the caller can `deps.routines.stop(id)` each one.
  - `updateUser` deps widen to `Pick<ServiceDeps, "prisma" | "pubsub" | "sessionEvents" | "routines" | "grantEvents">`.

- [ ] **Step 1: Write failing tests** (admin token from the harness):
  - `"creates a guest without a PIN, but not a user or admin"`: `createUser(role: GUEST, no pin)` OK, `hasPin: false`. `createUser(role: USER, no pin)` → `BAD_USER_INPUT`.
  - `"setting or clearing a guest's PIN signs them out everywhere"`: guest with PIN signs in twice; `updateUser(id, clearPin: true)` → both tokens get `UNAUTHENTICATED` on `{ me { id } }`, and `hasPin: false`. Then `updateUser(id, pin: "1234")` → `hasPin: true`.
  - `"refuses clearing a PIN for non-guests and promoting a PIN-less guest without a PIN"`: `clearPin` on a USER → `BAD_USER_INPUT`. `updateUser(guest, role: USER)` with no `pin` → `BAD_USER_INPUT`. With `pin: "1234"` → OK.
  - `"turning a user into a guest drops cameras, personal routines and camera groups"`: give Bob a camera grant + a lamp grant, a personal routine, a personal camera group, and membership in a shared group's audience. `updateUser(bob, role: GUEST)` → `grants(userId: bob)` is only the lamp, and `otherRoutines`/`otherCameraGroups` contain none of Bob's. The shared group's `audience` no longer has Bob.
  - `"refuses demoting the last admin to guest"` → `BAD_USER_INPUT`, same as ADMIN → USER today.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - `createUser`: `pinHash` is `null` only when `role === "GUEST"` and `pin` is empty. Otherwise `parsePin` as today.
  - `updateUser`:
    - `clearPin` is allowed only when the resulting role is GUEST, and is mutually exclusive with `pin`.
    - The resulting row must satisfy "non-GUEST ⇒ has PIN".
    - `assertNotLastAdmin` runs whenever an ADMIN's role changes to anything else.
    - When the role becomes GUEST, call `prepareGuest` inside the same transaction, then stop the returned routines after commit.
    - `clearPin` counts as a PIN change for sign-out.
  - Resolver: pass `clearPin` through.
- [ ] **Step 4: Run** → PASS, plus the full server suite.
- [ ] **Step 5: Commit** `feat(server): admins manage guests and optional guest PINs`.

### Task 3: PIN-less guest sign-in

**Files:**
- Create: `apps/server/src/auth/guest-login.ts`
- Modify: `apps/server/src/graphql/schema.graphql` (`loginGuest(userId: ID!, shared: Boolean!): AuthPayload!  # public; PIN-less guests only`)
- Modify: `apps/server/src/graphql/resolvers/auth.ts`
- Test: `apps/server/test/api-guests.test.ts`

**Interfaces:**
- Produces: `loginGuest(prisma: PrismaClient, userId: string, shared: boolean, now: Date): Promise<{ token: string; user: User }>`.

- [ ] **Step 1: Write failing tests:**
  - `"a PIN-less guest signs in with no PIN"`: `loginGuest(guest, shared: true)` → token works on `{ me { role hasPin } }` → `{ role: "GUEST", hasPin: false }`.
  - `"loginGuest refuses anyone else exactly like an unknown id"`: for a USER, an ADMIN, a guest with a PIN, and `"nope"`, the errors are identical: `codes = ["INVALID_PIN"]`, same message, and the same `attemptsLeft` field present.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Look up the user. If `role === "GUEST" && pinHash === null`, `createSession` and return. Otherwise throw `invalidPinError(attemptsLeft(1))`, the same error `login` gives an unknown id. It does not touch the lockout counter.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): loginGuest for PIN-less guests`.

### Task 4: Guest restrictions on the server

**Files:**
- Create: `apps/server/src/services/guest-rules.ts`
- Modify: `apps/server/src/services/grants.ts` (`setGrants`), `apps/server/src/services/device-grants.ts` (`setDeviceGrants`)
- Modify: `apps/server/src/cameras/camera-access.ts` (`visibleCamera`)
- Modify: `apps/server/src/routines/store.ts` (`createRoutine`, `parseAudience` role filter)
- Modify: `apps/server/src/routines/run-service.ts` or its resolver (`tryRoutine`)
- Modify: `apps/server/src/camera-groups/store.ts` (`createGroup`)
- Modify: `apps/server/src/graphql/resolvers/users.ts` (`updateProfile`)
- Test: `apps/server/test/api-guests.test.ts`

**Interfaces:**
- Produces: `isGuest(u: Pick<User, "role">): boolean` and `refuseGuest(u: Pick<User, "role">, what: string): void` (throws `forbidden(\`Guests can't ${what}\`)`).

- [ ] **Step 1: Write failing tests** (guest token via `loginGuest`; admin token for setup):
  - `"guests can't be granted cameras"`: `setGrants(guest, [lamp, camera])` → `BAD_USER_INPUT` "Guests can't have cameras". `setDeviceGrants(camera, [guest, bob])` → same error.
  - `"guests never see a camera"`: insert a camera `DeviceGrant` directly for the guest. `device(id: camera)` → `null`, and `devices` doesn't include it.
  - `"guests can't create, try, or edit routines, but run shared ones"`:
    - `createRoutine(PERSONAL)` → `FORBIDDEN`.
    - `tryRoutine` → `FORBIDDEN`.
    - The admin creates a SHARED routine with `audience: [guest]`, which is accepted (today it's rejected).
    - The guest's `routines` lists it with `editable: false`, and `runRoutine` → `true`.
  - `"guests can't create camera groups or be in their audience"`: guest `createCameraGroup(PERSONAL)` → `FORBIDDEN`. An admin shared group with `audience: [guest]` → `BAD_USER_INPUT`.
  - `"guests can't edit their profile but can save a dashboard layout"`: `updateProfile(name: "X")` → `FORBIDDEN`. `saveDashboardLayout(tab: "all", items: [{ deviceId: lamp, size: ... }])` OK.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `guest-rules.ts`:
  - Grant checks count `kind: "CAMERA"` devices among the ids for guest users.
  - `visibleCamera` returns `null` for guests.
  - `parseAudience` in `routines/store.ts` accepts `role: { in: ["USER", "GUEST"] }`. `camera-groups/store.ts` stays USER-only.
- [ ] **Step 4: Run** → PASS, plus the full server suite.
- [ ] **Step 5: Commit** `feat(server): guests get no cameras, settings or routine editing`.

### Task 5: Change your own PIN (server)

**Files:**
- Create: `apps/server/src/auth/change-pin.ts`
- Modify: `apps/server/src/graphql/schema.graphql` (`changeMyPin(currentPin: String!, newPin: String!): Boolean!  # signed-in user with a PIN; ends their other sessions`)
- Modify: `apps/server/src/graphql/resolvers/users.ts`
- Test: `apps/server/test/api-change-pin.test.ts` (new)

**Interfaces:**
- Produces: `changeMyPin(deps: Pick<ServiceDeps, "prisma" | "sessionEvents" | "now">, user: User, currentToken: string, currentPin: string, newPin: string): Promise<void>`.

- [ ] **Step 1: Write failing tests:**
  - `"changes the PIN, keeps this session, ends the others"`: Ann signs in on two tokens. `changeMyPin("1234","5678")` with token A → `true`. Token A's `me` works, token B is `UNAUTHENTICATED`. `login(ann, "5678")` works and `"1234"` doesn't.
  - `"a wrong current PIN counts toward the sign-in lockout"`: 5 wrong `changeMyPin` calls → 1st–4th are `INVALID_PIN` with `attemptsLeft` 4…1, the 5th is `INVALID_PIN` with 0 or `LOCKED`, the 6th with the right PIN is `LOCKED`, and `login(ann, right)` is `LOCKED` too.
  - `"rejects an invalid or unchanged new PIN"`: `newPin: "12"` → `BAD_USER_INPUT`, `newPin` equal to the current one → `BAD_USER_INPUT` "New PIN must be different". Neither counts as a failed attempt.
  - `"a PIN-less guest can't use it, and it needs a session"`: guest → `FORBIDDEN`, no token → `UNAUTHENTICATED`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - Validate `newPin` first (`parsePin`, differs from `currentPin`).
  - `reserveAttempt`, verify `currentPin`, then `clearFailedAttempts`, mirroring `auth/login.ts` including the locked/unknown branches.
  - Then, in one transaction, update `pinHash` and delete the user's sessions where `tokenHash !== hashToken(currentToken)`, collecting their hashes.
  - After commit, emit `sessionEnded` for each hash. This is how logout announces an ended session, so camera streams are cut.
  - The resolver passes `ctx.token`.
- [ ] **Step 4: Run** → PASS, plus the full server suite.
- [ ] **Step 5: Commit** `feat(server): changeMyPin with shared lockout`.

### Task 6: Sign-in screen: tap-in for PIN-less guests

**Files:**
- Modify: `apps/web/src/auth/documents.ts` (`hasPin` on `LoginUsers`, `Me`, `Login`; new `LOGIN_GUEST`)
- Modify: `apps/web/src/auth/UserPicker.tsx` (`PickerUser.hasPin: boolean`)
- Modify: `apps/web/src/auth/useLogin.ts` (add `loginGuest(userId): Promise<boolean>`, same token/error handling)
- Modify: `apps/web/src/auth/LoginScreen.tsx`
- Test: `apps/web/src/auth/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: Task 3 `loginGuest(userId, shared)`; Task 1 `hasPin`.
- Produces: `useLogin(): LoginState & { loginGuest: (userId: string) => Promise<boolean> }`.

- [ ] **Step 1: Write failing tests:**
  - `"tapping a PIN-less guest signs straight in"`: picker includes `{ name: "Guest", hasPin: false }`. Clicking it sends `LoginGuest` with `{ userId, shared }`, stores the token, navigates to `/`, and never shows the PIN pad.
  - `"a guest with a PIN gets the PIN pad"`: `{ hasPin: true, role: "GUEST" }` → the PIN pad shows.
  - `"a failed guest sign-in shows the error on the picker"`: `LoginGuest` errors → an `Alert` with the formatted error; still on the picker.
- [ ] **Step 2: Run** `pnpm --filter @home/web test -- LoginScreen` → FAIL.
- [ ] **Step 3: Implement.** In `LoginScreen`, `onSelect` calls `loginGuest` when `!user.hasPin`, otherwise sets `selected` as today. Disable the picker while signing in.
- [ ] **Step 4: Run** → PASS. Update existing fixtures that build `PickerUser`/`me` objects to include `hasPin`.
- [ ] **Step 5: Commit** `feat(web): PIN-less guests tap in from the sign-in picker`.

### Task 7: Admin UI for guests

**Files:**
- Modify: `apps/web/src/admin/lib/userEdit.ts` (`Role` from generated types; `UserForm.clearPin: boolean`; `signsOut`/`signOutWarning`/`userUpdate` cover `clearPin` and the role→GUEST cleanup warning)
- Modify: `apps/web/src/admin/users/UserEditDialog.tsx`
- Create: `apps/web/src/admin/users/GuestPinOption.tsx` ("No PIN" switch shown for GUEST)
- Modify: `apps/web/src/admin/users/UserCard.tsx` (Guest chip; "No PIN" caption)
- Modify: `apps/web/src/admin/users/GrantsEditor.tsx` (guests: cameras not listed)
- Modify: `apps/web/src/device/admin/AccessChecklist.tsx` (camera device: guests not listed)
- Modify: `apps/web/src/routines/editor/AudienceChecklist.tsx` (prop `includeGuests: boolean`; `RoutineEditor` passes `true`, `SaveGroupDialog` passes `false`)
- Modify: `apps/web/src/admin/data/documents.ts` (`hasPin` in user fields; `pin` optional and `clearPin` on mutations)
- Test: `apps/web/src/admin/UsersPage.test.tsx`, `apps/web/src/test/adminFixtures.ts` (`userFixture` gains `hasPin`)

**Interfaces:**
- Consumes: Task 2 API (`createUser(pin?)`, `updateUser(clearPin)`), Task 1 `hasPin`.
- Produces: `userUpdate(user, form)` emits `clearPin: true` only when switching a guest that has a PIN to "No PIN".

- [ ] **Step 1: Write failing tests** in `UsersPage.test.tsx`:
  - `"creates a guest with no PIN"`: Add user → Role "Guest" → "No PIN" on → Save enabled with an empty PIN. The `CreateUser` variables have `role: "GUEST"` and no `pin`.
  - `"a user or admin still needs a PIN"`: role User, empty PIN → Save disabled.
  - `"a PIN-less guest made a user must get a PIN"`: edit a `hasPin: false` guest → role User → Save disabled until a valid PIN.
  - `"warns that becoming a guest removes cameras, personal routines and camera groups"`: edit Bob → role Guest → the alert contains `removes Bob's cameras, personal routines and camera groups`.
  - `"guest cards say Guest and No PIN"`: a guest card shows the "Guest" chip and "No PIN".
  - `"a guest's device access hides cameras"`: the access dialog for a guest lists no camera checkbox.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Add Guest to `ROLE_OPTIONS`. The PIN field label for a PIN-less guest edit is "PIN (leave blank to keep none)". Switching the role away from GUEST hides `GuestPinOption` and resets `clearPin`.
- [ ] **Step 4: Run** `UsersPage`, `RoutineEditor`, and the device admin tests → PASS. `pnpm --filter @home/web typecheck` clean.
- [ ] **Step 5: Commit** `feat(web): admins create and manage guest profiles`.

### Task 8: Guest experience: hide what guests can't use

**Files:**
- Create: `apps/web/src/auth/RequireNotGuest.tsx` (redirects guests to `/`, mirrors `RequireAdmin`)
- Modify: `apps/web/src/AppRoutes.tsx` (wrap `/cameras`, `/routines/new`, `/routines/:id`)
- Modify: `apps/web/src/layout/nav/navItems.ts` (`NavLink.hideForGuests?: boolean`; set on Cameras), `NavList.tsx` + `NavContent.tsx` + `AppShell.tsx` (pass `isGuest`)
- Modify: `apps/web/src/routines/list/RoutineList.tsx` (no "New routine" for guests; rows don't link to the editor for guests)
- Modify: `apps/web/src/layout/nav/NavFooter.tsx` (guest without PIN: avatar is not a button; guest with PIN: opens profile in PIN-only mode)
- Test: `apps/web/src/auth/RequireGuards.test.tsx`, `apps/web/src/layout/nav/NavList.test.tsx` (new), routines list test next to `RoutineList.tsx`

**Interfaces:**
- Consumes: `useCurrentUser().user.role` / `.hasPin`.
- Produces: `RequireNotGuest(): JSX.Element` (an `<Outlet/>` guard); `ProfileDialog` prop `pinOnly?: boolean` (implemented in Task 9; this task passes it).

- [ ] **Step 1: Write failing tests:**
  - `"guests are sent home from cameras and the routine editor"`: `/cameras`, `/routines/new`, `/routines/r1` → dashboard, for a guest only.
  - `"guests don't see the Cameras link"`: a guest's nav has Dashboard and Routines, no Cameras and no Admin. A user's nav has Cameras.
  - `"guests see shared routines without New routine"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(web): guests see only their devices and shared routines`.

### Task 9: Change PIN in the profile dialog

**Files:**
- Create: `apps/web/src/profile/ChangePinSection.tsx` (current / new / confirm `PinField`s + its own Save)
- Create: `apps/web/src/profile/data/useChangeMyPin.ts`
- Modify: `apps/web/src/profile/data/documents.ts` (`CHANGE_MY_PIN`)
- Modify: `apps/web/src/profile/ProfileDialog.tsx` (renders `ChangePinSection` when the user has a PIN; `pinOnly` hides the name/picture/color form)
- Modify: `apps/web/src/layout/nav/NavFooter.tsx` (pass `hasPin`)
- Test: `apps/web/src/profile/ProfileDialog.test.tsx`

**Interfaces:**
- Consumes: Task 5 `changeMyPin(currentPin, newPin): Boolean!`. The error codes are `INVALID_PIN` with `attemptsLeft`, `LOCKED` with `retryAfterSeconds`, and `BAD_USER_INPUT`. Reuse `auth/formatLoginError.ts` for the first two.
- Produces: `useChangeMyPin(): { change: (currentPin: string, newPin: string) => Promise<boolean>; error: string | null; loading: boolean }`.

- [ ] **Step 1: Write failing tests:**
  - `"changes your PIN"`: fill current `1234`, new `5678`, confirm `5678` → Save sends `{ currentPin: "1234", newPin: "5678" }` → shows "PIN changed" and clears the fields.
  - `"Save stays disabled until the new PINs are valid and match"`: `567` / mismatched confirm → disabled.
  - `"shows attempts left on a wrong current PIN"`: the server answers `INVALID_PIN` with `attemptsLeft: 3` → the same text sign-in shows.
  - `"no Change PIN section without a PIN"`: `hasPin: false` → no "Current PIN" field.
  - `"pinOnly hides the profile fields"`: no Name field, Change PIN shown.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** The PIN section saves independently of the profile form's Save.
- [ ] **Step 4: Run** → PASS; full web suite and typecheck clean.
- [ ] **Step 5: Commit** `feat(web): change your own PIN from your profile`.

### Task 10: End-to-end check

- [ ] **Step 1:** Run the full server and web suites plus both typechecks. Everything should pass.
- [ ] **Step 2:** Run the app (the `run` skill), then:
  - As admin, create a PIN-less "Guest" with one lamp.
  - Sign out, tap Guest. You should land on the dashboard with only that lamp, no Cameras link, and no profile editing.
  - As admin, give the guest a PIN. The guest's session should end.
  - As a user, change your own PIN. You should stay signed in.
- [ ] **Step 3:** Commit any fixes.
