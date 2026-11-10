import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import ListSubheader from '@mui/material/ListSubheader'
import type { Device } from '../../dashboard/types'

type Props = { cameras: readonly Device[]; checked: readonly string[]; onToggle: (id: string) => void }

/** Every camera the viewer can see, ticked when it's in the grid. */
export function CameraChecklist({ cameras, checked, onToggle }: Props) {
  return (
    <>
      <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px' }}>
        Cameras
      </ListSubheader>
      <FormGroup sx={{ px: 1 }}>
        {cameras.map((c) => (
          <FormControlLabel key={c.id} label={c.name} control={<Checkbox size="small" checked={checked.includes(c.id)} onChange={() => onToggle(c.id)} />} />
        ))}
      </FormGroup>
    </>
  )
}
