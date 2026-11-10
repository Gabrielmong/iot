import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

const isVisible = () => document.visibilityState !== 'hidden'

/** Whether the page is visible (false while the tab is in the background or the screen is off). */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, isVisible, () => true)
}
