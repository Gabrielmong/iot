import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'

type Props = { name: string; showBack: boolean }

/** The room's name; on a phone, with a way back to the room grid. */
export function RoomHeader({ name, showBack }: Props) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, flex: '1 1 200px' }}>
      {showBack && (
        <IconButton component={Link} to="/" aria-label="Back to rooms" sx={{ border: 1, borderColor: 'divider' }}>
          <ArrowBackIcon />
        </IconButton>
      )}
      <Typography variant="h5" component="h1" noWrap sx={{ fontWeight: 700 }}>
        {name}
      </Typography>
    </Stack>
  )
}
