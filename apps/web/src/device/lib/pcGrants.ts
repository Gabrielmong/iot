/** One user's PC permissions. */
export type PcFlags = { stats: boolean; power: boolean }

export const NO_PC_FLAGS: PcFlags = { stats: false, power: false }

/** The flags keyed by user id, from the server's list. */
export function pcFlagsById(grants: readonly ({ userId: string } & PcFlags)[]): ReadonlyMap<string, PcFlags> {
  return new Map(grants.map((g) => [g.userId, { stats: g.stats, power: g.power }]))
}

/** What to save for exactly the granted users (anyone else's flags are dropped with their access). */
export function pcGrantsFor(userIds: readonly string[], flags: ReadonlyMap<string, PcFlags>) {
  return userIds.map((userId) => ({ userId, ...(flags.get(userId) ?? NO_PC_FLAGS) }))
}
