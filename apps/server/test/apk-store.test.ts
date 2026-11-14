import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readApkInfo } from "../src/android/apk-store.js";

const root = mkdtempSync(join(tmpdir(), "home-apk-"));
let dir: string;
let n = 0;
beforeEach(() => {
  dir = join(root, `d${n++}`);
  mkdirSync(dir);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const apk = () => writeFileSync(join(dir, "home.apk"), "apk");
const json = (text: string) => writeFileSync(join(dir, "home.json"), text);

describe("readApkInfo", () => {
  it("is null without a folder", () => {
    expect(readApkInfo(undefined)).toBeNull();
    expect(readApkInfo(join(root, "missing"))).toBeNull();
  });
  it("is null unless both files exist", () => {
    json('{"versionCode":7}');
    expect(readApkInfo(dir)).toBeNull();
    rmSync(join(dir, "home.json"));
    apk();
    expect(readApkInfo(dir)).toBeNull();
  });
  it.each(['{"versionCode":0}', '{"versionCode":"3"}', '{"versionCode":1.5}', "{}", "not json"])("is null for %s", (text) => {
    apk();
    json(text);
    expect(readApkInfo(dir)).toBeNull();
  });
  it("returns the version and the apk path when both are valid", () => {
    apk();
    json('{"versionCode":7}');
    expect(readApkInfo(dir)).toEqual({ versionCode: 7, apkPath: join(dir, "home.apk") });
  });
});
