/**
 * Devices that can be granted: adopted ones, with a power strip hidden when its outlets are listed
 * individually (the same rule as the dashboard tiles). Grants are therefore made per outlet.
 */
export function grantableDevices<T extends { id: string; adopted: boolean; parentId: string | null }>(
  devices: readonly T[],
): T[] {
  const adopted = devices.filter((d) => d.adopted)
  const parents = new Set(adopted.map((d) => d.parentId).filter((id): id is string => id != null))
  return adopted.filter((d) => !parents.has(d.id))
}
