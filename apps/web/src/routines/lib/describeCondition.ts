import type { ConditionMetric, ConditionOp } from '../../gql/graphql'
import { METRICS } from './conditionMetrics'

type Condition = { metric: ConditionMetric; op: ConditionOp; value: number | null }

/** "temperature above 28°", "not raining now", "the sun is up": the server's wording. */
export function describeCondition(c: Condition): string {
  if (c.metric === 'SUN') return c.op === 'IS_UP' ? 'the sun is up' : 'the sun is down'
  if (c.metric === 'RAINING_NOW') return c.op === 'IS' ? 'raining now' : 'not raining now'
  const { text, range } = METRICS[c.metric]
  return `${text} ${c.op === 'ABOVE' ? 'above' : 'below'} ${c.value}${range?.unit ?? ''}`
}

/** "temperature above 28° and not raining now" */
export const describeConditions = (conditions: readonly Condition[]) => conditions.map(describeCondition).join(' and ')
