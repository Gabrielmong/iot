import { existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./repo-root.js";

export const DEFAULT_GO2RTC_PATH = join(REPO_ROOT, "tools", "go2rtc", "go2rtc.exe");
export const DEFAULT_FFMPEG_PATH = join(REPO_ROOT, "tools", "ffmpeg", "ffmpeg.exe");

/** Whether the helper binary is installed at `path`. */
export function binaryExists(path: string): boolean {
  return existsSync(path);
}
