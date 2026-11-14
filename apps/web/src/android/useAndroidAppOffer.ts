import { useEffect, useState } from 'react'
import { isAndroidBrowser } from './isAndroidBrowser'

/** True when this is an Android browser and the server has an APK to offer. Fetches `/api/identity` once; any failure or non-2xx response means no offer. */
export function useAndroidAppOffer(): boolean {
  const [offer, setOffer] = useState(false)
  useEffect(() => {
    if (!isAndroidBrowser(navigator.userAgent)) return
    let cancelled = false
    fetch('/api/identity')
      .then((res) => (res.ok ? res.json() : null))
      .then((identity) => !cancelled && setOffer(identity?.androidApp != null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return offer
}
