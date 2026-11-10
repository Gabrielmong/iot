import { ConfirmDialog } from '../../admin/common/ConfirmDialog'
import { useDeleteRoutine } from '../data/useDeleteRoutine'
import type { Routine } from '../types'

export function ConfirmDeleteRoutineDialog({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const remove = useDeleteRoutine()
  return (
    <ConfirmDialog title={`Delete ${routine.name}?`} confirmLabel="Delete" onConfirm={() => remove(routine.id)} onClose={onClose}>
      {routine.scope === 'SHARED' ? 'It disappears for everyone it was shared with.' : 'This can’t be undone.'}
    </ConfirmDialog>
  )
}
