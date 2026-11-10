type UserLike = { id: string; role: string }

/** Users who can be granted (everyone but admins, who always have access). */
export const grantableUsers = <T extends UserLike>(users: readonly T[]): T[] => users.filter((u) => u.role !== 'ADMIN')

/** The granted ids that belong to a listed non-admin user; stale or admin ids are dropped. */
export function initialUserSelection(grantedIds: readonly string[], users: readonly UserLike[]): Set<string> {
  const listed = new Set(grantableUsers(users).map((u) => u.id))
  return new Set(grantedIds.filter((id) => listed.has(id)))
}
