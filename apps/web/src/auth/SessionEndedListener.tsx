import { useApolloClient } from '@apollo/client/react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { onSessionEnded } from './sessionEvents'

/** Renders nothing; when the session ends, drops cached data and routes to /login. */
export function SessionEndedListener() {
  const client = useApolloClient()
  const navigate = useNavigate()
  useEffect(
    () =>
      onSessionEnded(() => {
        void client.clearStore()
        navigate('/login', { replace: true })
      }),
    [client, navigate],
  )
  return null
}
