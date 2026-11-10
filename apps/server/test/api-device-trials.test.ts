import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DEVICE_STATE, DEVICES_CHANGED } from "../src/devices/topics.js";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const START = `mutation($id: ID!) { startDeviceTrial(id: $id) { deviceId state { online on } } }`;
const SET = `mutation($id: ID!, $on: Boolean!) { setTrialState(id: $id, on: $on) { deviceId state { online on } } }`;
const END = `mutation($id: ID!) { endDeviceTrial(id: $id) }`;
const ADOPT = `mutation($id: ID!) { adoptDevice(id: $id, name: "Kettle") { id adopted } }`;

/** An un-adopted Kasa plug, seen just now, whose driver reports it on once it is linked. */
async function newPlug() {
  const id = await h.device({ adopted: false, lastSeenAt: new Date(h.time) });
  h.drivers.KASA.syncImpl = async (devices) => {
    if (devices.some((d) => d.id === id)) setTimeout(() => h.drivers.KASA.pushState(id, { online: true, on: true }), 0);
  };
  return id;
}

const lastSyncIds = () => (h.drivers.KASA.synced.at(-1) ?? []).map((d) => d.id);

describe("device trials", () => {
  it("starts a trial and returns the device's real state without publishing it", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const id = await newPlug();
    const publish = vi.spyOn(h.pubsub, "publish");
    const trial = (await h.ok(root.token, START, { id })).startDeviceTrial;
    expect(trial).toEqual({ deviceId: id, state: { online: true, on: true } });
    expect(lastSyncIds()).toContain(id);
    expect(publish.mock.calls.filter(([topic]) => topic === DEVICE_STATE || topic === DEVICES_CHANGED)).toEqual([]);
  });

  it("switches a trial device", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const id = await newPlug();
    await h.ok(root.token, START, { id });
    await h.ok(root.token, SET, { id, on: false });
    expect(h.drivers.KASA.commands.at(-1)).toEqual({ deviceId: id, patch: { on: false } });
  });

  it("keeps trial devices out of the devices query", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const id = await newPlug();
    await h.ok(root.token, START, { id });
    expect((await h.ok(root.token, `{ devices { id } }`)).devices).toEqual([]);
  });

  it("ends a trial on request", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const id = await newPlug();
    await h.ok(root.token, START, { id });
    expect((await h.ok(root.token, END, { id })).endDeviceTrial).toBe(true);
    expect(lastSyncIds()).not.toContain(id);
  });

  it("ends a trial after 2 minutes without use and ignores later reports", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const id = await newPlug();
    await h.ok(root.token, START, { id });
    h.time += 120_000;
    await h.manager.sweepTrials();
    expect(lastSyncIds()).not.toContain(id);
    expect(codes(await h.gql(root.token, SET, { id, on: true }))).toEqual(["BAD_USER_INPUT"]);
    h.drivers.KASA.pushState(id, { online: true, on: false });
    expect(h.manager.getState(id).online).toBe(false);
  });

  it("continues as a normal adopted device when adopted during a trial", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const id = await newPlug();
    await h.ok(root.token, START, { id });
    expect((await h.ok(root.token, ADOPT, { id })).adoptDevice.adopted).toBe(true);
    expect(lastSyncIds().filter((x) => x === id)).toHaveLength(1);
    expect(codes(await h.gql(root.token, SET, { id, on: true }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("rejects non-admins, adopted devices and devices that can't be tested", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const id = await newPlug();
    const adopted = await h.device();
    const camera = await h.device({ adopted: false, kind: "CAMERA", lastSeenAt: new Date(h.time) });
    expect(codes(await h.gql(ann.token, START, { id }))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(root.token, START, { id: adopted }))).toEqual(["BAD_USER_INPUT"]);
    const cam = await h.gql(root.token, START, { id: camera });
    expect(codes(cam)).toEqual(["BAD_USER_INPUT"]);
    expect(cam.errors?.[0].message).toBe("Cameras can't be switched");
  });

  it("keeps the trial's last state when the device is adopted (no further report needed)", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const id = await newPlug();
    await h.ok(root.token, START, { id });
    h.drivers.KASA.syncImpl = undefined;
    await h.ok(root.token, ADOPT, { id });
    expect(h.manager.getState(id)).toMatchObject({ online: true, on: true });
  });

  it("reports the device as unreachable when it doesn't answer, and ends the trial", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const id = await h.device({ adopted: false, lastSeenAt: new Date(h.time) });
    expect(codes(await h.gql(root.token, START, { id }))).toEqual(["DEVICE_UNREACHABLE"]);
    expect(lastSyncIds()).not.toContain(id);
  }, 10_000);

  it("logs and carries on when ending an expired trial fails", async () => {
    const errors: unknown[] = [];
    h = await ApiHarness.start({ log: { info: () => {}, warn: () => {}, error: (...a: unknown[]) => errors.push(a) } });
    const root = await h.user("Root", "ADMIN");
    const id = await newPlug();
    await h.ok(root.token, START, { id });
    h.time += 120_000;
    vi.spyOn(h.manager, "endTrial").mockRejectedValueOnce(new Error("db down"));
    await expect(h.manager.sweepTrials()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});
