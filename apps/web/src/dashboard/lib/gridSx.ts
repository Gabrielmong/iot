import { gridColumns } from './gridColumns'
import { gridRowHeight } from './gridRows'

/** The dashboard grid: fixed-height rows; smaller cards fill gaps left by bigger ones (dense flow). */
export const gridSx = {
  display: 'grid',
  gap: { xs: 1.5, sm: 2 },
  gridTemplateColumns: gridColumns,
  gridAutoRows: gridRowHeight,
  gridAutoFlow: 'dense',
} as const
