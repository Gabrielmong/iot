import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const EXE = Buffer.from("MZ fake agent exe bytes");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function agentDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-"));
  writeFileSync(join(dir, "HomeAgent.exe"), EXE);
  writeFileSync(join(dir, "agent.json"), JSON.stringify({ version: 1007, sha256: sha(EXE) }));
  return dir;
}

/** Splits a downloaded exe into its body and the decoded trailer. */
function readTrailer(buf: Buffer): { body: Buffer; payload: unknown } {
  expect(buf.subarray(buf.length - 8).toString("ascii")).toBe("HOMEAGT1");
  const len = buf.readUInt32LE(buf.length - 12);
  const json = buf.subarray(buf.length - 12 - len, buf.length - 12);
  return { body: buf.subarray(0, buf.length - 12 - len), payload: JSON.parse(json.toString("utf8")) };
}

const get = (path: string) => fetch(`http://127.0.0.1:${h.server.port}${path}`);
const CREATE = `mutation { createAgentEnrollment { downloadUrl } }`;

describe("agent download", () => {
  it("serves the exe with a trailer carrying the server address and the code", async () => {
    h = await ApiHarness.start({ agentDir: agentDir() });
    const admin = await h.user("Root", "ADMIN");
    const url: string = (await h.ok(admin.token, CREATE)).createAgentEnrollment.downloadUrl;
    const code = url.split("/").at(-1)!;
    const res = await get(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="HomeAgent-${code.slice(0, 8)}.exe"`);
    const { body, payload } = readTrailer(Buffer.from(await res.arrayBuffer()));
    expect(body.equals(EXE)).toBe(true);
    expect(payload).toEqual({ server: `http://127.0.0.1:${h.server.port}`, code });
  });

  it("a used or unknown code is gone", async () => {
    h = await ApiHarness.start({ agentDir: agentDir() });
    expect((await get(`/agent/download/${"x".repeat(22)}`)).status).toBe(410);
  });

  it("says the agent isn't available when none is published", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const url: string = (await h.ok(admin.token, CREATE)).createAgentEnrollment.downloadUrl;
    const res = await get(url);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "UNAVAILABLE", message: "The agent isn't available yet" });
    expect((await get("/agent/HomeAgent.exe")).status).toBe(503);
  });

  it("serves the plain exe for updates, matching the published hash", async () => {
    h = await ApiHarness.start({ agentDir: agentDir() });
    const res = await get("/agent/HomeAgent.exe");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(EXE)).toBe(true);
    expect(sha(buf)).toBe(sha(EXE));
  });
});
