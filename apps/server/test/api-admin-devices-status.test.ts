import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const ADMIN_DEVICES = `{ adminDevices { id adopted online testable testBlockedReason } }`;
type Row = { id: string; adopted: boolean; online: boolean; testable: boolean; testBlockedReason: string | null };

describe("adminDevices status and test availability", () => {
  it("reports online, testable and the reason a device can't be tested", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const seen = new Date(h.time);
    const fresh = await h.device({ adopted: false, lastSeenAt: seen });
    const camera = await h.device({ adopted: false, kind: "CAMERA", lastSeenAt: seen });
    const mine = await h.device({ lastSeenAt: seen });
    h.drivers.KASA.pushState(mine, { online: true, on: true });

    const rows: Row[] = (await h.ok(root.token, ADMIN_DEVICES)).adminDevices;
    const byId = (id: string) => rows.find((r) => r.id === id)!;
    expect(byId(fresh)).toMatchObject({ adopted: false, testable: true, testBlockedReason: null, online: false });
    expect(byId(camera)).toMatchObject({ testable: false, testBlockedReason: "Cameras can't be switched" });
    expect(byId(mine)).toMatchObject({ adopted: true, online: true, testable: false, testBlockedReason: null });
  });
});
