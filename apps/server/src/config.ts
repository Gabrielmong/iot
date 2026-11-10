import { isValidPin } from "./auth/pin.js";
import { DEFAULT_FFMPEG_PATH, DEFAULT_GO2RTC_PATH } from "./cameras/go2rtc/binary.js";
import { DEFAULT_PID_FILE } from "./cameras/go2rtc/pid-file.js";

export interface Config {
  databaseUrl: string;
  port: number;
  secretKey: Buffer;
  lanAddress?: string;
  /** PIN for the `Admin` user created when the database has no users (required only then). */
  bootstrapAdminPin?: string;
  /** go2rtc helper binary; cameras are disabled when it is missing. */
  go2rtcPath: string;
  /** ffmpeg binary go2rtc uses for transcoding. */
  ffmpegPath: string;
  /** Where go2rtc's pid is kept across runs; deployed installs point it at shared\logs (a release is read-only). */
  go2rtcPidFile: string;
  /** Hours between background Tuya key syncs; 0 turns them off. */
  tuyaSyncHours: number;
  /** The deploy helper API. */
  deployerUrl: string;
  /** Its bearer-token file; no default (the service sets it). Unset: the helper counts as unavailable. */
  deployerTokenFile?: string;
}

const KEY_BYTES = 32;

/** Validates env. Errors name variables only, never their values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) problems.push("DATABASE_URL is missing");

  let port = 4000;
  if (env.PORT !== undefined && env.PORT !== "") {
    port = Number(env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      problems.push("PORT is invalid (expected an integer 1-65535)");
    }
  }

  let secretKey = Buffer.alloc(0);
  if (!env.SECRET_KEY) {
    problems.push("SECRET_KEY is missing");
  } else {
    secretKey = Buffer.from(env.SECRET_KEY, "base64");
    if (secretKey.length !== KEY_BYTES) {
      problems.push(`SECRET_KEY is invalid (expected base64 of ${KEY_BYTES} bytes)`);
    }
  }

  const bootstrapAdminPin = env.BOOTSTRAP_ADMIN_PIN || undefined;
  if (bootstrapAdminPin !== undefined && !isValidPin(bootstrapAdminPin)) {
    problems.push("BOOTSTRAP_ADMIN_PIN is invalid (expected 4-8 digits)");
  }

  let tuyaSyncHours = 6;
  if (env.TUYA_SYNC_HOURS !== undefined && env.TUYA_SYNC_HOURS !== "") {
    tuyaSyncHours = Number(env.TUYA_SYNC_HOURS);
    if (!Number.isFinite(tuyaSyncHours) || tuyaSyncHours < 0) problems.push("TUYA_SYNC_HOURS is invalid (expected hours, 0 or more)");
  }

  if (problems.length > 0) throw new Error(`Invalid configuration: ${problems.join("; ")}`);

  return {
    databaseUrl: databaseUrl!,
    port,
    secretKey,
    lanAddress: env.LAN_ADDRESS || undefined,
    bootstrapAdminPin,
    go2rtcPath: env.GO2RTC_PATH || DEFAULT_GO2RTC_PATH,
    ffmpegPath: env.FFMPEG_PATH || DEFAULT_FFMPEG_PATH,
    go2rtcPidFile: env.GO2RTC_PID_FILE || DEFAULT_PID_FILE,
    tuyaSyncHours,
    deployerUrl: env.DEPLOYER_URL || "http://127.0.0.1:4100",
    deployerTokenFile: env.DEPLOYER_TOKEN_FILE || undefined,
  };
}
