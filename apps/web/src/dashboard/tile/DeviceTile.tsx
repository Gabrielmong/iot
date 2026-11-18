import ButtonBase from '@mui/material/ButtonBase'
import Paper from '@mui/material/Paper'
import { canToggle, isComputer, needsSetup, opensDetailsOnTap } from '../lib/capabilities'
import { isDeviceOn } from '../lib/isDeviceOn'
import { tileGlow } from '../lib/tileGlow'
import { tileOnStyle } from '../lib/tileOnStyle'
import type { Device } from '../types'
import { ComputerTileAction } from './ComputerTileAction'
import { NeedsSetupLink } from './NeedsSetupLink'
import { PowerIndicator } from './PowerIndicator'
import { TileBody } from './TileBody'
import { TileGlow } from './TileGlow'
import { TileMenuButton } from './TileMenuButton'
import { TileToggle } from './TileToggle'
import { useLongPress } from './useLongPress'

type Props = {
  device: Device
  isAdmin: boolean
  onToggle: (device: Device) => void
  onOpenDetails: (device: Device) => void
}

const noop = () => {}

/** Right padding that keeps text clear of the overlaid power badge and ⋯ button. */
function rightPadding(hasPowerLook: boolean, hasMenu: boolean) {
  if (hasPowerLook) return 12
  return hasMenu ? 7 : 2
}

/**
 * One device: tap toggles, long-press or ⋯ opens its details page. A camera opens its details page
 * on tap; a computer wakes on tap. It can't be switched off from here, so it shows its on state (border,
 * glow) but no power badge or switch. Offline / not-ready tiles and unknown kinds are inert.
 */
export function DeviceTile({ device, isAdmin, onToggle, onOpenDetails }: Props) {
  const toggleable = canToggle(device)
  const opensOnTap = opensDetailsOnTap(device)
  const onStyle = tileOnStyle(device)
  const enabled = toggleable || opensOnTap
  const computer = isComputer(device)
  const powerControls = onStyle !== null && !computer
  const waking = device.computer?.wake?.status === 'WAKING'
  const open = () => onOpenDetails(device)
  const tap = () => onToggle(device)
  const press = useLongPress({
    onLongPress: enabled ? open : noop,
    onClick: toggleable ? tap : opensOnTap ? open : noop,
  })

  return (
    <Paper
      variant="outlined"
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRadius: '10px',
        overflow: 'hidden',
        opacity: enabled ? 1 : 0.5,
        transition: 'border-color 300ms, background-color 200ms',
        '&:hover': enabled && onStyle !== 'on' ? { borderColor: 'rgba(159, 176, 221, 0.32)' } : undefined,
        ...(onStyle === 'on' && { borderColor: 'success.main' }),
      }}
    >
      <TileGlow glow={tileGlow(device)} />
      <ButtonBase
        {...press}
        aria-label={device.name}
        aria-disabled={!enabled}
        aria-pressed={toggleable && !computer ? isDeviceOn(device.state) : undefined}
        sx={{
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          textAlign: 'left',
          p: 2,
          pr: rightPadding(powerControls, toggleable),
          flexGrow: 1,
          minHeight: 0,
          borderRadius: 'inherit',
          '&.Mui-focusVisible': { outline: '2px solid var(--mui-palette-primary-main)', outlineOffset: -2 },
        }}
      >
        <TileBody device={device} />
        {computer && toggleable && onStyle !== 'on' && <ComputerTileAction waking={waking} />}
      </ButtonBase>
      {powerControls && <PowerIndicator state={onStyle} />}
      {powerControls && <TileToggle state={onStyle} />}
      {toggleable && <TileMenuButton deviceName={device.name} onClick={open} />}
      {isAdmin && needsSetup(device) && <NeedsSetupLink />}
    </Paper>
  )
}
