# Guest profiles and changing your own PIN — Design

*Date: 2026-11-09 · Status: draft, awaiting approval · Builds on: users and roles (`apps/server/src/services/users.ts`), device grants (`services/grants.ts`), the sign-in picker (`apps/web/src/auth/LoginScreen.tsx`), shared routines (`routines/store.ts`), the profile dialog (`apps/web/src/profile/ProfileDialog.tsx`), and the Users admin cards (`apps/web/src/admin/users/UserCard.tsx`)*

## 1. Intent

**Guests.** A visitor walks up to the tablet, taps a guest tile such as "Guest" and is in, with no PIN. They see only what the admin picked for that guest profile, for example the living room lights. The admin can set up **several guest profiles** (e.g. "Guest", "Babysitter"), each with its own devices. A guest profile can optionally have a PIN, for example for "Babysitter".

**Your own PIN.** Today only an admin can change a PIN. Everyone who has a PIN should be able to change their own.

## 2. Goals

### Guests
- New role **GUEST**, alongside ADMIN and USER.
- **PIN is optional for guests only.** The admin chooses when creating or editing a guest. ADMIN and USER always have a PIN.
- **Sign-in:** a guest with no PIN appears on the sign-in picker like everyone else. Tapping the tile signs them in straight away, with no PIN pad. A guest with a PIN goes through the normal PIN pad and lockout.
- **Any device.** No-PIN guest sign-in works from any browser that reaches the app (the tablet, a phone on the home Wi-Fi). It is not restricted to shared screens. The existing "shared screen" toggle and idle sign-out behave as for any user.
- **Devices:** the admin picks a guest's devices with the existing Device access dialog (grants). Guests see and control only granted devices, like USERs.
- **No cameras.** Guests never see camera views. Cameras are not offered in a guest's Device access dialog and are refused by the server if granted anyway. The Cameras nav link and camera pages are hidden or refused for guests.
- **Dashboard:** guests can rearrange their own dashboard (their own layout override), like USERs.
- **Routines:** guests run **shared routines the admin shared with them**. They cannot create, edit or delete routines. A guest must be selectable in a shared routine's "Who can see it" list.
- **No settings:** no admin pages and no camera groups. They also get no profile editing (name, color, picture). Changing their own PIN is allowed only if they have one (see below).
- **Users admin page:** the role picker gets **Guest**. The user cards show a "Guest" chip and, for a guest without a PIN, a "No PIN" note.

### Change your own PIN
- In the existing profile dialog (opened from your avatar at the bottom of the side menu), add a **Change PIN** section: current PIN, new PIN, confirm new PIN.
- Available to anyone who **has** a PIN: admins, users, and guests with a PIN. Hidden for guests without a PIN.
- A wrong current PIN counts toward the **same 5-try lockout** as sign-in. The error shows attempts left, as sign-in does. Once locked, it says so.
- On success, **every other session of that user is signed out**, and the current session stays signed in. This differs from an admin PIN change, which signs the user out everywhere, and that stays as is.
- New PIN rules are the existing ones (4–8 digits). The new PIN must differ from the current one.

## 3. Non-goals
- Guest expiry dates, time windows or one-time guest codes.
- Guests creating personal routines or camera groups.
- Restricting guest sign-in to the tablet or to particular networks.
- Changing how admins reset other users' PINs.

## 4. Anti-goals
- **A no-PIN path into anything but a guest.** Only GUEST may have no PIN. The server must refuse to save an ADMIN or USER without a PIN, and the PIN-less sign-in must refuse anyone who isn't a PIN-less GUEST.
- **Guests seeing cameras**, including through device grants, routines, camera groups, stream endpoints, or a device detail page.
- **The Change PIN dialog working as an unlimited PIN-guessing oracle.** It must share the sign-in lockout.
- **Signing yourself out by changing your own PIN.**

## 5. Decided how

- Database: add `GUEST` to the `Role` enum. `User.pinHash` becomes nullable, and only GUEST rows may have it null (enforced in the service layer).
- Today most server checks are `role === "ADMIN"` → full access, otherwise grant-based. GUEST therefore inherits USER's device visibility automatically. The guest-specific restrictions are added on top: cameras, routine and camera-group ownership, profile edit.
- Shared-routine audience validation currently accepts only `role: "USER"` (`routines/store.ts`). It must also accept GUEST. Camera-group audience (`camera-groups/store.ts`) stays USER-only.
- `loginUsers` (public) exposes `hasPin: Boolean!` so the picker knows whether to show the PIN pad.

## 6. Builder's calls (marked as mine, not the user's)
- **PIN-less sign-in shape:** a separate mutation (e.g. `loginGuest(userId, shared)`) rather than making `login`'s `pin` optional. This keeps the PIN path and its lockout untouched. The builder may choose otherwise if they keep the anti-goal above.
- **Self PIN change API:** e.g. `changeMyPin(currentPin, newPin)`. It reuses `reserveAttempt` / `clearFailedAttempts` from `auth/lockout.ts`. It ends the user's other sessions and announces them via `sessionEvents`, so their sockets close as with other sign-outs.
- **Role changes:**
  - Changing a user to GUEST drops their camera grants.
  - Their personal routines and camera groups are deleted, and the edit dialog warns before saving.
  - Changing a no-PIN guest to USER or ADMIN requires entering a PIN in the same save.
  - Removing a guest's PIN, or setting one, signs that guest out everywhere, as an admin PIN change does today.
- **Guests' Routines page:** guests keep the Routines nav link and see the routines shared with them, without "New routine" and without edit controls. Their dashboard routine buttons work as for USERs.
- **Guest profile editing** (name, color, picture) is admin-only. One guest profile is shared by many visitors, so any visitor could otherwise rename it. Dashboard rearranging and a guest with a PIN changing it also affect every later visitor to that profile. The user asked for both, so they stay.
- **Last-admin protection** also covers ADMIN → GUEST.
- **Changing a user to GUEST:**
  - Their running personal routines are stopped before deletion, as `deleteUser` does.
  - They are removed from camera-group audiences.
- **Camera grants for guests** are refused in both places they can be saved: `setGrants` (the user's Device access dialog) and `setDeviceGrants` (a camera's own access list). Guests are also hidden from a camera's access list.
- **Audience checklists:** guests appear in a shared routine's "Who can see it" list but not in a camera group's.
- **Signing out only other sessions:** today's `sessionsRevoked` ends every session of a user. `changeMyPin` ends each other session individually (announced per token hash) or through a new "all but this one" event. The builder picks.
- **PIN-less guest sessions on phones** last as long as any session: 90 days, renewed on use, unless the device is marked as a shared screen. To cut visitors off, the admin sets or removes the guest's PIN, which signs the guest out everywhere.

## 7. Left to the builder
- Exact GraphQL names, migration details, component split (follow the repo's small-components convention), and copy wording.
- How the picker visually distinguishes guest tiles, if at all.
- Test coverage, following existing patterns (`UsersPage.test.tsx`, `auth/*.test.ts`, server service tests).
