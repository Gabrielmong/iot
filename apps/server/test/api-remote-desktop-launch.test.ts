import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const LAUNCH = `{ remoteDesktopLaunch }`;

/** Tests reach the API over loopback, so the viewer is "this server", whose addresses include 127.0.0.1. */
async function pc(ip: string, agent: boolean) {
  await h.db.device.create({
    data: { kind: "COMPUTER", brand: "WOL", externalId: `mac-${ip}-${agent}`, name: "PC", adopted: true, ip, config: {}, agentTokenHash: agent ? `hash-${ip}` : null },
  });
}

describe("remoteDesktopLaunch", () => {
  it("is true only when the viewer's own PC has the HomeAgent", async () => {
    h = await ApiHarness.start();
    const bob = await h.user("Bob");
    expect((await h.ok(bob.token, LAUNCH)).remoteDesktopLaunch).toBe(false);
    await pc("127.0.0.1", false);
    expect((await h.ok(bob.token, LAUNCH)).remoteDesktopLaunch).toBe(false);
    await pc("192.0.2.10", true);
    expect((await h.ok(bob.token, LAUNCH)).remoteDesktopLaunch).toBe(false);
    await pc("127.0.0.1", true);
    expect((await h.ok(bob.token, LAUNCH)).remoteDesktopLaunch).toBe(true);
  });

  it("needs a signed-in user", async () => {
    h = await ApiHarness.start();
    expect(codes(await h.gql(null, LAUNCH))).toEqual(["UNAUTHENTICATED"]);
  });
});
