import type { AdminDevice, Room } from '../types'
import { AddKasaDialog } from './AddKasaDialog'
import { AddTvDialog } from './AddTvDialog'
import { AdoptDialog } from './AdoptDialog'
import { AddComputerDialog } from './computers/AddComputerDialog'
import { EditComputerDialog } from './computers/EditComputerDialog'
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog'
import { PairTvDialog } from './pairing/PairTvDialog'
import { RenameMoveDialog } from './RenameMoveDialog'
import { SetKeyDialog } from './SetKeyDialog'

export type DeviceDialogState =
  | { type: 'adopt' | 'edit' | 'key' | 'pair' | 'computer' | 'remove'; device: AdminDevice }
  | { type: 'kasa' | 'addTv' | 'addComputer' }
  | null

type Props = { state: DeviceDialogState; devices: readonly AdminDevice[]; rooms: readonly Room[]; onClose: () => void }

/** Renders whichever device dialog is open. */
export function DeviceDialogs({ state, devices, rooms, onClose }: Props) {
  if (!state) return null
  if (!('device' in state)) {
    if (state.type === 'kasa') return <AddKasaDialog onClose={onClose} />
    if (state.type === 'addTv') return <AddTvDialog onClose={onClose} />
    return <AddComputerDialog rooms={rooms} onClose={onClose} />
  }
  const { device } = state
  switch (state.type) {
    case 'adopt':
      return <AdoptDialog device={device} rooms={rooms} onClose={onClose} />
    case 'edit':
      return <RenameMoveDialog device={device} rooms={rooms} onClose={onClose} />
    case 'key':
      return <SetKeyDialog device={device} onClose={onClose} />
    case 'pair':
      return <PairTvDialog device={device} onClose={onClose} />
    case 'computer':
      return <EditComputerDialog device={device} onClose={onClose} />
    case 'remove': {
      const outletCount = devices.filter((d) => d.parentId === device.id).length
      return <ConfirmRemoveDialog device={device} outletCount={outletCount} onClose={onClose} />
    }
  }
}
