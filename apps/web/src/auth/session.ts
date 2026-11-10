const TOKEN_KEY = 'home.token'
const SHARED_KEY = 'home.sharedScreen'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage unavailable (private mode or blocked): behave as signed out
  }
}

export const getToken = (): string | null => read(TOKEN_KEY)
export const setToken = (token: string): void => write(TOKEN_KEY, token)
export const clearToken = (): void => write(TOKEN_KEY, null)
export const isSharedScreen = (): boolean => read(SHARED_KEY) === '1'
export const setSharedScreen = (shared: boolean): void => write(SHARED_KEY, shared ? '1' : null)
