import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { httpDeployerClient } from "../src/deployer/client.js";
import { ApiHarness, codes } from "./api-harness.js";
import { FAKE_TOKEN, FakeDeployer } from "./fakes/fake-deployer.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
let helper: FakeDeployer;
let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "api-deploys-"));
  writeFileSync(join(dir, "api-token"), FAKE_TOKEN);
  helper = await new FakeDeployer().start();
});
afterEach(async () => {
  await h?.stop();
  await helper.stop();
  rmSync(dir, { recursive: true, force: true });
});
afterAll(closeDb);

const start = async () => (h = await ApiHarness.start({ deployer: httpDeployerClient(helper.url, join(dir, "api-token")) }));

const STATUS = `{ deployStatus { available running { sha message deployedAt } autoDeploy pausedReason lastCheckAt lastCheckError busy helperUpdateAvailable events { id kind status sha by startedAt canRollback rollbackBlockedReason } } }`;
const MUTATIONS = ["deployNow", "restartApp", "pauseAutoDeploy", "resumeAutoDeploy", `rollbackDeploy(sha: "abc1234")`];

describe("deploys", () => {
  it("forbids users and guests", async () => {
    await start();
    const queries = [STATUS, `{ deployLog(eventId: "e1") }`, ...MUTATIONS.map((m) => `mutation { ${m} }`)];
    for (const [name, role] of [["Bob", "USER"], ["Gus", "GUEST"]] as const) {
      const u = await h.user(name, role);
      for (const q of queries) expect(codes(await h.gql(u.token, q))).toEqual(["FORBIDDEN"]);
    }
    expect(codes(await h.gql(null, STATUS))).toEqual(["UNAUTHENTICATED"]);
    expect(helper.auth).toEqual([]);
  });

  it("maps status for admins", async () => {
    await start();
    const event = { id: "e1", kind: "DEPLOY", status: "SUCCEEDED", sha: "abc1234", by: "auto", startedAt: "2026-11-10T09:59:00.000Z", canRollback: false, rollbackBlockedReason: "Running now" } as const;
    helper.status = {
      running: { sha: "abc1234", message: "Fix", deployedAt: "2026-11-10T10:00:00.000Z" },
      autoDeploy: { on: false, reason: "rolled back to abc1234" },
      lastCheck: { at: "2026-11-10T10:02:00.000Z", error: "GitHub is down" },
      busy: "Deploying def5678",
      helperUpdateAvailable: true,
      events: [event],
    };
    const admin = await h.user("Root", "ADMIN");
    const { deployStatus: s } = await h.ok(admin.token, STATUS);
    expect(s).toEqual({
      available: true,
      running: { sha: "abc1234", message: "Fix", deployedAt: "2026-11-10T10:00:00.000Z" },
      autoDeploy: false,
      pausedReason: "rolled back to abc1234",
      lastCheckAt: "2026-11-10T10:02:00.000Z",
      lastCheckError: "GitHub is down",
      busy: "Deploying def5678",
      helperUpdateAvailable: true,
      events: [event],
    });
  });

  it("reports unavailable when the helper is down", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const { deployStatus: s } = await h.ok(admin.token, STATUS);
    expect(s).toMatchObject({ available: false, running: null, autoDeploy: false, pausedReason: null, busy: null, helperUpdateAvailable: false, events: [] });
    expect((await h.ok(admin.token, `{ deployLog(eventId: "e1") }`)).deployLog).toBeNull();
    expect(codes(await h.gql(admin.token, `mutation { deployNow }`))).toEqual(["UNAVAILABLE"]);
  });

  it("returns a log, or null when the event has none", async () => {
    await start();
    helper.logs.set("e1", "built ok");
    const admin = await h.user("Root", "ADMIN");
    expect((await h.ok(admin.token, `{ deployLog(eventId: "e1") }`)).deployLog).toBe("built ok");
    expect((await h.ok(admin.token, `{ deployLog(eventId: "e2") }`)).deployLog).toBeNull();
  });

  it("passes the admin name as by", async () => {
    await start();
    const admin = await h.user("Gabriel", "ADMIN");
    expect((await h.ok(admin.token, `mutation { deployNow }`)).deployNow).toBe("evt-1");
    await h.ok(admin.token, `mutation { restartApp pauseAutoDeploy resumeAutoDeploy }`);
    expect(helper.commands).toEqual([
      { type: "deployNow", by: "Gabriel" },
      { type: "restartApp", by: "Gabriel" },
      { type: "pause", by: "Gabriel" },
      { type: "resume", by: "Gabriel" },
    ]);
  });

  it("maps busy to CONFLICT", async () => {
    await start();
    helper.fail = { status: 409, error: "Busy: Deploying abc1234" };
    const admin = await h.user("Root", "ADMIN");
    const r = await h.gql(admin.token, `mutation { deployNow }`);
    expect(codes(r)).toEqual(["CONFLICT"]);
    expect(r.errors?.[0]?.message).toBe("Busy: Deploying abc1234");
  });

  it("rollbackDeploy forwards the sha", async () => {
    await start();
    const admin = await h.user("Root", "ADMIN");
    await h.ok(admin.token, `mutation { rollbackDeploy(sha: "abc1234") }`);
    expect(helper.commands).toEqual([{ type: "rollback", sha: "abc1234", by: "Root" }]);
  });
});
