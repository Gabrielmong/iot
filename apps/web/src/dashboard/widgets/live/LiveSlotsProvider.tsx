import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { EMPTY_SLOTS, release, request, type Slots, take } from './liveSlots'

type Actions = { request: (key: string) => void; take: (key: string) => void; release: (key: string) => void }

const noop = () => {}
// Outside a provider (e.g. arrange mode) nothing streams.
const SlotsContext = createContext<Slots>(EMPTY_SLOTS)
const ActionsContext = createContext<Actions>({ request: noop, take: noop, release: noop })

/** Shares the live-stream slots (two at a time) among the camera widgets on one screen. */
export function LiveSlotsProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Slots>(EMPTY_SLOTS)
  const actions = useMemo<Actions>(
    () => ({
      request: (key) => setSlots((s) => request(s, key)),
      take: (key) => setSlots((s) => take(s, key)),
      release: (key) => setSlots((s) => release(s, key)),
    }),
    [],
  )
  return (
    <ActionsContext.Provider value={actions}>
      <SlotsContext.Provider value={slots}>{children}</SlotsContext.Provider>
    </ActionsContext.Provider>
  )
}

/**
 * A camera's claim on a live slot: asks for one while `wanted` (on screen and the page visible), gives
 * it up when not wanted or unmounted. `take` is the viewer's Play tap.
 */
export function useLiveSlot(key: string, wanted: boolean): { live: boolean; take: () => void } {
  const slots = useContext(SlotsContext)
  const actions = useContext(ActionsContext)
  useEffect(() => {
    if (wanted) actions.request(key)
    else actions.release(key)
  }, [wanted, key, actions])
  useEffect(() => () => actions.release(key), [key, actions])
  return { live: slots.live.includes(key), take: () => actions.take(key) }
}
