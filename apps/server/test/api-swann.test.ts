import { SwannAuthError, SwannNoStreamsError, SwannUnreachableError, type SwannProbeResult } from "@home/protocols";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "../src/secrets.js";
import { SettingKey } from "../src/settings-keys.js";
import { ApiHarness, codes, KEY, type HarnessOptions } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const FOUND: SwannProbeResult = {
  template: "t1",
  channels: [
    { channel: 1, mainPath: "/a", codec: "H264" },
    { channel: 2, mainPath: "/b", codec: "H265" },
    { channel: 3, mainPath: "/c", codec: "H264" },
  ],
};
const SET = `mutation { setSwannRecorder(host: "192.168.0.198", username: "admin", password: "s3cretpw") { channels codecs } }`;

async function start(opts?: HarnessOptions, role: "ADMIN" | "USER" = "ADMIN") {
  h = await ApiHarness.start(opts);
  return (await h.user("U", role)).token;
}

describe("setSwannRecorder", () => {
  it("probes, stores everything encrypted, refreshes drivers and reports configured", async () => {
    const swannProbe = vi.fn(async () => FOUND);
    const token = await start({ swannProbe });
    const syncs = h.drivers.KASA.synced.length;
    expect((await h.ok(token, SET)).setSwannRecorder).toEqual({ channels: 3, codecs: ["H264", "H265"] });
    expect(swannProbe).toHaveBeenCalledWith("192.168.0.198", { username: "admin", password: "s3cretpw" });
    const row = await h.db.setting.findUniqueOrThrow({ where: { key: SettingKey.swannPassword } });
    expect(row.value).not.toContain("s3cretpw");
    expect(decryptSecret(row.value, KEY)).toBe("s3cretpw");
    const probe = await h.db.setting.findUniqueOrThrow({ where: { key: SettingKey.swannProbe } });
    expect(JSON.parse(decryptSecret(probe.value, KEY))).toEqual(FOUND);
    expect(JSON.stringify(await h.db.setting.findMany())).not.toMatch(/s3cretpw|192\.168\.0\.198/);
    expect(h.drivers.KASA.synced.length).toBeGreaterThan(syncs);
    expect((await h.ok(token, `{ integrations { swannConfigured } }`)).integrations).toEqual({ swannConfigured: true });
  });

  it.each([
    [new SwannAuthError("bad"), "SWANN_AUTH_FAILED"],
    [new SwannUnreachableError("x"), "SWANN_UNREACHABLE"],
    [new SwannNoStreamsError("x"), "SWANN_NO_STREAMS"],
  ])("maps %s to %s, stores nothing and never echoes the password", async (err, code) => {
    const token = await start({ swannProbe: () => Promise.reject(err) });
    const r = await h.gql(token, SET);
    expect(codes(r)).toEqual([code]);
    expect(JSON.stringify(r)).not.toContain("s3cretpw");
    expect(await h.db.setting.count()).toBe(0);
    expect((await h.ok(token, `{ integrations { swannConfigured } }`)).integrations).toEqual({ swannConfigured: false });
  });

  it("rejects a non-IPv4 host without probing", async () => {
    const swannProbe = vi.fn(async () => FOUND);
    const token = await start({ swannProbe });
    const r = await h.gql(token, `mutation { setSwannRecorder(host: "nope", username: "a", password: "b") { channels } }`);
    expect(codes(r)).toEqual(["BAD_USER_INPUT"]);
    expect(swannProbe).not.toHaveBeenCalled();
  });

  it("is admin only", async () => {
    const swannProbe = vi.fn(async () => FOUND);
    const token = await start({ swannProbe }, "USER");
    expect(codes(await h.gql(token, SET))).toEqual(["FORBIDDEN"]);
    expect(swannProbe).not.toHaveBeenCalled();
  });
});
