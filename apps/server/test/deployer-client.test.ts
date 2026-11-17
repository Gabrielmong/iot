import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpDeployerClient } from "../src/deployer/client.js";
import { FAKE_TOKEN, FakeDeployer } from "./fakes/fake-deployer.js";

let dir: string;
let helper: FakeDeployer;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "deployer-client-"));
  helper = await new FakeDeployer().start();
});
afterEach(async () => {
  await helper.stop();
  rmSync(dir, { recursive: true, force: true });
});

const tokenFile = () => {
  const file = join(dir, "api-token");
  writeFileSync(file, `${FAKE_TOKEN}\n`);
  return file;
};

describe("httpDeployerClient", () => {
  it("sends the bearer token read from the file, on every call", async () => {
    const file = tokenFile();
    const client = httpDeployerClient(helper.url, file);
    expect(await client.status()).toMatchObject({ autoDeploy: { on: true } });
    writeFileSync(file, "rotated");
    expect(await client.status()).toBeUndefined(); // the new token is read, and refused
    expect(helper.auth).toEqual([`Bearer ${FAKE_TOKEN}`, "Bearer rotated"]);
  });

  it("is unavailable without a token file, or with a missing one", async () => {
    for (const file of [undefined, join(dir, "nope")]) {
      const client = httpDeployerClient(helper.url, file);
      expect(await client.status()).toBeUndefined();
      expect(await client.log("a")).toBeNull();
      await expect(client.command({ type: "deployNow", by: "Root" })).rejects.toMatchObject({ extensions: { code: "UNAVAILABLE" } });
    }
    expect(helper.auth).toEqual([]);
  });

  it("is unavailable when nothing listens, and when the helper hangs", async () => {
    const down = httpDeployerClient("http://127.0.0.1:9", tokenFile());
    expect(await down.status()).toBeUndefined();
    const hang: typeof fetch = (_u, init) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await httpDeployerClient(helper.url, tokenFile(), hang).status()).toBeUndefined();
  }, 10_000);

  it("reads a log (id URL-encoded) and maps 404 to null", async () => {
    helper.logs.set("a/b", "hello");
    const client = httpDeployerClient(helper.url, tokenFile());
    expect(await client.log("a/b")).toBe("hello");
    expect(await client.log("zzz")).toBeNull();
  });

  it("ciJobLog encodes the id and returns null when unavailable", async () => {
    helper.jobLogs.set("a/b", "job log");
    const client = httpDeployerClient(helper.url, tokenFile());
    expect(await client.ciJobLog("a/b")).toBe("job log");
    expect(await client.ciJobLog("9")).toBeNull();
    expect(await httpDeployerClient(helper.url, undefined).ciJobLog("a/b")).toBeNull();
  });

  it("gives ciJobLog 30 s (the first read downloads the log from GitHub)", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      await httpDeployerClient(helper.url, tokenFile()).ciJobLog("1");
      expect(timeout).toHaveBeenLastCalledWith(30_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("posts commands and maps errors", async () => {
    const client = httpDeployerClient(helper.url, tokenFile());
    expect(await client.command({ type: "rollback", sha: "abc1234", by: "Root" })).toBe("evt-1");
    expect(helper.commands).toEqual([{ type: "rollback", sha: "abc1234", by: "Root" }]);
    for (const [status, code] of [[409, "CONFLICT"], [400, "BAD_USER_INPUT"], [404, "NOT_FOUND"], [500, "UNAVAILABLE"]] as const) {
      helper.fail = { status, error: "nope" };
      await expect(client.command({ type: "pause", by: "Root" })).rejects.toMatchObject({ extensions: { code } });
    }
  });

  it("passes the helper's 404 message through, as NOT_FOUND", async () => {
    const client = httpDeployerClient(helper.url, tokenFile());
    helper.fail = { status: 404, error: "Unknown release abc1234" };
    await expect(client.command({ type: "rollback", sha: "abc1234", by: "Root" })).rejects.toMatchObject({
      message: "Unknown release abc1234",
      extensions: { code: "NOT_FOUND" },
    });
  });

  it("gives commands 30 s (Deploy now asks GitHub first), status and log 5 s", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const client = httpDeployerClient(helper.url, tokenFile());
      await client.command({ type: "deployNow", by: "Root" });
      expect(timeout).toHaveBeenLastCalledWith(30_000);
      await client.status();
      expect(timeout).toHaveBeenLastCalledWith(5000);
      await client.log("a");
      expect(timeout).toHaveBeenLastCalledWith(5000);
    } finally {
      timeout.mockRestore();
    }
  });
});
