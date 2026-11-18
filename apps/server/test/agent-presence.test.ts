import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ApiHarness } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const conn = () => ({ send: vi.fn(), close: vi.fn() });
const INFO = `query($i: ID!) { device(id: $i) { computer { confirmable agent { connected version } } } }`;
const WAKE = `mutation($i: ID!) { setDeviceState(id: $i, patch: { on: true }) { id } }`;

async function agentPc(config: Record<string, unknown> = { mac: "11:22:33:44:55:66" }): Promise<string> {
  return h.device({ brand: "WOL", kind: "COMPUTER", externalId: "11:22:33:44:55:66", name: "Gandalf", ip: "192.168.0.150", config, agentTokenHash: "hash-1", agentVersion: 1007 });
}

async function sources(id: string) {
  await h.manager.idle();
  return (await h.db.powerEvent.findMany({ where: { deviceId: id }, orderBy: { at: "asc" } })).map((e) => [e.on, e.source]);
}

describe("agent presence", () => {
  it("a connected agent marks a probe-silent PC on, and the PC counts as confirmable", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const id = await agentPc();
    h.drivers.WOL.pushState(id, { online: true }); // the probe has never seen it
    expect((await h.ok(admin.token, INFO, { i: id })).device.computer).toEqual({ confirmable: true, agent: { connected: false, version: 1007 } });
    h.agents.attach(id, conn());
    expect(h.manager.getState(id).on).toBe(true);
    expect((await h.ok(admin.token, INFO, { i: id })).device.computer.agent).toEqual({ connected: true, version: 1007 });
    expect(await sources(id)).toEqual([[true, "AGENT"]]);
  });

  it("while the agent is connected a probe that sees nothing doesn't turn the PC off", async () => {
    h = await ApiHarness.start();
    const id = await agentPc({ mac: "11:22:33:44:55:66", probeSeen: true });
    h.agents.attach(id, conn());
    h.drivers.WOL.pushState(id, { online: true, on: false });
    expect(h.manager.getState(id).on).toBe(true);
  });

  it("when the agent disconnects the PC is off until the probe sees it", async () => {
    h = await ApiHarness.start();
    const id = await agentPc();
    const c = conn();
    h.agents.attach(id, c);
    h.agents.detach(id, c);
    expect(h.manager.getState(id).on).toBe(false);
    h.drivers.WOL.pushState(id, { online: true }); // silent probe: stays off
    expect(h.manager.getState(id).on).toBe(false);
    h.drivers.WOL.pushState(id, { online: true, on: true });
    expect(h.manager.getState(id).on).toBe(true);
    expect(await sources(id)).toEqual([[true, "AGENT"], [false, "AGENT"], [true, "PROBE"]]);
  });

  it("a wake ends as soon as the agent connects", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const id = await agentPc();
    h.drivers.WOL.pushState(id, { online: true });
    await h.ok(admin.token, WAKE, { i: id });
    expect(h.manager.wakes.get(id)?.status).toBe("WAKING");
    h.agents.attach(id, conn());
    expect(h.manager.wakes.get(id)?.status).toBe("WOKE");
  });

  it("an On seen by the probe during a wake is recorded as a wake", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const id = await h.device({ brand: "WOL", kind: "COMPUTER", externalId: "11:22:33:44:55:77", ip: "192.168.0.151", config: { mac: "11:22:33:44:55:77", probeSeen: true } });
    h.drivers.WOL.pushState(id, { online: true, on: false });
    await h.ok(admin.token, WAKE, { i: id });
    h.drivers.WOL.pushState(id, { online: true, on: true });
    expect(await sources(id)).toEqual([[false, "PROBE"], [true, "WAKE"]]);
  });
});
