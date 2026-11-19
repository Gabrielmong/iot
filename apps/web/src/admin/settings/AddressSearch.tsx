import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { useEffect, useRef } from 'react'
import type { LatLng } from '../lib/weatherOptions'

type Props = { onPick: (at: LatLng, address: string | undefined) => void }

/** The bits of Google's Place this uses (its types aren't a dependency here). */
type Place = {
  fetchFields(options: { fields: string[] }): Promise<unknown>
  location?: { lat(): number; lng(): number } | null
  formattedAddress?: string | null
}
type PlaceSelectEvent = Event & { placePrediction: { toPlace(): Place } }

/** Google's address search box; picking a place moves the pin there. */
export function AddressSearch({ onPick }: Props) {
  const places = useMapsLibrary('places')
  const host = useRef<HTMLDivElement>(null)
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    if (!places || !host.current) return
    const box = new places.PlaceAutocompleteElement({})
    box.style.width = '100%'
    const onSelect = async (event: Event) => {
      const place = (event as PlaceSelectEvent).placePrediction.toPlace()
      await place.fetchFields({ fields: ['location', 'formattedAddress'] })
      if (place.location) pick.current({ lat: place.location.lat(), lng: place.location.lng() }, place.formattedAddress ?? undefined)
    }
    box.addEventListener('gmp-select', onSelect)
    host.current.appendChild(box)
    return () => {
      box.removeEventListener('gmp-select', onSelect)
      box.remove()
    }
  }, [places])

  return <div ref={host} aria-label="Search for an address" />
}
