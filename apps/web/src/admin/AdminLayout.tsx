import Box from '@mui/material/Box'
import { Outlet, useLocation } from 'react-router'
import { PageTransition } from '../motion/PageTransition'

/** Shell for /admin/*: the side menu lists the sections, so this only pads and animates the page. */
export function AdminLayout() {
  const { pathname } = useLocation()
  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <PageTransition key={pathname}>
        <Outlet />
      </PageTransition>
    </Box>
  )
}
