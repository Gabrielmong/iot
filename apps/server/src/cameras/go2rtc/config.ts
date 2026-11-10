import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateCredentials, type Go2rtcCredentials } from "./credentials.js";

export const GO2RTC_CONFIG_FILE = "go2rtc.yaml";

/** JSON strings are valid YAML double-quoted scalars, so Windows backslashes survive. */
const q = (s: string) => JSON.stringify(s);

/**
 * Writes go2rtc's config into `dir` (a per-run temp dir) and returns its path.
 * - API on localhost only, Basic auth required even from localhost (`local_auth`, go2rtc >= 1.9.12;
 *   by default go2rtc skips auth for loopback), and no CORS (`origin` other than "*" sends no CORS headers).
 * - RTSP server on loopback only (127.0.0.1:8554). It must run: go2rtc's `ffmpeg:` sources (cloud
 *   cameras' audio transcode, H265 transcodes) have ffmpeg publish back to
 *   `rtsp://127.0.0.1:<port>/<md5>`, and with the server off every such source fails ("exec: rtsp
 *   module disabled"). go2rtc 1.9.15 adds no login to that publish URL, and skips RTSP auth for
 *   loopback clients (internal/rtsp: `Username != "" && !IP.IsLoopback()`; there is no local_auth for
 *   RTSP). So the per-run random login (`rtspCredentials`) only guards non-loopback clients, should
 *   the bind ever widen; the boundary is the loopback bind. A process on the server PC (any OS user)
 *   could connect, but reading a stream needs its name, and names are unguessable per-run values
 *   (StreamNames, 128 random bits, memory only, never logged). The API still needs the per-run
 *   credentials. Nothing on the LAN can reach it, and the firewall opens only 8555.
 * - SRTP server disabled (it listens by default); RTMP is off by default. Only WebRTC :8555 listens on
 *   the LAN.
 * - Deliberately no `streams:` — streams (with their credentials) are registered at runtime through the
 *   API and live only in go2rtc's memory.
 */
export function writeGo2rtcConfig(
  dir: string,
  ffmpegPath: string,
  credentials: Go2rtcCredentials,
  rtspCredentials: Go2rtcCredentials = generateCredentials(),
): string {
  const yaml = [
    "api:",
    `  listen: ${q("127.0.0.1:1984")}`,
    `  username: ${q(credentials.username)}`,
    `  password: ${q(credentials.password)}`,
    "  local_auth: true",
    `  origin: ${q("")}`,
    "rtsp:",
    `  listen: ${q("127.0.0.1:8554")}`,
    `  username: ${q(rtspCredentials.username)}`,
    `  password: ${q(rtspCredentials.password)}`,
    "srtp:",
    `  listen: ${q("")}`,
    "webrtc:",
    `  listen: ${q(":8555")}`,
    "ffmpeg:",
    `  bin: ${q(ffmpegPath)}`,
    "",
  ].join("\n");
  const path = join(dir, GO2RTC_CONFIG_FILE);
  writeFileSync(path, yaml, { encoding: "utf8", mode: 0o600 });
  return path;
}
