import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import Typography from '@mui/material/Typography'
import { useRef, useState, type ReactNode } from 'react'
import type { Device } from '../../dashboard/types'
import { clampPage, gridShape, pageCount, pageItems, type Layout } from '../lib/gridLayout'
import { CameraTile } from '../tile/CameraTile'
import { FullCamera } from './FullCamera'
import { GridToolbar } from './GridToolbar'

/** empty: shown in place of the slots when there are no cameras. */
type Props = { cameras: readonly Device[]; layout: Layout; onLayout: (layout: Layout) => void; empty?: ReactNode }

/**
 * NVR-style grid: `layout` tiles per page (at most 4 on phones), dark empty slots, paging when the
 * cameras don't fit. Only the visible page streams; opening one camera stops every tile until it closes.
 */
export function CameraGrid({ cameras, layout, onLayout, empty }: Props) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const frameRef = useRef<HTMLDivElement>(null)
  const [requestedPage, setPage] = useState(0)
  // The container is captured on tap: while the grid is in browser full screen the view must mount inside it.
  const [open, setOpen] = useState<{ device: Device; container: HTMLElement | null } | null>(null)
  const openCamera = (device: Device) => {
    const frame = frameRef.current
    setOpen({ device, container: frame && document.fullscreenElement === frame ? frame : null })
  }
  const { cols, perPage } = gridShape(layout, phone)
  const page = clampPage(requestedPage, cameras.length, perPage)
  const shown = pageItems(cameras, page, perPage)

  const toggleFullScreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void frameRef.current?.requestFullscreen?.()
  }

  return (
    <Box ref={frameRef} data-testid="camera-grid" sx={{ bgcolor: 'background.default' }}>
      <GridToolbar
        layout={layout}
        onLayout={onLayout}
        page={page}
        pages={pageCount(cameras.length, perPage)}
        onPage={setPage}
        onFullScreen={toggleFullScreen}
      />
      {cameras.length === 0 && empty ? (
        <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 8 }}>{empty}</Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 0.75 }}>
        {Array.from({ length: perPage }, (_, i) => {
          const device = shown[i]
          if (device && !open) return <CameraTile key={device.id} device={device} onOpen={openCamera} />
          return (
            <Box
              key={device?.id ?? `empty-${i}`}
              data-testid={device ? undefined : 'empty-slot'}
              sx={{ aspectRatio: '16 / 9', bgcolor: 'grey.900', borderRadius: 1 }}
            />
          )
        })}
      </Box>
      )}
      {open && (
        <FullCamera device={open.device} onClose={() => setOpen(null)} container={open.container} />
      )}
    </Box>
  )
}
