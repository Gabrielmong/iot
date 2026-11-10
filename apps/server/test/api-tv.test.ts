import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const KEY = `mutation($i: ID!, $k: TvKey!) { sendTvKey(deviceId: $i, key: $k) }`;
const LAUNCH = `mutation($i: ID!, $a: TvApp!) { launchTvApp(deviceId: $i, app: $a) }`;
const START = `mutation($i: ID!) { startTvPairing(deviceId: $i) }`;
const FINISH = `mutation($i: ID!, $c: String) { finishTvPairing(deviceId: $i, code: $c) { id status } }`;
const CANCEL = `mutation($i: ID!) { cancelTvPairing(deviceId: $i) }`;
const tvDevice = (h: ApiHarness, over = {}) => h.device({ brand: "ANDROID_TV", kind: "TV", ...over });

describe("TV remote", () => {
  it("sends keys and launches apps for users with access only", async () => {
    h = await ApiHarness.start();
    const bob = await h.user("Bob");
    const eve = await h.user("Eve");
    const tv = await tvDevice(h);
    await h.grant(bob.id, tv);
    expect((await h.ok(bob.token, KEY, { i: tv, k: "VOLUME_UP" })).sendTvKey).toBe(true);
    expect((await h.ok(bob.token, LAUNCH, { i: tv, a: "NETFLIX" })).launchTvApp).toBe(true);
    expect(h.drivers.ANDROID_TV.keys).toEqual([{ deviceId: tv, key: "VOLUME_UP" }]);
    expect(h.drivers.ANDROID_TV.launches).toEqual([{ deviceId: tv, app: "NETFLIX" }]);
    expect(codes(await h.gql(eve.token, KEY, { i: tv, k: "OK" }))).toEqual(["FORBIDDEN"]);
  });

  it("a TV that never answers fails with DEVICE_UNREACHABLE within the command timeout", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const tv = await tvDevice(h);
    h.drivers.ANDROID_TV.sendKeyImpl = () => new Promise(() => {});
    const started = Date.now();
    expect(codes(await h.gql(admin.token, KEY, { i: tv, k: "OK" }))).toEqual(["DEVICE_UNREACHABLE"]);
    expect(Date.now() - started).toBeLessThan(3500);
  });

  it("a TV that needs pairing is not ready, and a lamp is not a TV", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const tv = await tvDevice(h, { status: "NEEDS_PAIRING" });
    expect(codes(await h.gql(admin.token, KEY, { i: tv, k: "OK" }))).toEqual(["DEVICE_NOT_READY"]);
    const lamp = await h.device();
    expect(codes(await h.gql(admin.token, KEY, { i: lamp, k: "OK" }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("Device.tv lists the TV's apps and power-on ability; null for other kinds", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const tv = await tvDevice(h);
    const lamp = await h.device();
    h.drivers.ANDROID_TV.powerOn = false;
    const r = await h.ok(admin.token, `query($a: ID!, $b: ID!) { a: device(id: $a) { tv { apps canPowerOn } } b: device(id: $b) { tv { apps } } }`, { a: tv, b: lamp });
    expect(r.a.tv).toEqual({ apps: ["YOUTUBE", "NETFLIX"], canPowerOn: false });
    expect(r.b.tv).toBeNull();
  });
});

describe("TV pairing", () => {
  it("pairs with a code: a wrong code keeps the session, the right one stores an encrypted secret", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const tv = await tvDevice(h, { status: "NEEDS_PAIRING" });
    expect((await h.ok(admin.token, START, { i: tv })).startTvPairing).toBe("CODE");
    const wrong = await h.gql(admin.token, FINISH, { i: tv, c: "0000" });
    expect(codes(wrong)).toEqual(["BAD_USER_INPUT"]);
    expect(wrong.errors![0].message).toBe("Wrong code — check the TV and try again");
    const ok = await h.ok(admin.token, FINISH, { i: tv, c: "1234" });
    expect(ok.finishTvPairing.status).toBe("OK");
    const row = await h.db.device.findUniqueOrThrow({ where: { id: tv } });
    expect(row.secret).toBeTruthy();
    expect(row.secret).not.toContain("secret-for-1234");
    const again = await h.gql(admin.token, FINISH, { i: tv, c: "1234" });
    expect(again.errors![0].message).toBe("Pairing expired — start again");
  });

  it("expires after 2 minutes, a second start cancels the first, and cancel works", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const tv = await tvDevice(h, { status: "NEEDS_PAIRING" });
    await h.ok(admin.token, START, { i: tv });
    await h.ok(admin.token, START, { i: tv });
    expect(h.drivers.ANDROID_TV.sessions.map((s) => s.cancelled)).toEqual([true, false]);
    h.time += 120_001;
    expect((await h.gql(admin.token, FINISH, { i: tv, c: "1234" })).errors![0].message).toBe("Pairing expired — start again");
    await h.ok(admin.token, START, { i: tv });
    expect((await h.ok(admin.token, CANCEL, { i: tv })).cancelTvPairing).toBe(true);
    expect(h.drivers.ANDROID_TV.sessions.at(-1)!.cancelled).toBe(true);
  });

  it("a second start while the first is still opening shares it: one connection to the TV, both get its mode", async () => {
    // A TV answers one pairing connection at a time; a second one opened alongside is never answered.
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const tv = await tvDevice(h, { status: "NEEDS_PAIRING" });
    let open!: () => void;
    h.drivers.ANDROID_TV.startPairingGate = new Promise((r) => (open = r));
    const first = h.gql(admin.token, START, { i: tv });
    const second = h.gql(admin.token, START, { i: tv });
    await new Promise((r) => setTimeout(r, 50));
    open();
    expect((await first).data?.startTvPairing).toBe("CODE");
    expect((await second).data?.startTvPairing).toBe("CODE");
    expect(h.drivers.ANDROID_TV.sessions).toEqual([{ cancelled: false }]);
    expect((await h.ok(admin.token, FINISH, { i: tv, c: "1234" })).finishTvPairing.status).toBe("OK");
  });

  it("a refused pairing says so; pairing is admin-only", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    const tv = await tvDevice(h, { status: "NEEDS_PAIRING" });
    h.drivers.ANDROID_TV.pairingMode = "ACCEPT_ON_TV";
    h.drivers.ANDROID_TV.rejectPairing = true;
    expect((await h.ok(admin.token, START, { i: tv })).startTvPairing).toBe("ACCEPT_ON_TV");
    expect((await h.gql(admin.token, FINISH, { i: tv })).errors![0].message).toBe("The TV refused the pairing");
    expect(codes(await h.gql(bob.token, START, { i: tv }))).toEqual(["FORBIDDEN"]);
  });
});
