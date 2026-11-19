import AcUnitIcon from '@mui/icons-material/AcUnit'
import AirIcon from '@mui/icons-material/Air'
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined'
import CloudIcon from '@mui/icons-material/Cloud'
import CloudQueueIcon from '@mui/icons-material/CloudQueue'
import FoggyIcon from '@mui/icons-material/Foggy'
import GrainIcon from '@mui/icons-material/Grain'
import ThunderstormIcon from '@mui/icons-material/Thunderstorm'
import UmbrellaIcon from '@mui/icons-material/Umbrella'
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'
import type { SvgIconComponent } from '@mui/icons-material'
import type { WeatherCondition } from '../../gql/graphql'

const LOOKS: Record<WeatherCondition, { label: string; Icon: SvgIconComponent }> = {
  CLEAR: { label: 'Clear', Icon: WbSunnyOutlinedIcon },
  PARTLY_CLOUDY: { label: 'Partly cloudy', Icon: CloudQueueIcon },
  CLOUDY: { label: 'Cloudy', Icon: CloudIcon },
  FOG: { label: 'Fog', Icon: FoggyIcon },
  DRIZZLE: { label: 'Drizzle', Icon: GrainIcon },
  RAIN: { label: 'Rain', Icon: UmbrellaIcon },
  STORM: { label: 'Storm', Icon: ThunderstormIcon },
  SNOW: { label: 'Snow', Icon: AcUnitIcon },
  WINDY: { label: 'Windy', Icon: AirIcon },
  UNKNOWN: { label: 'Unknown', Icon: CloudQueueIcon },
}

/** The words and icon for a condition: a clear day is "Sunny", a clear night shows a moon. */
export function conditionLook(c: WeatherCondition, isDay = true): { label: string; Icon: SvgIconComponent } {
  if (c === 'CLEAR') return isDay ? { label: 'Sunny', Icon: WbSunnyOutlinedIcon } : { label: 'Clear', Icon: BedtimeOutlinedIcon }
  return LOOKS[c]
}
