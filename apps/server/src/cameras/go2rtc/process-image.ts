import { execFile } from "node:child_process";
import { basename } from "node:path";

/** The executable name of a running process ("go2rtc.exe"), or undefined when it is not running. */
export function processImageName(pid: number): Promise<string | undefined> {
  const [cmd, args] =
    process.platform === "win32"
      ? ["tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]]
      : ["ps", ["-p", String(pid), "-o", "comm="]];
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 5_000 }, (err, stdout) => {
      if (err) return resolve(undefined);
      const out = stdout.trim();
      if (process.platform !== "win32") return resolve(out ? basename(out) : undefined);
      // `"go2rtc.exe","1234",...`, or an INFO line when no process matches.
      const match = /^"([^"]+)","(\d+)"/.exec(out);
      resolve(match && Number(match[2]) === pid ? match[1] : undefined);
    });
  });
}
