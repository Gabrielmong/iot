const ORDER = ["3.1", "3.3", "3.4", "3.5"];

/**
 * The higher of the stored and the observed Tuya protocol version. Broadcasts are unauthenticated,
 * so an observed version may only raise the stored one (a firmware upgrade), never lower it.
 */
export function raisedTuyaVersion(stored: unknown, observed: unknown): string | undefined {
  const rank = (v: unknown) => (typeof v === "string" ? ORDER.indexOf(v) : -1);
  const best = Math.max(rank(stored), rank(observed));
  return best < 0 ? undefined : ORDER[best];
}
