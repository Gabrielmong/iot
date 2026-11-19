import { useStoredFlag } from './useStoredFlag'

/** Whether the desktop side menu is collapsed to icons; remembered on this device. */
export function useNavCollapsed(): [boolean, () => void] {
  return useStoredFlag('home.navCollapsed', false)
}
