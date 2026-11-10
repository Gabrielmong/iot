import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const DELETE_USER = `mutation($id: ID!) { deleteUser(id: $id) }`;
const DEMOTE = `mutation($id: ID!) { updateUser(id: $id, role: USER) { role } }`;

describe("users", () => {
  it("refuses to delete or demote the last admin, and allows it once there is another", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    expect(codes(await h.gql(root.token, DELETE_USER, { id: root.id }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(root.token, DEMOTE, { id: root.id }))).toEqual(["BAD_USER_INPUT"]);

    const other = await h.user("Other", "ADMIN");
    expect((await h.ok(root.token, DEMOTE, { id: other.id })).updateUser).toEqual({ role: "USER" });
    expect(codes(await h.gql(root.token, DEMOTE, { id: root.id }))).toEqual(["BAD_USER_INPUT"]);
    expect((await h.ok(root.token, DELETE_USER, { id: other.id })).deleteUser).toBe(true);
  });

  it("validates new users and rejects duplicate names", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const create = `mutation($pin: String!, $name: String!) { createUser(name: $name, pin: $pin, role: USER, avatarColor: "#00ff00") { name role } }`;
    expect(codes(await h.gql(root.token, create, { name: "Kid", pin: "12" }))).toEqual(["BAD_USER_INPUT"]);
    expect((await h.ok(root.token, create, { name: "Kid", pin: "2468" })).createUser).toEqual({ name: "Kid", role: "USER" });
    expect(codes(await h.gql(root.token, create, { name: "Kid", pin: "2468" }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("forbids user and room management for a USER", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann");
    expect(codes(await h.gql(a.token, `{ users { id } }`))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(a.token, `mutation { createRoom(name: "Den") { id } }`))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(a.token, DELETE_USER, { id: a.id }))).toEqual(["FORBIDDEN"]);
  });

  it("publishes devicesChanged when a role changes", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const a = await h.user("Ann");
    // Observed from another admin's socket: Ann's own sessions end with the role change.
    const sub = await h.subscribe(h.wsClient(root.token), `subscription { devicesChanged }`);
    await h.ok(root.token, `mutation($id: ID!) { updateUser(id: $id, role: ADMIN) { role } }`, { id: a.id });
    await sub.waitFor((e) => e.data.devicesChanged === true);
  });
});

describe("rooms and devices", () => {
  it("creates rooms in order, publishes devicesChanged, and adopts a device into a room", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const sub = await h.subscribe(h.wsClient(root.token), `subscription { devicesChanged }`);
    const { createRoom: kitchen } = await h.ok(root.token, `mutation { createRoom(name: "Kitchen") { id sortOrder } }`);
    const { createRoom: hall } = await h.ok(root.token, `mutation { createRoom(name: "Hall") { id sortOrder } }`);
    expect([kitchen.sortOrder, hall.sortOrder]).toEqual([0, 1]);
    await sub.waitFor(() => true);

    const id = await h.device({ adopted: false, name: "KASA x" });
    const adopt = `mutation($id: ID!, $room: ID) { adoptDevice(id: $id, name: "Kettle", roomId: $room, kind: PLUG) { name adopted room { name } } }`;
    expect((await h.ok(root.token, adopt, { id, room: kitchen.id })).adoptDevice).toEqual({ name: "Kettle", adopted: true, room: { name: "Kitchen" } });
    expect(h.drivers.KASA.synced.at(-1)?.map((d) => d.id)).toEqual([id]);

    const { devices } = await h.ok(root.token, `{ devices { name room { name } state { online } } }`);
    expect(devices).toEqual([{ name: "Kettle", room: { name: "Kitchen" }, state: { online: false } }]);

    await h.ok(root.token, `mutation($id: ID!) { updateDevice(id: $id, roomId: null) { id } }`, { id });
    expect((await h.ok(root.token, `{ devices { room { name } } }`)).devices).toEqual([{ room: null }]);
  });

  it("removes a device with its outlets and grants", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const a = await h.user("Ann");
    const strip = await h.device({ name: "Strip" });
    const outlet = await h.device({ name: "Outlet", parentId: strip });
    await h.grant(a.id, outlet);

    expect((await h.ok(root.token, `mutation($id: ID!) { removeDevice(id: $id) }`, { id: strip })).removeDevice).toBe(true);
    expect(await h.db.device.count()).toBe(0);
    expect(await h.db.deviceGrant.count()).toBe(0);
    expect(codes(await h.gql(root.token, `mutation($id: ID!) { removeDevice(id: $id) }`, { id: strip }))).toEqual(["NOT_FOUND"]);
  });

  it("returns and replaces grants", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const a = await h.user("Ann");
    const [d1, d2] = [await h.device(), await h.device()];
    const set = `mutation($u: ID!, $d: [ID!]!) { setGrants(userId: $u, deviceIds: $d) }`;
    expect((await h.ok(root.token, set, { u: a.id, d: [d2, d1, d2] })).setGrants.sort()).toEqual([d1, d2].sort());
    expect(codes(await h.gql(root.token, set, { u: a.id, d: ["nope"] }))).toEqual(["BAD_USER_INPUT"]);
    expect((await h.ok(root.token, `query($u: ID!) { grants(userId: $u) }`, { u: a.id })).grants.sort()).toEqual([d1, d2].sort());
  });

  it("rejects an out-of-range state patch", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const d = await h.device();
    const r = await h.gql(root.token, `mutation($id: ID!) { setDeviceState(id: $id, patch: { brightness: 101 }) { id } }`, { id: d });
    expect(codes(r)).toEqual(["BAD_USER_INPUT"]);
    expect(h.drivers.KASA.commands).toEqual([]);
  });
});
