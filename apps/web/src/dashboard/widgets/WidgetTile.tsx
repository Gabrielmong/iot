import ButtonBase from '@mui/material/ButtonBase'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import { useNavigate } from 'react-router'
import type { Weather } from '../../weather/data/useWeather'
import type { TileSize } from '../lib/tileSize'
import { SunWidget } from './SunWidget'
import { WeatherWidget } from './WeatherWidget'
import { type WidgetKind, widgetName } from './widgetKinds'

type Props = { kind: WidgetKind; size: TileSize; weather: Weather | undefined }

/**
 * A widget card: tapping it opens the weather page. The tap target lies under the content (which lets
 * clicks through), so lists inside stay readable instead of being flattened into a button's name.
 */
export function WidgetTile({ kind, size, weather }: Props) {
  const navigate = useNavigate()
  return (
    <Paper
      variant="outlined"
      sx={{ position: 'relative', height: '100%', borderRadius: '10px', overflow: 'hidden', '&:hover': { borderColor: 'rgba(159, 176, 221, 0.32)' } }}
    >
      <ButtonBase aria-label={widgetName(kind)} onClick={() => navigate('/weather')} sx={{ position: 'absolute', inset: 0 }} />
      <Box sx={{ position: 'relative', height: '100%', pointerEvents: 'none' }}>
        {weather && (kind === 'WEATHER' ? <WeatherWidget weather={weather} size={size} /> : <SunWidget sun={weather.sun} size={size} />)}
      </Box>
    </Paper>
  )
}
