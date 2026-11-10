import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const guestRow = (h: ApiHarness) =>
  h.db.user.create({ data: { name: "Guest", role: "GUEST", avatarColor: "#8e24aa", pinHash: null } });

describe("guest profiles", () => {
  it("loginUsers exposes hasPin", async () => {
    h = await ApiHarness.start();
    await h.user("Ann");
    await guestRow(h);
    const r = await h.ok(null, `{ loginUsers { name hasPin } }`);
    expect(r.loginUsers).toEqual(expect.arrayContaining([{ name: "Guest", hasPin: false }, { name: "Ann", hasPin: true }]));
  });

  it("login with a PIN never signs in a PIN-less guest", async () => {
    h = await ApiHarness.start();
    const guest = await guestRow(h);
    const r = await h.gql(null, `mutation($u: ID!) { login(userId: $u, pin: "0000", shared: false) { token } }`, { u: guest.id });
    expect(codes(r)).toEqual(["INVALID_PIN"]);
  });

  it("creates a guest without a PIN, but not a user or admin", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const r = await h.ok(admin.token, `mutation { createUser(name: "G", role: GUEST, avatarColor: "#111111") { hasPin role } }`);
    expect(r.createUser).toEqual({ hasPin: false, role: "GUEST" });
    const bad = await h.gql(admin.token, `mutation { createUser(name: "U", role: USER, avatarColor: "#111111") { id } }`);
    expect(codes(bad)).toEqual(["BAD_USER_INPUT"]);
  });

  it("setting or clearing a guest's PIN signs them out everywhere", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const guest = await h.user("G", "GUEST");
    const login = async () =>
      (await h.ok(null, `mutation($u: ID!) { login(userId: $u, pin: "1234", shared: false) { token } }`, { u: guest.id })).login.token as string;
    const [t1, t2] = [await login(), await login()];
    const r = await h.ok(admin.token, `mutation($i: ID!) { updateUser(id: $i, clearPin: true) { hasPin } }`, { i: guest.id });
    expect(r.updateUser.hasPin).toBe(false);
    for (const t of [t1, t2]) expect(codes(await h.gql(t, `{ me { id } }`))).toEqual(["UNAUTHENTICATED"]);
    const s = await h.ok(admin.token, `mutation($i: ID!) { updateUser(id: $i, pin: "1234") { hasPin } }`, { i: guest.id });
    expect(s.updateUser.hasPin).toBe(true);
  });

  it("refuses clearing a PIN for non-guests and promoting a PIN-less guest without a PIN", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    const clear = await h.gql(admin.token, `mutation($i: ID!) { updateUser(id: $i, clearPin: true) { id } }`, { i: bob.id });
    expect(codes(clear)).toEqual(["BAD_USER_INPUT"]);
    const guest = await h.db.user.create({ data: { name: "Guest", role: "GUEST", avatarColor: "#8e24aa", pinHash: null } });
    const noPin = await h.gql(admin.token, `mutation($i: ID!) { updateUser(id: $i, role: USER) { id } }`, { i: guest.id });
    expect(codes(noPin)).toEqual(["BAD_USER_INPUT"]);
    const ok = await h.ok(admin.token, `mutation($i: ID!) { updateUser(id: $i, role: USER, pin: "1234") { role hasPin } }`, { i: guest.id });
    expect(ok.updateUser).toEqual({ role: "USER", hasPin: true });
  });

  it("turning a user into a guest drops cameras, personal routines and camera groups", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    const cam = await h.device({ kind: "CAMERA", brand: "KASA" });
    const lamp = await h.device();
    await h.grant(bob.id, cam, lamp);
    await h.db.routine.create({ data: { name: "Mine", scope: "PERSONAL", ownerId: bob.id, steps: [] } });
    await h.db.cameraGroup.create({ data: { name: "MyCams", scope: "PERSONAL", ownerId: bob.id, layout: 1 } });
    const shared = await h.db.cameraGroup.create({ data: { name: "Shared", scope: "SHARED", layout: 1, audience: { create: [{ userId: bob.id }] } } });
    await h.ok(admin.token, `mutation($i: ID!) { updateUser(id: $i, role: GUEST) { role } }`, { i: bob.id });
    const g = await h.ok(admin.token, `query($u: ID!) { grants(userId: $u) }`, { u: bob.id });
    expect(g.grants).toEqual([lamp]);
    const o = await h.ok(admin.token, `{ otherRoutines { name } otherCameraGroups { name } }`);
    expect(o.otherRoutines).toEqual([]);
    expect(o.otherCameraGroups).toEqual([]);
    expect(await h.db.cameraGroupAudience.count({ where: { groupId: shared.id } })).toBe(0);
  });

  it("refuses demoting the last admin to guest", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const r = await h.gql(admin.token, `mutation($i: ID!) { updateUser(id: $i, role: GUEST) { id } }`, { i: admin.id });
    expect(codes(r)).toEqual(["BAD_USER_INPUT"]);
  });

  it("a PIN-less guest signs in with no PIN", async () => {
    h = await ApiHarness.start();
    const guest = await guestRow(h);
    const r = await h.ok(null, `mutation($u: ID!) { loginGuest(userId: $u, shared: true) { token } }`, { u: guest.id });
    const me = await h.ok(r.loginGuest.token, `{ me { role hasPin } }`);
    expect(me.me).toEqual({ role: "GUEST", hasPin: false });
  });

  it("loginGuest refuses anyone else exactly like an unknown id", async () => {
    h = await ApiHarness.start();
    const user = await h.user("Ann");
    const admin = await h.user("Root", "ADMIN");
    const pinned = await h.user("G", "GUEST");
    const attempt = (id: string) =>
      h.gql(null, `mutation($u: ID!) { loginGuest(userId: $u, shared: false) { token } }`, { u: id });
    const results = [];
    for (const id of [user.id, admin.id, pinned.id, "nope"]) results.push(await attempt(id));
    const shape = (r: any) => ({ codes: codes(r), message: r.errors[0].message, ext: r.errors[0].extensions });
    for (const r of results) {
      expect(shape(r).codes).toEqual(["INVALID_PIN"]);
      expect(shape(r).ext.attemptsLeft).toBeDefined();
      expect(shape(r)).toEqual(shape(results[3]));
    }
  });

  it("loginGuest waits for a concurrent PIN change and then refuses", async () => {
    h = await ApiHarness.start();
    const guest = await guestRow(h);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    const change = h.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: guest.id }, data: { pinHash: "x" } });
      await tx.session.deleteMany({ where: { userId: guest.id } });
      locked();
      await held;
    });
    await lockTaken;
    const attempt = h.gql(null, `mutation($u: ID!) { loginGuest(userId: $u, shared: false) { token } }`, { u: guest.id });
    await new Promise((r) => setTimeout(r, 300));
    release();
    await change;
    expect(codes(await attempt)).toEqual(["INVALID_PIN"]);
    expect(await h.db.session.count({ where: { userId: guest.id } })).toBe(0);
  });
});
