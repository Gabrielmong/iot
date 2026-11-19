import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { ONVIF_ERROR_COPY } from './onvifErrorCopy'

const FRIENDLY: Record<string, string> = {
  TUYA_CLOUD_AUTH: 'Tuya rejected that Access ID or Secret. Check them and the region.',
  TUYA_CLOUD_EXPIRED: 'Your Tuya IoT Core subscription has expired. Renew it in the Tuya developer console.',
  TUYA_CLOUD_ERROR: "Couldn't reach the Tuya cloud. Try again in a moment.",
  DEVICE_UNREACHABLE: 'No device answered at that address. Check the IP and that it is on this network.',
  KASA_AUTH_FAILED: 'Saved, but a Kasa device rejected these TP-Link credentials. Check the email and password.',
  NEEDS_CREDENTIALS: 'The device rejected the TP-Link credentials. Update them on the Integrations page.',
  SWANN_AUTH_FAILED: 'The recorder rejected that username or password.',
  SWANN_UNREACHABLE: "The recorder didn't answer at that address. Check the IP and that it is on this network.",
  SWANN_NO_STREAMS: 'The recorder answered, but no camera streams were found.',
  FORBIDDEN: "You don't have permission to do that.",
  ...ONVIF_ERROR_COPY,
}

/** Text for a failed admin action: a friendly line for known codes, the server's message for BAD_USER_INPUT, else generic. */
export function adminErrorMessage(error: unknown): string {
  if (CombinedGraphQLErrors.is(error)) {
    for (const e of error.errors) {
      const code = e.extensions?.code
      if (typeof code === 'string' && FRIENDLY[code]) return FRIENDLY[code]
    }
    // Only input-validation messages and Xweather's reason are written for people (last admin, bad PIN, duplicate name).
    const input = error.errors.find((e) => e.extensions?.code === 'BAD_USER_INPUT' || e.extensions?.code === 'XWEATHER_FAILED')
    if (input?.message) return input.message
  }
  return 'Something went wrong. Try again.'
}
