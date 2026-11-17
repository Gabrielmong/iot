import type { DeviceRecord } from "../types.js";

/** The Wake-on-LAN MAC a TV's discovery stored in its config, if any. */
export const macOf = (d: DeviceRecord): string | undefined => {
  const mac = (d.config as { mac?: unknown } | null)?.mac;
  return typeof mac === "string" ? mac : undefined;
};
