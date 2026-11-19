import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import type { TargetKind } from './lib/widgetTargets'
import type { WidgetData } from './useWidgetData'
import { WIDGET_KINDS, WIDGET_LABEL, WIDGET_TARGET, type WidgetKind } from './widgetKinds'
import { WidgetTargetDialog } from './WidgetTargetDialog'

type Props = { data: WidgetData; onAdd: (kind: WidgetKind, targetId: string | undefined) => void }

/** "Add widget" in arrange mode: every kind; a routine, camera or room widget first asks which one. */
export function AddWidgetButton({ data, onAdd }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [picking, setPicking] = useState<{ kind: WidgetKind; target: TargetKind } | null>(null)

  const choose = (kind: WidgetKind) => {
    setAnchor(null)
    const target = WIDGET_TARGET[kind]
    if (target) setPicking({ kind, target })
    else onAdd(kind, undefined)
  }

  return (
    <>
      <Button variant="outlined" startIcon={<AddIcon />} onClick={(e) => setAnchor(e.currentTarget)}>
        Add widget
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {WIDGET_KINDS.map((kind) => (
          <MenuItem key={kind} onClick={() => choose(kind)}>
            {WIDGET_LABEL[kind]}
          </MenuItem>
        ))}
      </Menu>
      <WidgetTargetDialog
        kind={picking?.target ?? null}
        data={data}
        onClose={() => setPicking(null)}
        onPick={(targetId) => {
          if (picking) onAdd(picking.kind, targetId)
          setPicking(null)
        }}
      />
    </>
  )
}
