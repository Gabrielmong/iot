/** True for an Android browser, false inside the Home app (its WebView adds `HomeApp/<version>`). */
export function isAndroidBrowser(ua: string): boolean {
  return /Android/.test(ua) && !/HomeApp\//.test(ua)
}
