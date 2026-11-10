import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { LAYOUTS, type Layout } from '../lib/gridLayout'

type Props = {
  layout: Layout
  onLayout: (layout: Layout) => void
  page: number
  pages: number
  onPage: (page: number) => void
  onFullScreen: () => void
}

/** Layout picker (1–16), a pager when the cameras don't fit, and full screen for the whole grid. */
export function GridToolbar({ layout, onLayout, page, pages, onPage, onFullScreen }: Props) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
      <ToggleButtonGroup size="small" exclusive aria-label="Layout" value={layout} onChange={(_, v: Layout | null) => v && onLayout(v)}>
        {LAYOUTS.map((n) => (
          <ToggleButton key={n} value={n} aria-label={n === 1 ? '1 camera' : `${n} cameras`} sx={{ px: 1.25 }}>
            {n}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Box sx={{ flex: 1 }} />
      {pages > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="body2">
            Page {page + 1} of {pages}
          </Typography>
          <IconButton aria-label="Next page" disabled={page === pages - 1} onClick={() => onPage(page + 1)}>
            <ChevronRightIcon />
          </IconButton>
        </Box>
      )}
      <IconButton aria-label="Full screen" onClick={onFullScreen}>
        <FullscreenIcon />
      </IconButton>
    </Box>
  )
}
