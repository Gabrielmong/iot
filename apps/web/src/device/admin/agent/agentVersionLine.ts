/**
 * The PC's HomeAgent version against the one the server publishes. Agents update themselves on connect,
 * so a connected agent that is behind is updating now, and an offline one updates when it next connects.
 */
export function agentVersionLine(agent: { version: number | null; connected: boolean }, published: number | null): string {
  const { version, connected } = agent
  if (version === null) return 'HomeAgent · version not reported yet'
  if (version === 0) return 'HomeAgent development build'
  const name = `HomeAgent v${version}`
  if (published === null) return name
  if (version >= published) return `${name} · up to date`
  return connected ? `${name} · updating to v${published}` : `${name} · updates to v${published} when it next connects`
}
