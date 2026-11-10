/** The granted ids that appear in `groups`; anything else (hidden strip parents, removed devices) is dropped. */
export function initialSelection(grantedIds: readonly string[], groups: readonly { devices: readonly { id: string }[] }[]): Set<string> {
  const visible = new Set(groups.flatMap((g) => g.devices.map((d) => d.id)))
  return new Set(grantedIds.filter((id) => visible.has(id)))
}

export type CheckState = 'all' | 'some' | 'none'

/** Returns a copy of `selected` with `id` flipped. */
export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected)
  if (!next.delete(id)) next.add(id)
  return next
}

/** Returns a copy of `selected` with every one of `ids` checked or unchecked. */
export function setIds(selected: ReadonlySet<string>, ids: readonly string[], checked: boolean): Set<string> {
  const next = new Set(selected)
  for (const id of ids) {
    if (checked) next.add(id)
    else next.delete(id)
  }
  return next
}

/** Whether all, some or none of `ids` are selected (drives an "all in room" checkbox). */
export function checkState(selected: ReadonlySet<string>, ids: readonly string[]): CheckState {
  const count = ids.filter((id) => selected.has(id)).length
  if (count === 0) return 'none'
  return count === ids.length ? 'all' : 'some'
}
