import { agentVersionLine } from './agentVersionLine'

const agent = (version: number | null, connected = true) => ({ version, connected })

describe('agentVersionLine', () => {
  it('says up to date when the PC runs the published version', () => {
    expect(agentVersionLine(agent(1012), 1012)).toBe('HomeAgent v1012 · up to date')
  })

  it('says an update is pending, and when it will happen for an offline PC', () => {
    expect(agentVersionLine(agent(1011), 1012)).toBe('HomeAgent v1011 · updating to v1012')
    expect(agentVersionLine(agent(1011, false), 1012)).toBe('HomeAgent v1011 · updates to v1012 when it next connects')
  })

  it('shows just the version when nothing is published', () => {
    expect(agentVersionLine(agent(1012), null)).toBe('HomeAgent v1012')
  })

  it('names development builds and agents that never reported a version', () => {
    expect(agentVersionLine(agent(0), 1012)).toBe('HomeAgent development build')
    expect(agentVersionLine(agent(null), 1012)).toBe('HomeAgent · version not reported yet')
  })
})
