import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import { WIDGET_LABEL, type WidgetKind } from './widgetKinds'

type Props = { kinds: readonly WidgetKind[]; onAdd: (kind: WidgetKind) => void }

/** "Add widget" in arrange mode: a menu of the widgets the tab doesn't have yet. Hidden when it has them all. */
export function AddWidgetButton({ kinds, onAdd }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (kinds.length === 0) return null
  return (
    <>
      <Button variant="outlined" startIcon={<AddIcon />} onClick={(e) => setAnchor(e.currentTarget)}>
        Add widget
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {kinds.map((kind) => (
          <MenuItem
            key={kind}
            onClick={() => {
              setAnchor(null)
              onAdd(kind)
            }}
          >
            {WIDGET_LABEL[kind]}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
