/** The Remote Desktop port: a PC that answered on it can be opened with an rdp:// link. */
export const RDP_PORT = 3389;

const flag = (d: { config: unknown }, key: string): boolean => (d.config as Record<string, unknown> | null)?.[key] === true;

/** Some probe port answered at least once, so a failing probe means the PC is off (not firewalled). */
export const probeSeen = (d: { config: unknown }): boolean => flag(d, "probeSeen");

/** Remote Desktop answered at least once. */
export const rdpSeen = (d: { config: unknown }): boolean => flag(d, "rdpSeen");
