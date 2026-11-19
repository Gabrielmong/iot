import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Paper from '@mui/material/Paper'
import { useNavigate } from 'react-router'
import type { WidgetTileInfo } from '../lib/reconcileLayout'
import { widgetHref } from './lib/widgetHref'
import type { WidgetData } from './useWidgetData'
import { WidgetBody } from './WidgetBody'
import { widgetName } from './widgetKinds'

type Props = { tile: WidgetTileInfo; data: WidgetData }

/**
 * A widget card. Widgets with a page (weather, a room, a camera) open it on tap: the tap target lies
 * under the content (which lets clicks through), so lists inside stay readable instead of being
 * flattened into a button's name. The others are a labelled group.
 */
export function WidgetTile({ tile, data }: Props) {
  const navigate = useNavigate()
  const href = widgetHref(tile)
  const name = widgetName(tile.widget)
  return (
    <Paper
      variant="outlined"
      role={href ? undefined : 'group'}
      aria-label={href ? undefined : name}
      sx={{ position: 'relative', height: '100%', borderRadius: '10px', overflow: 'hidden', '&:hover': { borderColor: 'rgba(159, 176, 221, 0.32)' } }}
    >
      {href && <ButtonBase aria-label={name} onClick={() => navigate(href)} sx={{ position: 'absolute', inset: 0 }} />}
      <Box sx={{ position: 'relative', height: '100%', pointerEvents: href ? 'none' : undefined }}>
        <WidgetBody tile={tile} data={data} />
      </Box>
    </Paper>
  )
}
