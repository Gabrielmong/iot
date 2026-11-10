import { useMutation } from '@apollo/client/react'
import { useState } from 'react'
import { LOGIN, LOGIN_GUEST } from './documents'
import { formatLoginError } from './formatLoginError'
import { isSharedScreen, setToken } from './session'

export interface LoginState {
  login: (userId: string, pin: string) => Promise<boolean>
  loginGuest: (userId: string) => Promise<boolean>
  error: string | null
  loading: boolean
}

/** Runs the login mutation; stores the token on success, exposes the formatted error otherwise. */
export function useLogin(): LoginState {
  const [mutate, { loading }] = useMutation(LOGIN)
  const [mutateGuest, { loading: guestLoading }] = useMutation(LOGIN_GUEST)
  const [error, setError] = useState<string | null>(null)

  const login = async (userId: string, pin: string): Promise<boolean> => {
    setError(null)
    try {
      const { data } = await mutate({ variables: { userId, pin, shared: isSharedScreen() } })
      if (!data) throw new Error('empty login response')
      setToken(data.login.token)
      return true
    } catch (e) {
      setError(formatLoginError(e))
      return false
    }
  }

  const loginGuest = async (userId: string): Promise<boolean> => {
    setError(null)
    try {
      const { data } = await mutateGuest({ variables: { userId, shared: isSharedScreen() } })
      if (!data) throw new Error('empty login response')
      setToken(data.loginGuest.token)
      return true
    } catch (e) {
      setError(formatLoginError(e))
      return false
    }
  }
  return { login, loginGuest, error, loading: loading || guestLoading }
}
