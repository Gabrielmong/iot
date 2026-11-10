import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import type { TvKey } from '../../gql/graphql'
import { RemoteButton } from './RemoteButton'

const AREA = { UP: 'up', LEFT: 'left', OK: 'ok', RIGHT: 'right', DOWN: 'down' } as const

/** Arrows around OK, with Back and Home under it. */
export function DirectionPad({ onKey }: { onKey: (key: TvKey) => void }) {
  return (
    <Stack spacing={2} sx={{ alignItems: 'center' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 64px)',
          gridTemplateRows: 'repeat(3, 64px)',
          gridTemplateAreas: '". up ." "left ok right" ". down ."',
          gap: 1,
        }}
      >
        {(Object.keys(AREA) as (keyof typeof AREA)[]).map((key) => (
          <RemoteButton key={key} tvKey={key} onKey={onKey} sx={{ gridArea: AREA[key], borderRadius: key === 'OK' ? '50%' : '14px' }} />
        ))}
      </Box>
      <Stack direction="row" spacing={2}>
        <RemoteButton tvKey="BACK" onKey={onKey} />
        <RemoteButton tvKey="HOME" onKey={onKey} />
      </Stack>
    </Stack>
  )
}
