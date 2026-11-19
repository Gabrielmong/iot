import type { SvgIconProps } from '@mui/material/SvgIcon'
import type { WeatherCondition } from '../gql/graphql'
import { conditionLook } from './lib/conditionLook'

/** decorative: the condition is already written next to it, so screen readers skip the icon. */
type Props = { condition: WeatherCondition; isDay?: boolean; decorative?: boolean } & Omit<SvgIconProps, 'children'>

/** The condition's icon, labelled for screen readers. */
export function WeatherIcon({ condition, isDay = true, decorative = false, ...props }: Props) {
  const { label, Icon } = conditionLook(condition, isDay)
  return decorative ? <Icon aria-hidden {...props} /> : <Icon titleAccess={label} {...props} />
}
