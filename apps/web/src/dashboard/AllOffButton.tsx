import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import Button from '@mui/material/Button'

type Props = { disabled: boolean; onClick: () => void }

/** One tap switches off everything on in the current tab. */
export function AllOffButton({ disabled, onClick }: Props) {
  return (
    <Button variant="outlined" startIcon={<PowerSettingsNewIcon />} disabled={disabled} onClick={onClick}>
      All off
    </Button>
  )
}
