import Stack from '@mui/material/Stack'
import type { TvKey } from '../../gql/graphql'
import { RemoteButton } from './RemoteButton'

/** Volume down, mute, volume up. */
export function VolumeButtons({ onKey }: { onKey: (key: TvKey) => void }) {
  return (
    <Stack direction="row" spacing={1} role="group" aria-label="Volume">
      <RemoteButton tvKey="VOLUME_DOWN" onKey={onKey} />
      <RemoteButton tvKey="MUTE" onKey={onKey} />
      <RemoteButton tvKey="VOLUME_UP" onKey={onKey} />
    </Stack>
  )
}
