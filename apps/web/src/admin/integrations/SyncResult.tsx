import Alert from '@mui/material/Alert'
import { syncSummary } from '../lib/deviceLabels'
import { NameList } from './NameList'

type Props = { matched: number; unmatched: readonly string[]; found: readonly string[] }

/** Outcome of a Tuya key sync: how many devices got keys, which were found without a broadcast, and which were not seen locally. */
export function SyncResult({ matched, unmatched, found }: Props) {
  return (
    <>
      <Alert severity="success">{syncSummary(matched)}</Alert>
      <NameList
        intro="Found on your network by searching (these devices don't announce themselves, so they are now listed under Devices):"
        names={found}
      />
      <NameList
        intro="These devices are in your Tuya account but weren't seen on the network (they may be offline, or on another network):"
        names={unmatched}
      />
    </>
  )
}
