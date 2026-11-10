import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
const dist = mkdtempSync(join(tmpdir(), "home-web-"));
writeFileSync(join(dist, "index.html"), "<html>Home</html>");
writeFileSync(join(dist, "app.js"), "console.log(1)");

afterEach(() => h?.stop());
afterAll(async () => {
  rmSync(dist, { recursive: true, force: true });
  await closeDb();
});

describe("web app serving", () => {
  it("serves static files and falls back to index.html for client routes, next to /graphql", async () => {
    h = await ApiHarness.start({ webDist: dist });
    const base = `http://127.0.0.1:${h.server.port}`;
    expect(await (await fetch(`${base}/app.js`)).text()).toBe("console.log(1)");
    expect(await (await fetch(`${base}/admin/devices`)).text()).toBe("<html>Home</html>");
    expect((await h.ok(null, `{ loginUsers { id } }`)).loginUsers).toEqual([]);
  });

  it("never answers /graphql paths with index.html and does not escape dist", async () => {
    h = await ApiHarness.start({ webDist: dist });
    const base = `http://127.0.0.1:${h.server.port}`;
    expect(await (await fetch(`${base}/graphql/x`)).text()).not.toContain("<html>Home</html>");
    for (const path of ["/..%2f..%2fpackage.json", "/..%5c..%5cpackage.json", "/%2e%2e/%2e%2e/package.json"]) {
      const body = await (await fetch(`${base}${path}`)).text();
      expect([path, body.includes('"name"')]).toEqual([path, false]);
    }
  });

  it("serves nothing but the API when the web app is not built", async () => {
    h = await ApiHarness.start({ webDist: join(dist, "missing") });
    expect((await fetch(`http://127.0.0.1:${h.server.port}/admin`)).status).toBe(404);
  });
});
