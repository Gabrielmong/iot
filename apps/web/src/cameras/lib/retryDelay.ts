const DELAYS_MS = [2_000, 5_000, 10_000]
const STEADY_MS = 30_000

/** How long a camera tile waits before its `failures`-th retry: 2 s, 5 s, 10 s, then every 30 s. */
export const retryDelay = (failures: number): number => DELAYS_MS[failures - 1] ?? STEADY_MS
