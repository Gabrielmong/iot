import { useCallback, useState } from 'react'

const KEY = 'home.navCollapsed'

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Whether the desktop side menu is collapsed to icons; remembered on this device. */
export function useNavCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(read)
  const toggle = useCallback(() => {
    setCollapsed((was) => {
      try {
        localStorage.setItem(KEY, was ? '0' : '1')
      } catch {
        // storage unavailable: the choice lasts for this visit only
      }
      return !was
    })
  }, [])
  return [collapsed, toggle]
}
