import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { setHomeName } from "../src/services/home-name.js";
import { ApiHarness } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
const root = mkdtempSync(join(tmpdir(), "home-android-"));
const dist = join(root, "web");
const apkDir = join(root, "android");
const BYTES = Buffer.from([0x50, 0x4b, 3, 4, 9, 9]);
for (const d of [dist, apkDir]) mkdirSync(d);
writeFileSync(join(dist, "index.html"), "<html>Home</html>");
writeFileSync(join(apkDir, "home.apk"), BYTES);
writeFileSync(join(apkDir, "home.json"), '{"versionCode":7}');

afterEach(() => h?.stop());
afterAll(async () => {
  rmSync(root, { recursive: true, force: true });
  await closeDb();
});

const base = () => `http://127.0.0.1:${h.server.port}`;

describe("without an APK", () => {
  it("identifies the server with no app, and /app/home.apk is a 404 rather than the web app", async () => {
    h = await ApiHarness.start({ webDist: dist });
    expect(await (await fetch(`${base()}/api/identity`)).json()).toEqual({ app: "home-control", name: "Home", androidApp: null });
    const res = await fetch(`${base()}/app/home.apk`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("<html>Home</html>");
  });
});

describe("with an APK", () => {
  it("reports the version and serves the bytes, without auth", async () => {
    h = await ApiHarness.start({ webDist: dist, androidApkDir: apkDir });
    expect((await (await fetch(`${base()}/api/identity`)).json()).androidApp).toEqual({ versionCode: 7 });
    const res = await fetch(`${base()}/app/home.apk`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.android.package-archive");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(BYTES);
  });

  it("follows the home name", async () => {
    h = await ApiHarness.start({ androidApkDir: apkDir });
    await setHomeName(h.db, "Casa");
    expect((await (await fetch(`${base()}/api/identity`)).json()).name).toBe("Casa");
  });
});
