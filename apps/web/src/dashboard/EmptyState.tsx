import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { motion } from 'framer-motion'

type Props = { failed: boolean; failedTitle?: string }

/** Shown when a room has nothing to show, or devices could not be loaded. */
export function EmptyState({ failed, failedTitle = "Couldn't load devices." }: Props) {
  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      sx={{ mt: 6, textAlign: 'center', color: 'text.secondary' }}
    >
      <Typography variant="h6" color="text.primary">
        {failed ? failedTitle : 'No devices yet.'}
      </Typography>
      <Typography sx={{ mt: 0.5 }}>
        {failed ? 'Check that the home server is running, then reload.' : 'Devices added in Admin show up here.'}
      </Typography>
    </Box>
  )
}
