import type { DeviceRow } from "../services/device-rows.js";
import type { ApiContext } from "./context.js";
import { toApiAdminDevice } from "./mappers.js";

/** Maps device rows to the admin view, adding live connection state and Test availability. */
export const adminDeviceView = (ctx: ApiContext) => (row: DeviceRow) =>
  toApiAdminDevice(row, { online: ctx.manager.getState(row.id).online, now: ctx.deps.now() });
