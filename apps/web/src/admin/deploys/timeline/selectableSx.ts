import type { Theme } from '@mui/material/styles'

/** The selected look shared by job and deploy-attempt lines: a tint and a bar on the left. */
export const selectableSx = {
  borderRadius: 1,
  '&.Mui-selected, &.Mui-selected:hover': {
    bgcolor: 'action.hover',
    boxShadow: (t: Theme) => `inset 3px 0 0 ${t.palette.primary.main}`,
  },
}
