import type { ConditionMetric, ConditionOp } from '../../gql/graphql'

type Range = { unit: string; min: number; max: number }
/** `label`: in the picker; `text`: in sentences, matching the server's wording. Numeric checks have a range. */
type Metric = { label: string; text: string; ops: readonly ConditionOp[]; range?: Range }

const NUMERIC_OPS = ['ABOVE', 'BELOW'] as const

/** Mirrors the server's checks (routines/conditions.ts): names, units, ranges and allowed ops. */
export const METRICS: Record<ConditionMetric, Metric> = {
  TEMP_C: { label: 'Temperature', text: 'temperature', ops: NUMERIC_OPS, range: { unit: '°', min: -50, max: 60 } },
  FEELS_LIKE_C: { label: 'Feels like', text: 'feels like', ops: NUMERIC_OPS, range: { unit: '°', min: -50, max: 60 } },
  HUMIDITY: { label: 'Humidity', text: 'humidity', ops: NUMERIC_OPS, range: { unit: '%', min: 0, max: 100 } },
  WIND_KPH: { label: 'Wind', text: 'wind', ops: NUMERIC_OPS, range: { unit: ' km/h', min: 0, max: 300 } },
  RAINING_NOW: { label: 'Raining now', text: 'raining now', ops: ['IS', 'IS_NOT'] },
  RAIN_CHANCE_TODAY: { label: 'Chance of rain today', text: 'rain chance today', ops: NUMERIC_OPS, range: { unit: '%', min: 0, max: 100 } },
  SUN: { label: 'Sun', text: 'the sun', ops: ['IS_UP', 'IS_DOWN'] },
}

/** The order checks are offered in. */
export const METRIC_ORDER: readonly ConditionMetric[] = ['TEMP_C', 'FEELS_LIKE_C', 'HUMIDITY', 'WIND_KPH', 'RAINING_NOW', 'RAIN_CHANCE_TODAY', 'SUN']

export const OP_LABEL: Record<ConditionOp, string> = { ABOVE: 'Above', BELOW: 'Below', IS: 'Is', IS_NOT: 'Is not', IS_UP: 'Is up', IS_DOWN: 'Is down' }

/** A check with at most this many conditions (the server's limit). */
export const MAX_CONDITIONS = 5
