import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'

export function DeviceNotFound() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography>Not found or no access</Typography>
      <Button component={Link} to="/" sx={{ mt: 1 }}>
        Back to dashboard
      </Button>
    </Box>
  )
}
