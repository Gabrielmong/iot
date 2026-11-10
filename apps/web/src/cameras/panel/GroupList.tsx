import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Collapse from '@mui/material/Collapse'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import { useId, useState } from 'react'
import type { CameraGroup } from '../types'

type Props = {
  title: string
  groups: readonly CameraGroup[]
  selectedId: string | null
  onSelect: (group: CameraGroup) => void
  /** Collapsed until opened, showing each group's owner (admins' "Other users"). */
  collapsible?: boolean
}

/** One section of saved groups; the group in view is highlighted. Nothing when empty. */
export function GroupList({ title, groups, selectedId, onSelect, collapsible = false }: Props) {
  const titleId = useId()
  const [open, setOpen] = useState(!collapsible)
  if (groups.length === 0) return null
  const items = groups.map((g) => (
    <ListItemButton key={g.id} selected={g.id === selectedId} onClick={() => onSelect(g)} aria-label={collapsible ? `${g.name}, ${g.owner?.name ?? ''}` : g.name} sx={{ borderRadius: 1 }}>
      <ListItemText primary={g.name} secondary={collapsible ? g.owner?.name : undefined} />
    </ListItemButton>
  ))
  return (
    <section aria-labelledby={titleId}>
      {collapsible ? (
        <ListItemButton id={titleId} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={title} sx={{ px: 1 }}>
          <ListItemText primary={title} slotProps={{ primary: { variant: 'overline', color: 'text.secondary' } }} />
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ListItemButton>
      ) : (
        <ListSubheader id={titleId} disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px' }}>
          {title}
        </ListSubheader>
      )}
      <Collapse in={open}>
        <List dense disablePadding>
          {items}
        </List>
      </Collapse>
    </section>
  )
}
