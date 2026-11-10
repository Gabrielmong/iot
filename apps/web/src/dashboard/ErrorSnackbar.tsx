import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'

/** Shows `message` as an error toast; `onClose` clears it. */
export function ErrorSnackbar({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Snackbar open={message !== null} autoHideDuration={5000} onClose={onClose}>
      <Alert severity="error" variant="filled" onClose={onClose} sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  )
}
