import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";

const goodKey = randomBytes(32).toString("base64");

describe("loadConfig", () => {
  it("names every missing variable", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({})).toThrow(/SECRET_KEY/);
  });

  it("rejects a SECRET_KEY that is not 32 bytes without echoing it", () => {
    const bad = randomBytes(16).toString("base64");
    const env = { DATABASE_URL: "postgresql://u:pw@h/db", SECRET_KEY: bad };
    expect(() => loadConfig(env)).toThrow(/SECRET_KEY/);
    try {
      loadConfig(env);
    } catch (e) {
      expect(String(e)).not.toContain(bad);
      expect(String(e)).not.toContain("pw");
    }
  });

  it("reads TUYA_SYNC_HOURS (default 6, 0 turns it off) and rejects nonsense", () => {
    expect(loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey }).tuyaSyncHours).toBe(6);
    expect(loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, TUYA_SYNC_HOURS: "0" }).tuyaSyncHours).toBe(0);
    expect(loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, TUYA_SYNC_HOURS: "1.5" }).tuyaSyncHours).toBe(1.5);
    expect(() => loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, TUYA_SYNC_HOURS: "-1" })).toThrow(/TUYA_SYNC_HOURS/);
    expect(() => loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, TUYA_SYNC_HOURS: "often" })).toThrow(/TUYA_SYNC_HOURS/);
  });

  it("rejects an invalid PORT", () => {
    expect(() => loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, PORT: "abc" })).toThrow(/PORT/);
  });

  it("accepts an optional 4-8 digit BOOTSTRAP_ADMIN_PIN without echoing a bad one", () => {
    expect(loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey }).bootstrapAdminPin).toBeUndefined();
    expect(loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, BOOTSTRAP_ADMIN_PIN: "2468" }).bootstrapAdminPin).toBe("2468");
    expect(() => loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, BOOTSTRAP_ADMIN_PIN: "12ab" })).toThrow(/BOOTSTRAP_ADMIN_PIN/);
    expect(() => loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, BOOTSTRAP_ADMIN_PIN: "12ab" })).not.toThrow(/12ab/);
  });

  it("returns typed config with defaults", () => {
    const c = loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, LAN_ADDRESS: "192.168.1.5" });
    expect(c).toMatchObject({ databaseUrl: "x", port: 4000, lanAddress: "192.168.1.5" });
    expect(c.secretKey).toHaveLength(32);
  });

  it("defaults GO2RTC_PATH and FFMPEG_PATH to the repo tools folder, and accepts overrides", () => {
    const c = loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey });
    const repo = fileURLToPath(new URL("../../../", import.meta.url));
    expect(c.go2rtcPath).toBe(join(repo, "tools", "go2rtc", "go2rtc.exe"));
    expect(c.ffmpegPath).toBe(join(repo, "tools", "ffmpeg", "ffmpeg.exe"));
    const o = loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, GO2RTC_PATH: "D:/tools/g.exe", FFMPEG_PATH: "D:/tools/f.exe" });
    expect(o).toMatchObject({ go2rtcPath: "D:/tools/g.exe", ffmpegPath: "D:/tools/f.exe" });
  });

  it("defaults GO2RTC_PID_FILE to the repo logs folder, and accepts an override", () => {
    const repo = fileURLToPath(new URL("../../../", import.meta.url));
    expect(loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey }).go2rtcPidFile).toBe(join(repo, "logs", "run", "go2rtc.pid"));
    const o = loadConfig({ DATABASE_URL: "x", SECRET_KEY: goodKey, GO2RTC_PID_FILE: "C:/HomeControl/shared/logs/run/go2rtc.pid" });
    expect(o.go2rtcPidFile).toBe("C:/HomeControl/shared/logs/run/go2rtc.pid");
  });
});

describe("loadConfig android", () => {
  const base = { DATABASE_URL: "x", SECRET_KEY: goodKey };
  it("leaves the APK folder unset, and reads ANDROID_APK_DIR", () => {
    expect(loadConfig(base).androidApkDir).toBeUndefined();
    expect(loadConfig({ ...base, ANDROID_APK_DIR: "D:/x/shared/android" }).androidApkDir).toBe("D:/x/shared/android");
  });
  it("leaves the agent folder unset, and reads AGENT_DIR", () => {
    expect(loadConfig(base).agentDir).toBeUndefined();
    expect(loadConfig({ ...base, AGENT_DIR: "D:/x/shared/agent" }).agentDir).toBe("D:/x/shared/agent");
  });
});

describe("loadConfig deployer", () => {
  const base = { DATABASE_URL: "x", SECRET_KEY: goodKey };
  it("defaults the URL and leaves the token file unset", () => {
    const c = loadConfig(base);
    expect(c.deployerUrl).toBe("http://127.0.0.1:4100");
    expect(c.deployerTokenFile).toBeUndefined();
  });
  it("reads DEPLOYER_URL and DEPLOYER_TOKEN_FILE", () => {
    expect(loadConfig({ ...base, DEPLOYER_URL: "http://127.0.0.1:5000", DEPLOYER_TOKEN_FILE: "D:/x/api-token" })).toMatchObject({ deployerUrl: "http://127.0.0.1:5000", deployerTokenFile: "D:/x/api-token" });
  });
});
