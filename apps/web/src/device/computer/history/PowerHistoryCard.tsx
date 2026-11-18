import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { SectionCard } from '../../common/SectionCard'
import type { DeviceDetail } from '../../types'
import { powerSegments } from './powerSegments'
import { powerSummary } from './powerSummary'
import { PowerTimeline } from './PowerTimeline'
import { usePowerHistory, type PowerRange } from './usePowerHistory'

const HINT = 'History needs the server to reach this PC: allow it through the firewall, or adopt the PC with the agent.'
const START_LABEL: Record<PowerRange, string> = { '24h': '24 h ago', '7d': '7 days ago' }

/** When the PC was on: "On since 18:42" and a 24 h / 7 day timeline. Only for PCs the server can see. */
export function PowerHistoryCard({ device }: { device: DeviceDetail }) {
  const [range, setRange] = useState<PowerRange>('24h')
  const confirmable = device.computer?.confirmable === true
  const stateOn = device.state.on ?? null
  const { events, from, to } = usePowerHistory(device.id, range, stateOn, !confirmable)
  if (!confirmable) {
    return (
      <SectionCard title="History">
        <Typography variant="body2" color="text.secondary">
          {HINT}
        </Typography>
      </SectionCard>
    )
  }
  const summary = powerSummary(events, { on: stateOn }, to)
  return (
    <SectionCard title="History">
      <Stack spacing={1.5}>
        {summary && <Typography color="text.secondary">{summary}</Typography>}
        <ToggleButtonGroup exclusive size="small" aria-label="Range" value={range} onChange={(_, r: PowerRange | null) => r && setRange(r)}>
          <ToggleButton value="24h">24 h</ToggleButton>
          <ToggleButton value="7d">7 days</ToggleButton>
        </ToggleButtonGroup>
        <PowerTimeline segments={powerSegments(events, from, to)} startLabel={START_LABEL[range]} />
      </Stack>
    </SectionCard>
  )
}
