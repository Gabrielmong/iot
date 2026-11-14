import Link from '@mui/material/Link'
import { useAndroidAppOffer } from './useAndroidAppOffer'

/** "Get the Android app" download link, shown only on Android browsers when the server has an APK. */
export function GetAndroidAppLink() {
  const offer = useAndroidAppOffer()
  if (!offer) return null
  return (
    <Link href="/app/home.apk" download variant="body2" sx={{ alignSelf: 'center' }}>
      Get the Android app
    </Link>
  )
}
