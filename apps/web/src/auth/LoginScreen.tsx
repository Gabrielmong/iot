import { useQuery } from '@apollo/client/react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useHomeName } from '../home/data/useHomeName'
import { useDocumentTitle } from '../home/useDocumentTitle'
import { BrandMark } from '../layout/BrandMark'
import { easeOut } from '../motion/tokens'
import { LOGIN_USERS } from './documents'
import { useLogin } from './useLogin'
import { PinLogin } from './PinLogin'
import { SharedScreenToggle } from './SharedScreenToggle'
import { UserPicker, type PickerUser } from './UserPicker'

const step = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: easeOut } },
}

/** /login: pick your name, then enter your PIN. Each step rises in as it appears. */
export function LoginScreen() {
  const navigate = useNavigate()
  const { data, loading, error } = useQuery(LOGIN_USERS)
  const [selected, setSelected] = useState<PickerUser | null>(null)
  const { loginGuest, error: guestError, loading: signingIn } = useLogin()
  const homeName = useHomeName()
  useDocumentTitle(homeName)

  const onSelect = async (user: PickerUser) => {
    if (user.hasPin) return setSelected(user)
    if (await loginGuest(user.id)) navigate('/', { replace: true })
  }

  return (
    <Stack spacing={4} sx={{ alignItems: 'center', justifyContent: 'center', minHeight: '100%', p: 2 }}>
      <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center' }}>
        <SharedScreenToggle />
      </Box>
      <Typography variant="h3" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, '& svg': { width: 44, height: 44 } }}>
        <BrandMark />
        {homeName}
      </Typography>
      {loading && <CircularProgress />}
      {error && <Alert severity="error">Cannot reach the server</Alert>}
      {data && !selected && (
        <motion.div key="picker" {...step}>
          {guestError && <Alert severity="error" sx={{ mb: 2 }}>{guestError}</Alert>}
          <UserPicker users={data.loginUsers} onSelect={onSelect} disabled={signingIn} />
        </motion.div>
      )}
      {selected && (
        <motion.div key={'pin-' + selected.id} {...step}>
          <PinLogin user={selected} onSuccess={() => navigate('/', { replace: true })} onBack={() => setSelected(null)} />
        </motion.div>
      )}
    </Stack>
  )
}
