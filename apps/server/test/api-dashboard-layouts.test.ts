import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const LAYOUTS = `{ dashboardLayouts { tab isDefault items { deviceId size } } }`;
const WITH_WIDGETS = `{ dashboardLayouts { tab items { deviceId widget size } } }`;
const SAVE = `mutation($tab: ID!, $items: [LayoutItemInput!]!, $asDefault: Boolean) {
  saveDashboardLayout(tab: $tab, items: $items, asDefault: $asDefault) { tab isDefault items { deviceId size } }
}`;
const RESET = `mutation($tab: ID!) { resetDashboardLayout(tab: $tab) { tab isDefault items { deviceId size } } }`;

const item = (deviceId: string, size = "S1x1") => ({ deviceId, size });

describe("dashboard layouts", () => {
  it("returns no layouts before anything is saved", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    expect((await h.ok(ann.token, LAYOUTS)).dashboardLayouts).toEqual([]);
  });

  it("saves and reads back a user's own layout", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const d1 = await h.device();
    const d2 = await h.device();
    await h.grant(ann.id, d1, d2);
    const items = [item(d2, "L2x2"), item(d1)];
    const saved = (await h.ok(ann.token, SAVE, { tab: "all", items })).saveDashboardLayout;
    expect(saved).toEqual({ tab: "all", isDefault: false, items });
    expect((await h.ok(ann.token, LAYOUTS)).dashboardLayouts).toEqual([{ tab: "all", isDefault: false, items }]);
  });

  it("serves the admin default to users without an override, filtered by access", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const [d1, d2, d3] = [await h.device(), await h.device(), await h.device()];
    await h.grant(ann.id, d1, d3);
    await h.ok(root.token, SAVE, { tab: "all", items: [item(d1, "L2x2"), item(d2, "W2x1"), item(d3)], asDefault: true });
    expect((await h.ok(ann.token, LAYOUTS)).dashboardLayouts).toEqual([
      { tab: "all", isDefault: true, items: [item(d1, "L2x2"), item(d3)] },
    ]);
  });

  it("forbids a USER from saving a default", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    expect(codes(await h.gql(ann.token, SAVE, { tab: "all", items: [], asDefault: true }))).toEqual(["FORBIDDEN"]);
  });

  it("drops unknown and inaccessible device ids on save", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const d1 = await h.device();
    const d9 = await h.device();
    await h.grant(ann.id, d1);
    const saved = (await h.ok(ann.token, SAVE, { tab: "all", items: [item(d1), item("nope"), item(d9)] })).saveDashboardLayout;
    expect(saved.items).toEqual([item(d1)]);
    expect((await h.ok(ann.token, LAYOUTS)).dashboardLayouts[0].items).toEqual([item(d1)]);
  });

  it("rejects an unknown tab and duplicate ids, and accepts a room id", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const d1 = await h.device();
    await h.grant(ann.id, d1);
    const room = await h.db.room.create({ data: { name: "Rancho", sortOrder: 1 } });
    expect(codes(await h.gql(ann.token, SAVE, { tab: "nope", items: [] }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(ann.token, SAVE, { tab: "all", items: [item(d1), item(d1)] }))).toEqual(["BAD_USER_INPUT"]);
    expect((await h.ok(ann.token, SAVE, { tab: room.id, items: [item(d1)] })).saveDashboardLayout.tab).toBe(room.id);
  });

  it("reset returns the default in effect, or null", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const d1 = await h.device();
    await h.grant(ann.id, d1);
    await h.ok(ann.token, SAVE, { tab: "all", items: [item(d1, "L2x2")] });
    expect((await h.ok(ann.token, RESET, { tab: "all" })).resetDashboardLayout).toBeNull();
    expect((await h.ok(ann.token, LAYOUTS)).dashboardLayouts).toEqual([]);

    await h.ok(root.token, SAVE, { tab: "all", items: [item(d1, "W2x1")], asDefault: true });
    await h.ok(ann.token, SAVE, { tab: "all", items: [item(d1, "L2x2")] });
    expect((await h.ok(ann.token, RESET, { tab: "all" })).resetDashboardLayout).toEqual({ tab: "all", isDefault: true, items: [item(d1, "W2x1")] });
  });

  it("saving as default replaces the admin's own override", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const d1 = await h.device();
    await h.ok(root.token, SAVE, { tab: "all", items: [item(d1, "L2x2")] });
    await h.ok(root.token, SAVE, { tab: "all", items: [item(d1, "T1x2")], asDefault: true });
    expect((await h.ok(root.token, LAYOUTS)).dashboardLayouts).toEqual([{ tab: "all", isDefault: true, items: [item(d1, "T1x2")] }]);
  });

  it("deleting a room deletes its layouts", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const d1 = await h.device();
    const room = await h.db.room.create({ data: { name: "Rancho", sortOrder: 1 } });
    await h.ok(root.token, SAVE, { tab: room.id, items: [item(d1)] });
    await h.ok(root.token, SAVE, { tab: room.id, items: [item(d1)], asDefault: true });
    await h.ok(root.token, `mutation($id: ID!) { deleteRoom(id: $id) }`, { id: room.id });
    expect(await h.db.userDashboardLayout.count()).toBe(0);
    expect(await h.db.defaultDashboardLayout.count()).toBe(0);
  });

  it("deleting a user deletes their layouts", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    await h.ok(ann.token, SAVE, { tab: "all", items: [] });
    await h.ok(root.token, `mutation($id: ID!) { deleteUser(id: $id) }`, { id: ann.id });
    expect(await h.db.userDashboardLayout.count()).toBe(0);
  });

  it("keeps widgets for everyone while still dropping devices a user can't see", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const [d1, d2] = [await h.device(), await h.device()];
    await h.grant(ann.id, d1);
    const items = [{ widget: "WEATHER", size: "W2x1" }, item(d1), item(d2), { widget: "SUN", size: "S1x1" }];
    await h.ok(root.token, SAVE, { tab: "all", items, asDefault: true });
    const got = (await h.ok(ann.token, WITH_WIDGETS)).dashboardLayouts[0].items;
    expect(got).toEqual([
      { deviceId: null, widget: "WEATHER", size: "W2x1" },
      { deviceId: d1, widget: null, size: "S1x1" },
      { deviceId: null, widget: "SUN", size: "S1x1" },
    ]);
  });
});

