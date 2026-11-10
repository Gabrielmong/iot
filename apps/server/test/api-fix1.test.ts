import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "../src/auth/sessions.js";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const expiresAt = async (token: string) => (await h.db.session.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } })).expiresAt.getTime();

/** Runs one operation over the socket and returns its first result (or the error). */
function wsOnce(ws: ReturnType<ApiHarness["wsClient"]>, query: string): Promise<unknown> {
  return new Promise((resolve) => {
    ws.client.subscribe({ query }, { next: resolve, error: resolve, complete: () => {} });
  });
}

describe("WebSocket operations", () => {
  it("rejects queries and mutations over the socket", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ws = h.wsClient(root.token);
    const result = await wsOnce(ws, `mutation { createRoom(name: "Sneaky") { id } }`);
    expect(JSON.stringify(result)).toContain("Only subscriptions over WebSocket");
    expect(await h.db.room.count()).toBe(0);
    expect(JSON.stringify(await wsOnce(ws, `{ me { id } }`))).toContain("Only subscriptions over WebSocket");
  });

  it("closes a user's socket with 4401 when their role or PIN changes", async () => {
    h = await ApiHarness.start({ sessionCheckMs: 50 });
    const root = await h.user("Root", "ADMIN");
    const a = await h.user("Ann");
    const b = await h.user("Bob");
    const wsA = h.wsClient(a.token);
    const wsB = h.wsClient(b.token);
    await h.subscribe(wsA, `subscription { devicesChanged }`);
    await h.subscribe(wsB, `subscription { devicesChanged }`);

    await h.ok(root.token, `mutation($id: ID!) { updateUser(id: $id, role: ADMIN) { id } }`, { id: a.id });
    await h.ok(root.token, `mutation($id: ID!) { updateUser(id: $id, pin: "9753") { id } }`, { id: b.id });
    await vi.waitFor(() => expect([wsA.closes, wsB.closes]).toEqual([[4401], [4401]]));
    expect(codes(await h.gql(a.token, `{ me { id } }`))).toEqual(["UNAUTHENTICATED"]);
  });

  it("keeps sessions when only the name or colour changes", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const a = await h.user("Ann");
    await h.ok(root.token, `mutation($id: ID!) { updateUser(id: $id, name: "Annie", avatarColor: "#abcdef") { id } }`, { id: a.id });
    expect((await h.ok(a.token, `{ me { name } }`)).me).toEqual({ name: "Annie" });
  });
});

describe("background requests", () => {
  it("do not slide a shared session when sent with x-home-background: 1", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann", "USER", { shared: true });
    const before = await expiresAt(a.token);
    h.advance(60_000);
    const res = await fetch(h.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${a.token}`, "x-home-background": "1" },
      body: JSON.stringify({ query: `{ devices { id } }` }),
    });
    expect(((await res.json()) as { errors?: unknown }).errors).toBeUndefined();
    expect(await expiresAt(a.token)).toBe(before);
  });
});

describe("Tuya sync and an admin's kind", () => {
  it("sets kind from the cloud only for unadopted or UNKNOWN devices", async () => {
    h = await ApiHarness.start({
      tuyaCloud: () => ({
        listDevices: async () =>
          ["chosen", "unknown", "fresh"].map((id) => ({ id, name: id, category: "dj", productId: "p", localKey: "0123456789abcdef" })),
      }),
    });
    const root = await h.user("Root", "ADMIN");
    await h.ok(root.token, `mutation { setTuyaCloud(accessId: "a", accessSecret: "s", region: "eu") { tuyaCloudConfigured } }`);
    const chosen = await h.device({ brand: "TUYA", kind: "SWITCH", externalId: "chosen" });
    const unknown = await h.device({ brand: "TUYA", kind: "UNKNOWN", externalId: "unknown" });
    const fresh = await h.device({ brand: "TUYA", kind: "PLUG", externalId: "fresh", adopted: false });

    await h.ok(root.token, `mutation { syncTuyaKeys { matched } }`);
    const kind = async (id: string) => (await h.db.device.findUniqueOrThrow({ where: { id } })).kind;
    expect([await kind(chosen), await kind(unknown), await kind(fresh)]).toEqual(["SWITCH", "LIGHT", "LIGHT"]);
  });
});

describe("admin-only operations", () => {
  const ADMIN_OPS = [
    `{ adminDevices { id } }`,
    `{ users { id } }`,
    `{ grants(userId: "x") }`,
    `{ integrations { kasaConfigured } }`,
    `mutation { createUser(name: "n", pin: "1234", role: USER, avatarColor: "#000000") { id } }`,
    `mutation { updateUser(id: "x", name: "n") { id } }`,
    `mutation { deleteUser(id: "x") }`,
    `mutation { setGrants(userId: "x", deviceIds: []) }`,
    `mutation { createRoom(name: "r") { id } }`,
    `mutation { updateRoom(id: "x", name: "r") { id } }`,
    `mutation { deleteRoom(id: "x") }`,
    `mutation { adoptDevice(id: "x", name: "n") { id } }`,
    `mutation { updateDevice(id: "x", name: "n") { id } }`,
    `mutation { removeDevice(id: "x") }`,
    `mutation { setTuyaCloud(accessId: "a", accessSecret: "s", region: "eu") { tuyaCloudConfigured } }`,
    `mutation { syncTuyaKeys { matched } }`,
    `mutation { setTuyaLocalKey(deviceId: "x", localKey: "k") { id } }`,
    `mutation { setKasaCredentials(username: "u", password: "p") { kasaConfigured } }`,
    `mutation { addKasaByIp(ip: "10.0.0.1") { id } }`,
  ];

  it("returns FORBIDDEN to a USER for every admin query and mutation", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann");
    for (const op of ADMIN_OPS) expect([op, codes(await h.gql(a.token, op))]).toEqual([op, ["FORBIDDEN"]]);
    expect(await h.db.setting.count()).toBe(0);
  });
});
