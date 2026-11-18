/** Hands a URL to the browser (and from there to the app registered for its scheme). */
export function openUrl(url: string): void {
  window.location.assign(url)
}
