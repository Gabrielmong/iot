import type { PrismaClient } from "../../generated/prisma/client.js";
import { kasaCredentialsFrom } from "../kasa-credentials.js";
import { swannSettingsFrom } from "../swann-settings.js";
import type { Driver } from "../types.js";
import { AndroidTvDriver } from "./android-tv.js";
import { GoveeDriver } from "./govee.js";
import { KasaDriver } from "./kasa.js";
import { SamsungDriver } from "./samsung.js";
import { SwannDriver } from "./swann.js";
import { TuyaDriver } from "./tuya.js";
import { WolDriver } from "./wol.js";

/** The production drivers, bound to the LAN interface when `lanAddress` is set. */
export function createDrivers(prisma: PrismaClient, secretKey: Buffer, lanAddress?: string): Driver[] {
  return [
    new TuyaDriver({ bindAddress: lanAddress }),
    new KasaDriver({ credentials: kasaCredentialsFrom(prisma, secretKey), bindAddress: lanAddress }),
    new GoveeDriver({ bindAddress: lanAddress }),
    new SwannDriver({ settings: swannSettingsFrom(prisma, secretKey) }),
    new WolDriver(),
    new AndroidTvDriver({ bindAddress: lanAddress }),
    new SamsungDriver({ bindAddress: lanAddress }),
  ];
}
