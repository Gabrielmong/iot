import type { Brand } from "../../devices/types.js";
import { CameraUnavailableError } from "./errors.js";
import type { StreamResolver } from "./types.js";

/** Picks a LOCAL camera's resolver by brand (Swann recorder, Tuya over ONVIF); other brands have no local streams. */
export function resolveByBrand(resolvers: Partial<Record<Brand, StreamResolver>>): StreamResolver {
  return (device) => {
    const resolve = resolvers[device.brand];
    if (!resolve) return Promise.reject(new CameraUnavailableError(`no local streams for ${device.brand} devices`));
    return resolve(device);
  };
}
