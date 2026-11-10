/** A held arrow repeats its move this often (matches REPEAT_MS in @home/protocols camera-codes; the server stops after 4 s without one). */
export const REPEAT_MS = 1500

/** A quick tap still moves the camera for this long. */
export const NUDGE_MS = 400

/** The on-video controls fade after this long without a touch or mouse move. */
export const IDLE_MS = 3000

/** Holding a saved position this long saves the current view over it. */
export const LONG_PRESS_MS = 600
