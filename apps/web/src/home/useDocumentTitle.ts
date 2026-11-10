import { useEffect } from 'react'

/** Keeps the browser tab title in sync with `title`. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
  }, [title])
}
