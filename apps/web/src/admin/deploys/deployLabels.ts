import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import SkipNextOutlinedIcon from '@mui/icons-material/SkipNextOutlined'
import CircularProgress from '@mui/material/CircularProgress'
import { createElement, type ReactElement } from 'react'
import type { DeployEvent } from '../data/useDeployStatus'

export const shortSha = (sha: string) => sha.slice(0, 7)

/** The icon for an event's status. */
export function statusIcon(status: DeployEvent['status']): ReactElement {
  switch (status) {
    case 'RUNNING':
      return createElement(CircularProgress, { size: 20, 'aria-label': 'Running' })
    case 'SUCCEEDED':
      return createElement(CheckCircleOutlineIcon, { color: 'success', titleAccess: 'Succeeded' })
    case 'FAILED':
      return createElement(ErrorOutlineIcon, { color: 'error', titleAccess: 'Failed' })
    case 'SKIPPED':
      return createElement(SkipNextOutlinedIcon, { color: 'disabled', titleAccess: 'Skipped' })
  }
}

export function eventTitle(event: Pick<DeployEvent, 'kind' | 'sha'>): string {
  const sha = event.sha ? shortSha(event.sha) : ''
  switch (event.kind) {
    case 'DEPLOY':
      return sha ? `Deploy ${sha}` : 'Deploy'
    case 'ROLLBACK':
      return sha ? `Rollback to ${sha}` : 'Rollback'
    case 'RESTART':
      return 'Restart'
    case 'PAUSE':
      return 'Auto-deploy paused'
    case 'RESUME':
      return 'Auto-deploy resumed'
  }
}

export const whoLabel = (by: string) => (by === 'auto' ? 'Auto' : by)

/** The paused chip. Reasons are "paused by <who>" or e.g. "rolled back to <sha>". */
export function pausedLabel(reason: string | null | undefined): string {
  if (!reason) return 'Auto-deploy paused'
  return reason.startsWith('paused ') ? `Auto-deploy ${reason}` : `Auto-deploy paused: ${reason}`
}

/** "3m 10s", "45s". */
export function formatDuration(startedAt: string, finishedAt: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000))
  const m = Math.floor(seconds / 60)
  return m > 0 ? `${m}m ${seconds % 60}s` : `${seconds}s`
}

/** "just now", "12 min ago", "3 h ago", "2 d ago". */
export function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`
  return `${Math.floor(minutes / (60 * 24))} d ago`
}
