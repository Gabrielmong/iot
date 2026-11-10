import type { Go2rtcApi } from "./api.js";
import type { Go2rtcSupervisor } from "./supervisor.js";

export interface Go2rtcStream {
  name: string;
  /** Source URL; contains credentials, so it is never logged. */
  src: string;
}

/** Whatever knows the current streams (the StreamRegistry). */
export interface StreamSource {
  streams(): Iterable<Go2rtcStream>;
}

/**
 * go2rtc keeps streams in memory only, so after every `ready` (first start and each restart) every
 * known stream is registered again. Failures are logged without the stream (its name is a secret too).
 */
export function reregisterOnReady(
  supervisor: Pick<Go2rtcSupervisor, "on">,
  api: Pick<Go2rtcApi, "putStream">,
  source: StreamSource,
  log: Pick<Console, "warn">,
): void {
  supervisor.on("ready", () => {
    for (const { name, src } of source.streams()) {
      api.putStream(name, src).catch(() => log.warn("go2rtc: could not register a camera stream"));
    }
  });
}
