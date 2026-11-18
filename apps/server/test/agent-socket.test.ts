import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { ApiHarness } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await h?.stop();
});
afterAll(closeDb);

const DAY = 86_400_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const REMOVE = `mutation($i: ID!) { removeDevice(id: $i) }`;

/** A connected test agent that records what the server sends. */
type Agent = { ws: WebSocket; got: any[]; status: number | null; closed: boolean };

function connect(token: string): Promise<Agent> {
  const ws = new WebSocket(`ws://127.0.0.1:${h.server.port}/agent/ws`, { headers: { authorization: `Bearer ${token}` } });
  sockets.push(ws);
  const agent: Agent = { ws, got: [], status: null, closed: false };
  ws.on("message", (d) => agent.got.push(JSON.parse(String(d))));
  ws.on("close", () => void (agent.closed = true));
  return new Promise((resolve) => {
    ws.on("open", () => resolve(agent));
    ws.on("unexpected-response", (_req, res) => {
      agent.status = res.statusCode ?? null;
      resolve(agent);
    });
    ws.on("error", () => resolve(agent));
  });
}

const send = (a: Agent, msg: Record<string, unknown>) => a.ws.send(JSON.stringify({ v: 1, ...msg }));
const hello = (a: Agent, over: Record<string, unknown> = {}) =>
  send(a, { t: "hello", version: 1007, hostname: "GANDALF", ips: ["192.168.0.150"], macs: ["11:22:33:44:55:66"], wakeMac: "11:22:33:44:55:66", os: "Windows 11", ...over });

async function pairedPc(token = "tok-1"): Promise<string> {
  return h.device({ brand: "WOL", kind: "COMPUTER", externalId: "11:22:33:44:55:66", name: "Gandalf", ip: "192.168.0.10", config: { mac: "11:22:33:44:55:66", macs: ["11:22:33:44:55:66"] }, agentTokenHash: sha(token) });
}

function agentDir(version: number): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-"));
  writeFileSync(join(dir, "HomeAgent.exe"), "MZ");
  writeFileSync(join(dir, "agent.json"), JSON.stringify({ version, sha256: "a".repeat(64) }));
  return dir;
}

describe("agent socket", () => {
  it("refuses an unknown token before upgrading", async () => {
    h = await ApiHarness.start();
    const a = await connect("nope");
    expect(a.status).toBe(401);
  });

  it("a hello connects the PC and updates its IP and MACs (only ever adding)", async () => {
    h = await ApiHarness.start();
    const id = await pairedPc();
    const a = await connect("tok-1");
    hello(a, { ips: ["192.168.0.150"], macs: ["aa:bb:cc:dd:ee:02"] });
    await vi.waitFor(async () => {
      const row = await h.db.device.findUniqueOrThrow({ where: { id } });
      expect(row.ip).toBe("192.168.0.150");
      expect(row.agentVersion).toBe(1007);
      expect((row.config as { macs: string[] }).macs).toEqual(["11:22:33:44:55:66", "aa:bb:cc:dd:ee:02"]);
    });
    expect(h.agents.isConnected(id)).toBe(true);
    expect(h.agents.info(id)).toEqual({ version: 1007 });
  });

  it("offers an update to an older agent", async () => {
    h = await ApiHarness.start({ agentDir: agentDir(1010) });
    await pairedPc();
    const a = await connect("tok-1");
    hello(a);
    await vi.waitFor(() => expect(a.got).toContainEqual({ v: 1, t: "update", version: 1010, url: "/agent/HomeAgent.exe", sha256: "a".repeat(64) }));
  });

  it("a second socket replaces the first, and the first closing doesn't disconnect the PC", async () => {
    h = await ApiHarness.start();
    const id = await pairedPc();
    const disconnected = vi.fn();
    h.agents.on("disconnected", disconnected);
    const first = await connect("tok-1");
    hello(first);
    await vi.waitFor(() => expect(h.agents.isConnected(id)).toBe(true));
    const second = await connect("tok-1");
    hello(second);
    await vi.waitFor(() => expect(first.closed).toBe(true));
    expect(h.agents.isConnected(id)).toBe(true);
    expect(disconnected).not.toHaveBeenCalled();
    second.ws.close();
    await vi.waitFor(() => expect(disconnected).toHaveBeenCalledWith(id));
  });

  it("removing a connected PC tells its agent to uninstall", async () => {
    h = await ApiHarness.start();
    const id = await pairedPc();
    const admin = await h.user("Root", "ADMIN");
    const a = await connect("tok-1");
    hello(a);
    await vi.waitFor(() => expect(h.agents.isConnected(id)).toBe(true));
    await h.ok(admin.token, REMOVE, { i: id });
    await vi.waitFor(() => expect(a.got).toContainEqual({ v: 1, t: "uninstall" }));
    expect(await h.db.agentRemoval.count()).toBe(1);
    send(a, { t: "uninstall.ack" });
    await vi.waitFor(async () => expect(await h.db.agentRemoval.count()).toBe(0));
  });

  it("an agent of a PC removed while it was off is told to uninstall when it comes back", async () => {
    h = await ApiHarness.start();
    const id = await pairedPc();
    const admin = await h.user("Root", "ADMIN");
    await h.ok(admin.token, REMOVE, { i: id });
    h.advance(20 * DAY);
    const a = await connect("tok-1");
    expect(a.status).toBeNull();
    await vi.waitFor(() => expect(a.got).toContainEqual({ v: 1, t: "uninstall" }));
    expect(await h.db.agentRemoval.count()).toBe(1); // kept until the agent confirms
    send(a, { t: "uninstall.ack" });
    await vi.waitFor(async () => expect(await h.db.agentRemoval.count()).toBe(0));
  });

  it("forgets a removal after 90 days", async () => {
    h = await ApiHarness.start();
    await h.db.agentRemoval.create({ data: { tokenHash: sha("tok-old"), createdAt: new Date(h.time - 91 * DAY) } });
    const a = await connect("tok-old");
    expect(a.status).toBe(401);
    expect(await h.db.agentRemoval.count()).toBe(0);
  });

  it("ignores unknown messages and keeps the socket open", async () => {
    h = await ApiHarness.start();
    const id = await pairedPc();
    const a = await connect("tok-1");
    hello(a);
    send(a, { t: "exec", cmd: "calc.exe" });
    a.ws.send("not json");
    send(a, { t: "heartbeat" });
    await vi.waitFor(() => expect(h.agents.isConnected(id)).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(a.closed).toBe(false);
  });
});
