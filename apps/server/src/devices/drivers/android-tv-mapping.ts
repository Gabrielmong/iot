import { ANDROID_APP_LINKS, ANDROID_KEYCODES, type PairedTv, type SsdpReply } from "@home/protocols";
import type { Discovered, TvApp, TvKey } from "../types.js";

export const ANDROID_TV_APPS: TvApp[] = ["YOUTUBE", "NETFLIX", "PRIME_VIDEO", "DISNEY_PLUS", "SPOTIFY"];

export const androidKeyCode = (key: TvKey): number => ANDROID_KEYCODES[key];
export const androidAppLink = (app: TvApp): string => ANDROID_APP_LINKS[app];

/** The stored pairing (Device.secret, decrypted), or undefined when missing or unreadable. */
export function parsePairedTv(secretPlain: string | undefined): PairedTv | undefined {
  if (!secretPlain) return undefined;
  try {
    const p = JSON.parse(secretPlain) as Partial<PairedTv>;
    if (typeof p.certPem === "string" && typeof p.keyPem === "string" && typeof p.tvCertSha256 === "string") {
      return { certPem: p.certPem, keyPem: p.keyPem, tvCertSha256: p.tvCertSha256 };
    }
  } catch {
    // fall through: an unreadable secret means the TV must be paired again
  }
  return undefined;
}

/** `uuid:<id>::urn:…` → `<id>`. */
export const uuidFromUsn = (usn: string): string => usn.replace(/^uuid:/i, "").split("::")[0];

const tag = (xml: string, name: string): string | undefined => {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`, "i").exec(xml);
  return m?.[1].trim() || undefined;
};

/** A TV from its DIAL device description (friendlyName, modelName, UDN). */
export function describeAndroidTv(ip: string, xml: string, uuid?: string): Discovered | undefined {
  const externalId = uuid ?? (tag(xml, "UDN") && uuidFromUsn(tag(xml, "UDN")!));
  if (!externalId) return undefined;
  return { brand: "ANDROID_TV", kind: "TV", externalId, ip, name: tag(xml, "friendlyName") ?? "Android TV", model: tag(xml, "modelName") };
}

export const isChromecast = (r: SsdpReply): boolean => r.server.includes("Chromecast/");
