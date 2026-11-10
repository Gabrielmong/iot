import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const DEVICE = `query($id: ID!) { device(id: $id) { id name connection streamSource ip lastSeenAt } }`;

describe("device(id)", () => {
  it("gives a granted USER the device, on a LOCAL connection, without its IP", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann");
    const d1 = await h.device({ name: "Lamp" });
    await h.grant(a.id, d1);

    const { device } = await h.ok(a.token, DEVICE, { id: d1 });
    expect(device).toMatchObject({ id: d1, name: "Lamp", connection: "LOCAL", streamSource: null, ip: null });
  });

  it("gives an ADMIN the IP and last-seen time", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const seen = new Date("2026-01-02T03:04:05.000Z");
    const d1 = await h.device({ ip: "10.9.9.9", lastSeenAt: seen });

    const { device } = await h.ok(admin.token, DEVICE, { id: d1 });
    expect(device.ip).toBe("10.9.9.9");
    expect(device.lastSeenAt).toBe(seen.toISOString());
  });

  it("returns null for an ungranted, unknown or non-adopted device", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann");
    const admin = await h.user("Root", "ADMIN");
    const d2 = await h.device();
    const draft = await h.device({ adopted: false });
    await h.grant(a.id, draft);

    expect((await h.ok(a.token, DEVICE, { id: d2 })).device).toBeNull();
    expect((await h.ok(a.token, DEVICE, { id: "nope" })).device).toBeNull();
    expect((await h.ok(a.token, DEVICE, { id: draft })).device).toBeNull();
    expect((await h.ok(admin.token, DEVICE, { id: draft })).device).toBeNull();
  });

  it("marks a cloud-streamed Tuya camera as a CLOUD connection", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const cam = await h.device({ brand: "TUYA", kind: "CAMERA", streamSource: "CLOUD" });

    const { device } = await h.ok(admin.token, DEVICE, { id: cam });
    expect(device).toMatchObject({ connection: "CLOUD", streamSource: "CLOUD" });
  });

  it("requires a session", async () => {
    h = await ApiHarness.start();
    const r = await h.gql(null, DEVICE, { id: "x" });
    expect(r.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });
});
