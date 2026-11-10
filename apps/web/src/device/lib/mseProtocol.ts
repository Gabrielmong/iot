/** The codecs go2rtc's MSE player offers (www/video-rtc.js), filtered by what this browser can play. */
const CODECS = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'hvc1.1.6.L153.B0', 'mp4a.40.2', 'mp4a.40.5', 'flac', 'opus']

/** go2rtc's codec list: the supported ones, comma-separated. */
export function mseCodecs(isTypeSupported: (type: string) => boolean): string {
  return CODECS.filter((codec) => isTypeSupported(`video/mp4; codecs="${codec}"`)).join()
}

/** Our server's required first message on the socket, before go2rtc's protocol starts. */
export const mseAuthMessage = (token: string): string => JSON.stringify({ authToken: token })

/** go2rtc: "send MSE with these codecs". */
export const mseRequest = (codecs: string): string => JSON.stringify({ type: 'mse', value: codecs })

/** go2rtc's text replies we act on: the stream's MIME type, or an error. */
export type MseMessage = { type: 'mse'; value: string } | { type: 'error'; value: string }

export function parseMseMessage(text: string): MseMessage | null {
  try {
    const msg = JSON.parse(text) as { type?: unknown; value?: unknown } | null
    if ((msg?.type === 'mse' || msg?.type === 'error') && typeof msg.value === 'string') {
      return { type: msg.type, value: msg.value }
    }
    return null
  } catch {
    return null
  }
}
