import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { motion } from 'framer-motion'

/** Home with nothing placed on it yet: a short note and a way into arrange mode. */
export function HomeEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Box component={motion.div} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} sx={{ mt: 6, textAlign: 'center', color: 'text.secondary' }}>
      <Typography variant="h6" color="text.primary">
        Nothing on Home yet
      </Typography>
      <Typography sx={{ mt: 0.5 }}>Put the devices and widgets you use most here.</Typography>
      <Button variant="contained" onClick={onAdd} sx={{ mt: 2 }}>
        Add to Home
      </Button>
    </Box>
  )
}
