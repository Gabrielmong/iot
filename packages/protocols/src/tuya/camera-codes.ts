/**
 * Tuya camera command values, sent as thing-shadow properties. Verified by hand on "cámara cocina"
 * (product exogrzcrb71xpdzx) on 2026-11-09 unless marked otherwise.
 */

export type PanDirection = 'UP' | 'RIGHT' | 'DOWN' | 'LEFT';

/** `ptz_control` values. The diagonals (odd values) moved inconsistently on the real camera, so they are not offered. */
export const PTZ_VALUES: Record<PanDirection, string> = { UP: '0', RIGHT: '2', DOWN: '4', LEFT: '6' };

/** The camera keeps moving until `ptz_stop`; repeating the same `ptz_control` while moving stays smooth. */
export const MOVE_MODE = 'continuous' as const;

/** How often a held arrow repeats its move (the server's safety stop fires after a gap longer than this). */
export const REPEAT_MS = 1500;

/** `basic_nightvision` values. AUTO is "0" (verified); OFF "1" / ON "2" follow Tuya's standard mapping. */
export const NIGHT_VISION_VALUES = { AUTO: '0', OFF: '1', ON: '2' } as const;
export type NightVisionMode = keyof typeof NIGHT_VISION_VALUES;

/** Saving stores the current view in a slot; going returns to it. Slots 1-4. */
export const PRESET_COMMANDS = {
  save: (slot: number): Record<string, unknown> => ({ ipc_preset_set: String(slot) }),
  goto: (slot: number): Record<string, unknown> => ({ ipc_preset_action: String(slot) }),
};
export const PRESET_SLOTS = [1, 2, 3, 4] as const;
