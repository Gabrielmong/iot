/** True inside the Home Android app: its WebView adds `HomeApp/<version>` to the user agent. */
export const isHomeApp = (ua: string) => /HomeApp\//.test(ua)
