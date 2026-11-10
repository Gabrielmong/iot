import { colorName, whiteTempName } from '../../dashboard/lib/colorName'
import type { DraftAction } from './draft'

/** One line for what a step does to a device: "On · 20% · warm white", "Off", "No change". */
export function describeAction(a: Pick<DraftAction, 'on' | 'brightness' | 'color' | 'colorTempK'>): string {
  if (a.on === false) return 'Off'
  const parts: string[] = []
  if (a.on === true) parts.push('On')
  if (a.brightness !== null) parts.push(`${a.brightness}%`)
  if (a.color) parts.push(colorName(a.color))
  if (a.colorTempK !== null) parts.push(`${whiteTempName(a.colorTempK).toLowerCase()} white`)
  return parts.length > 0 ? parts.join(' · ') : 'No change'
}
