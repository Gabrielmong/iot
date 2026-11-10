/**
 * Moves a room one step up or down and returns the `sortOrder` updates needed: after the move
 * every room's order equals its position, so ties and gaps are normalized too.
 */
export function reorderRooms(
  rooms: readonly { id: string; sortOrder: number }[],
  id: string,
  direction: 'up' | 'down',
): { id: string; sortOrder: number }[] {
  const sorted = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder)
  const from = sorted.findIndex((r) => r.id === id)
  const to = direction === 'up' ? from - 1 : from + 1
  if (from === -1 || to < 0 || to >= sorted.length) return []
  const [moved] = sorted.splice(from, 1)
  sorted.splice(to, 0, moved)
  return sorted.flatMap((r, index) => (r.sortOrder === index ? [] : [{ id: r.id, sortOrder: index }]))
}
