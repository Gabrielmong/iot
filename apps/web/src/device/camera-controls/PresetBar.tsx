import Box from '@mui/material/Box'
import { PresetButton } from './PresetButton'

type Props = { presets: { slot: number; saved: boolean }[]; onGo: (slot: number) => void; onSave: (slot: number) => void }

/** The saved camera positions, in a row. */
export function PresetBar({ presets, onGo, onSave }: Props) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      {presets.map((p) => (
        <PresetButton key={p.slot} slot={p.slot} saved={p.saved} onGo={onGo} onSave={onSave} />
      ))}
    </Box>
  )
}
