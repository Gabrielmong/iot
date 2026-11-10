import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const UPDATE = `mutation($i: ID!, $k: DeviceKind) { updateDevice(id: $i, kind: $k) { kind } }`;
const ADOPT = `mutation($i: ID!, $k: DeviceKind) { adoptDevice(id: $i, name: "Thing", kind: $k) { kind } }`;

describe("device kind", () => {
  it("a TV or a computer keeps its kind, and nothing else becomes one (a PC as a plug would be grantable to guests)", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const pc = await h.device({ brand: "WOL", kind: "COMPUTER", config: { mac: "aa:bb:cc:dd:ee:ff" } });
    const tv = await h.device({ brand: "ANDROID_TV", kind: "TV", adopted: false });
    const plug = await h.device({ brand: "TUYA", kind: "PLUG" });

    const pcToPlug = await h.gql(admin.token, UPDATE, { i: pc, k: "PLUG" });
    expect(codes(pcToPlug)).toEqual(["BAD_USER_INPUT"]);
    expect(pcToPlug.errors![0].message).toBe("TVs and computers keep their kind");
    expect(codes(await h.gql(admin.token, ADOPT, { i: tv, k: "SWITCH" }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(admin.token, UPDATE, { i: plug, k: "TV" }))).toEqual(["BAD_USER_INPUT"]);
    expect((await h.db.device.findUniqueOrThrow({ where: { id: pc } })).kind).toBe("COMPUTER");

    expect((await h.ok(admin.token, ADOPT, { i: tv, k: "TV" })).adoptDevice.kind).toBe("TV");
    expect((await h.ok(admin.token, UPDATE, { i: plug, k: "LIGHT" })).updateDevice.kind).toBe("LIGHT");
  });
});
