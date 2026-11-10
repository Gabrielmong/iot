import { KasaClient, KlapSession } from "@home/protocols";
import { sysInfoToDiscovered } from "../devices/drivers/kasa-mapping.js";
import type { KasaProbe } from "./deps.js";

const PROBE_TIMEOUT_MS = 3000;

/** Production KasaProbe: one KLAP login and sysinfo query. */
export const probeKasa: KasaProbe = async (ip, creds) => {
  const info = await new KasaClient(new KlapSession({ ip, ...creds, timeoutMs: PROBE_TIMEOUT_MS })).getSysInfo();
  return sysInfoToDiscovered(info, ip);
};
