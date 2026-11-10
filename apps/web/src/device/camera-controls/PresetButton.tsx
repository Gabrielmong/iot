import ButtonBase from '@mui/material/ButtonBase'
import { useRef } from 'react'
import { LONG_PRESS_MS } from './timing'

type Props = { slot: number; saved: boolean; onGo: (slot: number) => void; onSave: (slot: number) => void }

/** A saved slot goes there on tap and saves over on long-press or right-click; an empty slot saves on tap. */
export function PresetButton({ slot, saved, onGo, onSave }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const longPressed = useRef(false)
  const cancel = () => clearTimeout(timer.current)

  const onPointerDown = () => {
    longPressed.current = false
    if (!saved) return
    timer.current = setTimeout(() => {
      longPressed.current = true
      onSave(slot)
    }, LONG_PRESS_MS)
  }
  const onClick = () => {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (saved) onGo(slot)
    else onSave(slot)
  }

  return (
    <ButtonBase
      aria-label={saved ? `Go to position ${slot}` : `Save position ${slot}`}
      title={saved ? `Position ${slot} (hold to save the current view)` : `Save the current view as position ${slot}`}
      onPointerDown={onPointerDown}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault()
        cancel()
        onSave(slot)
      }}
      sx={{
        minWidth: 32,
        height: 32,
        px: 1,
        borderRadius: 1,
        fontSize: 13,
        fontWeight: 600,
        color: 'common.white',
        bgcolor: saved ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.25)',
        border: '1px dashed',
        borderColor: saved ? 'transparent' : 'rgba(255, 255, 255, 0.5)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {saved ? slot : `+${slot}`}
    </ButtonBase>
  )
}
