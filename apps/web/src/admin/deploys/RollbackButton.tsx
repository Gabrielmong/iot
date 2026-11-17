import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { SxProps, Theme } from '@mui/material/styles'
import Tooltip from '@mui/material/Tooltip'
import type { DeployEvent } from '../data/useDeployStatus'

type Props = { event: DeployEvent; disabled: boolean; onClick: () => void; sx?: SxProps<Theme> }

/** "Roll back to this", with the reason in a tooltip when it's blocked. */
export function RollbackButton({ event, disabled, onClick, sx }: Props) {
  const blocked = event.rollbackBlockedReason
  return (
    <Tooltip title={blocked ?? ''}>
      <Box component="span" sx={sx}>
        <Button size="small" disabled={disabled || Boolean(blocked)} onClick={onClick}>Roll back to this</Button>
      </Box>
    </Tooltip>
  )
}
