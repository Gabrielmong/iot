import Button from '@mui/material/Button'
import type { SxProps, Theme } from '@mui/material/styles'
import type { TvKey } from '../../gql/graphql'
import { REPEATING_KEYS, TV_KEYS } from './tvLabels'
import { useHoldRepeat } from './useHoldRepeat'

type Props = { tvKey: TvKey; onKey: (key: TvKey) => void; sx?: SxProps<Theme> }

/** One remote key, at least 56 px; volume and arrows repeat while held. */
export function RemoteButton({ tvKey, onKey, sx }: Props) {
  const { label, Icon } = TV_KEYS[tvKey]
  const hold = useHoldRepeat(() => onKey(tvKey), REPEATING_KEYS.has(tvKey))
  return (
    <Button
      variant="outlined"
      color="inherit"
      aria-label={label}
      {...hold}
      sx={{ minWidth: 56, minHeight: 56, borderRadius: '14px', touchAction: 'none', userSelect: 'none', ...sx }}
    >
      {Icon ? <Icon /> : label}
    </Button>
  )
}
