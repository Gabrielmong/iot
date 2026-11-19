import { useCallback, useState } from 'react'

function read(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key)
    return saved === null ? fallback : saved === '1'
  } catch {
    return fallback
  }
}

/** An on/off choice remembered on this device; lasts for the visit only when storage is unavailable. */
export function useStoredFlag(key: string, fallback: boolean): [boolean, () => void] {
  const [on, setOn] = useState(() => read(key, fallback))
  const toggle = useCallback(() => {
    setOn((was) => {
      try {
        localStorage.setItem(key, was ? '0' : '1')
      } catch {
        // storage unavailable: the choice lasts for this visit only
      }
      return !was
    })
  }, [key])
  return [on, toggle]
}
