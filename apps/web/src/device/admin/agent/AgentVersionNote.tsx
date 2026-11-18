import { useQuery } from '@apollo/client/react'
import Typography from '@mui/material/Typography'
import { PUBLISHED_AGENT_VERSION } from '../../data/documents'
import type { DeviceDetail } from '../../types'
import { agentVersionLine } from './agentVersionLine'

/** For admins: which HomeAgent version the PC runs, and whether it has caught up with the published one. */
export function AgentVersionNote({ device }: { device: DeviceDetail }) {
  const agent = device.computer?.agent ?? null
  const { data } = useQuery(PUBLISHED_AGENT_VERSION, { skip: !agent, fetchPolicy: 'cache-and-network' })
  if (!agent) return null
  return (
    <Typography variant="body2" color="text.secondary">
      {agentVersionLine(agent, data?.publishedAgentVersion ?? null)}
    </Typography>
  )
}
