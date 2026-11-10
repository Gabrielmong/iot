import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

type Props = {
  id: string
  number: number
  count: number
  title: string
  dashed?: boolean
  onMove: (delta: number) => void
  onRemove: () => void
  children: ReactNode
}

/** A step card: drag handle (mouse/touch), move up/down buttons (keyboard), remove, and its body. */
export function SortableStep({ id, number, count, title, dashed = false, onMove, onRemove, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <Paper
      ref={setNodeRef}
      role="group"
      aria-label={`Step ${number}: ${title}`}
      variant="outlined"
      sx={{
        p: 1.5,
        borderStyle: dashed ? 'dashed' : 'solid',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <Box {...attributes} {...listeners} tabIndex={-1} sx={{ display: 'flex', cursor: 'grab', touchAction: 'none', color: 'text.secondary' }}>
          <DragIndicatorIcon fontSize="small" />
        </Box>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {number} · {title}
        </Typography>
        <IconButton size="small" aria-label={`Move step ${number} up`} disabled={number === 1} onClick={() => onMove(-1)}>
          <ArrowUpwardIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label={`Move step ${number} down`} disabled={number === count} onClick={() => onMove(1)}>
          <ArrowDownwardIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label={`Remove step ${number}`} onClick={onRemove}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Box>
      {children}
    </Paper>
  )
}
