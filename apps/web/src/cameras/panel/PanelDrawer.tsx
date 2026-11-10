import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import { useState, type ReactNode } from 'react'

/** On small screens the side panel lives in a drawer opened by a button. */
export function PanelDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outlined" startIcon={<VideocamOutlinedIcon />} onClick={() => setOpen(true)} sx={{ mb: 1 }}>
        Cameras & groups
      </Button>
      <Drawer anchor="left" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 280 }} onClick={(e) => (e.target as HTMLElement).closest('[role="button"]:not([aria-expanded])') && setOpen(false)}>
          {children}
        </Box>
      </Drawer>
    </>
  )
}
