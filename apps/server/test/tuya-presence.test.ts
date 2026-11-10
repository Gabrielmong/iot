import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { FakeTuyaDevice } from "../../../packages/protocols/src/test/fake-tuya-device.js";
import { tuyaPresent } from "../src/devices/tuya-presence.js";

const LOCAL_KEY = "0123456789abcdef";
let fake: FakeTuyaDevice | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

async function present(version: "3.3" | "3.5", opts: { key?: string; respPayload?: (nonce: Buffer) => Buffer } = {}) {
  fake = await FakeTuyaDevice.start({ version, id: "cam1", localKey: LOCAL_KEY, dps: { "1": true }, respPayload: opts.respPayload });
  return tuyaPresent({ ip: "127.0.0.1", externalId: "cam1", localKey: opts.key ?? LOCAL_KEY, version }, { port: fake.port, timeoutMs: 500 });
}

describe("tuyaPresent", () => {
  it("accepts a 3.5 device only after the session-key handshake and a status reply", async () => {
    expect(await present("3.5")).toBe(true);
    expect(fake!.log).toContain("reply query");
  });

  it("rejects a 3.5 handshake reply not bound to our fresh nonce (a replay), before any query", async () => {
    expect(await present("3.5", { respPayload: () => randomBytes(48) })).toBe(false);
    expect(fake!.log).not.toContain("recv query");
  });

  it("rejects the wrong local key", async () => {
    expect(await present("3.5", { key: "fedcba9876543210" })).toBe(false);
    expect(await present("3.3", { key: "fedcba9876543210" })).toBe(false);
  });

  it("answers false when nothing listens", async () => {
    expect(await tuyaPresent({ ip: "127.0.0.1", externalId: "x", localKey: LOCAL_KEY, version: "3.5" }, { port: 9, timeoutMs: 300 })).toBe(false);
  });
});
