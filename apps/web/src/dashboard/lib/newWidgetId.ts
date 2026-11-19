/**
 * A random id for a new widget instance. Built from getRandomValues because crypto.randomUUID only
 * exists in secure contexts, and the app is served over plain http on the home network.
 */
export function newWidgetId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}
