import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { APIProvider, Map, Marker, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps'
import { useEffect } from 'react'
import type { LatLng } from '../lib/weatherOptions'
import { AddressSearch } from './AddressSearch'

type Props = { apiKey: string; value: LatLng | null; onChange: (v: LatLng, address?: string) => void }

const COSTA_RICA: LatLng = { lat: 9.93, lng: -84.08 }
const PIN_ZOOM = 18

/** Keeps the pin in view when it moves from outside the map (an address search). */
function FollowPin({ value }: { value: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !value) return
    if (!map.getBounds()?.contains(value)) map.panTo(value)
    if ((map.getZoom() ?? 0) < 15) map.setZoom(PIN_ZOOM)
  }, [map, value])
  return null
}

/** A Google map with a draggable pin: click to move it, drag it, or search for an address. */
export function LocationMap({ apiKey, value, onChange }: Props) {
  const moveTo = (e: MapMouseEvent) => {
    if (e.detail.latLng) onChange(e.detail.latLng)
  }
  return (
    <APIProvider apiKey={apiKey}>
      <Stack spacing={1}>
        <AddressSearch onPick={(at, address) => onChange(at, address)} />
        <Box sx={{ height: { xs: 280, sm: 360 }, borderRadius: 1, overflow: 'hidden' }}>
          <Map defaultCenter={value ?? COSTA_RICA} defaultZoom={value ? PIN_ZOOM : 8} gestureHandling="greedy" disableDefaultUI={false} onClick={moveTo}>
            {value && (
              <Marker
                position={value}
                draggable
                title="Home"
                onDragEnd={(e) => {
                  if (e.latLng) onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() })
                }}
              />
            )}
            <FollowPin value={value} />
          </Map>
        </Box>
      </Stack>
    </APIProvider>
  )
}
