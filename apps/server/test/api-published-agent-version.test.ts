import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const PUBLISHED = `{ publishedAgentVersion }`;

function agentDir(version: number): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-"));
  writeFileSync(join(dir, "HomeAgent.exe"), "MZ");
  writeFileSync(join(dir, "agent.json"), JSON.stringify({ version, sha256: "a".repeat(64) }));
  return dir;
}

describe("publishedAgentVersion", () => {
  it("is the version agents are offered, for admins", async () => {
    h = await ApiHarness.start({ agentDir: agentDir(1012) });
    const admin = await h.user("Root", "ADMIN");
    expect((await h.ok(admin.token, PUBLISHED)).publishedAgentVersion).toBe(1012);
  });

  it("is null when no agent is published", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    expect((await h.ok(admin.token, PUBLISHED)).publishedAgentVersion).toBeNull();
  });

  it("is admin only", async () => {
    h = await ApiHarness.start({ agentDir: agentDir(1012) });
    const bob = await h.user("Bob");
    expect(codes(await h.gql(bob.token, PUBLISHED))).toEqual(["FORBIDDEN"]);
  });
});
