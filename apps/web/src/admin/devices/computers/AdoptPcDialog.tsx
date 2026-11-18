import Typography from '@mui/material/Typography'
import { openUrl } from '../../../device/computer/openUrl'
import { FormDialog } from '../../common/FormDialog'
import { useAgentEnrollment } from './useAgentEnrollment'

/** "Adopt this PC": a one-time HomeAgent download, opened on the PC being added. */
export function AdoptPcDialog({ onClose }: { onClose: () => void }) {
  const create = useAgentEnrollment()
  return (
    <FormDialog
      title="Adopt this PC"
      submitLabel="Download the agent"
      onSubmit={async () => openUrl(await create())}
      onClose={onClose}
    >
      <Typography>
        Open this on the PC you want to add. Download the agent and run it; Windows may warn that it's from an unknown
        publisher: choose More info › Run anyway. The PC appears here once the agent connects. The download works once,
        for 30 minutes.
      </Typography>
    </FormDialog>
  )
}
