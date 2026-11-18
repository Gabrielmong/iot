import { colorName, whiteTempName } from '../../dashboard/lib/colorName'
import type { PcPowerAction } from '../../gql/graphql'
import type { DraftAction } from './draft'

const PC_POWER: Record<PcPowerAction, string> = { SLEEP: 'Sleep', SHUTDOWN: 'Shut down', RESTART: 'Restart' }

type Described = Pick<DraftAction, 'on' | 'brightness' | 'color' | 'colorTempK'> & { pcPower?: PcPowerAction | null }

/** One line for what a step does to a device: "On · 20% · warm white", "Off", "Sleep", "No change". */
export function describeAction(a: Described): string {
  if (a.pcPower) return PC_POWER[a.pcPower]
  if (a.on === false) return 'Off'
  const parts: string[] = []
  if (a.on === true) parts.push('On')
  if (a.brightness !== null) parts.push(`${a.brightness}%`)
  if (a.color) parts.push(colorName(a.color))
  if (a.colorTempK !== null) parts.push(`${whiteTempName(a.colorTempK).toLowerCase()} white`)
  return parts.length > 0 ? parts.join(' · ') : 'No change'
}
