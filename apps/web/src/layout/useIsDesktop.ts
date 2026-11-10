import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

/** True from the `md` breakpoint up: side menu and room list on the left instead of the phone layout. */
export function useIsDesktop(): boolean {
  return useMediaQuery(useTheme().breakpoints.up('md'), { noSsr: true })
}
