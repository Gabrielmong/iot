import { createHash } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const CREATE = `mutation { createAgentEnrollment { downloadUrl expiresAt } }`;
const UPDATE = `mutation($i: ID!, $m: String!, $ip: String) { updateComputer(id: $i, mac: $m, ip: $ip) { id ip } }`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function newCode(token: string): Promise<string> {
  const r = await h.ok(token, CREATE);
  return r.createAgentEnrollment.downloadUrl.replace("/agent/download/", "");
}

function enroll(body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${h.server.port}/agent/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const pc = (code: string, over: Record<string, unknown> = {}) => ({
  code,
  hostname: "GANDALF",
  macs: ["11:22:33:44:55:66", "AA-BB-CC-DD-EE-01"],
  wakeMac: "11:22:33:44:55:66",
  ips: ["192.168.0.150"],
  os: "Windows 11 Pro",
  agentVersion: 1001,
  ...over,
});

describe("agent enrollment", () => {
  it("only admins create codes; a code's download URL works for 30 minutes", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    expect(codes(await h.gql(bob.token, CREATE))).toEqual(["FORBIDDEN"]);
    const r = await h.ok(admin.token, CREATE);
    expect(r.createAgentEnrollment.downloadUrl).toMatch(/^\/agent\/download\/[A-Za-z0-9_-]{22}$/);
    expect(new Date(r.createAgentEnrollment.expiresAt).getTime()).toBe(h.time + 30 * 60_000);
  });

  it("enrolling creates a PC named after the host, with the wake MAC, and stores only the token's hash", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const res = await enroll(pc(await newCode(admin.token)));
    expect(res.status).toBe(200);
    const { deviceId, token } = (await res.json()) as { deviceId: string; token: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await h.db.device.findUniqueOrThrow({ where: { id: deviceId } });
    expect(row).toMatchObject({ brand: "WOL", kind: "COMPUTER", adopted: true, name: "GANDALF", externalId: "11:22:33:44:55:66", ip: "192.168.0.150", agentVersion: 1001 });
    expect(row.config).toEqual({ mac: "11:22:33:44:55:66", macs: ["11:22:33:44:55:66", "aa:bb:cc:dd:ee:01"] });
    expect(row.agentTokenHash).toBe(sha(token));
  });

  it("a code works once", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const code = await newCode(admin.token);
    expect((await enroll(pc(code))).status).toBe(200);
    expect((await enroll(pc(code))).status).toBe(410);
    expect(await h.db.device.count()).toBe(1);
  });

  it("an expired or unknown code is gone", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const code = await newCode(admin.token);
    h.advance(31 * 60_000);
    expect((await enroll(pc(code))).status).toBe(410);
    expect((await enroll(pc("x".repeat(22)))).status).toBe(410);
    expect(await h.db.device.count()).toBe(0);
  });

  it("adopting a PC added by hand (matched by a secondary MAC) keeps the device and its grants", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const bob = await h.user("Bob");
    const id = await h.device({ brand: "WOL", kind: "COMPUTER", externalId: "aa:bb:cc:dd:ee:01", name: "Office PC", config: { mac: "aa:bb:cc:dd:ee:01" } });
    await h.grant(bob.id, id);
    const res = await enroll(pc(await newCode(admin.token)));
    expect(((await res.json()) as { deviceId: string }).deviceId).toBe(id);
    const row = await h.db.device.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ name: "Office PC", externalId: "11:22:33:44:55:66" });
    expect((row.config as { mac: string }).mac).toBe("11:22:33:44:55:66");
    expect(await h.db.deviceGrant.count({ where: { deviceId: id } })).toBe(1);
    expect(await h.db.device.count()).toBe(1);
  });

  it("refuses a malformed body", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const code = await newCode(admin.token);
    expect((await enroll({ code })).status).toBe(400);
    expect((await enroll(pc(code, { wakeMac: "nope" }))).status).toBe(400);
    // the code survives a malformed attempt
    expect((await enroll(pc(code))).status).toBe(200);
  });

  it("editing an adopted PC's IP keeps the MACs the agent reported", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const { deviceId } = (await (await enroll(pc(await newCode(admin.token)))).json()) as { deviceId: string };
    await h.ok(admin.token, UPDATE, { i: deviceId, m: "11:22:33:44:55:66", ip: "192.168.0.151" });
    const row = await h.db.device.findUniqueOrThrow({ where: { id: deviceId } });
    expect((row.config as { macs: string[] }).macs).toEqual(["11:22:33:44:55:66", "aa:bb:cc:dd:ee:01"]);
  });
});
