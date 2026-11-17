import BlockIcon from '@mui/icons-material/Block'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import ScheduleIcon from '@mui/icons-material/Schedule'
import SkipNextOutlinedIcon from '@mui/icons-material/SkipNextOutlined'
import CircularProgress from '@mui/material/CircularProgress'
import { createElement, type ReactElement } from 'react'
import type { CiRun } from '../../data/useDeployStatus'

export type CiState = CiRun['state']

export const isUnfinished = (state: CiState) => state === 'QUEUED' || state === 'RUNNING'

/** The icon for a run, job or step state. */
export function ciStateIcon(state: CiState, size = 20): ReactElement {
  const sx = { fontSize: size }
  switch (state) {
    case 'RUNNING':
      return createElement(CircularProgress, { size: size - 2, 'aria-label': 'Running' })
    case 'SUCCEEDED':
      return createElement(CheckCircleOutlineIcon, { color: 'success', titleAccess: 'Succeeded', sx })
    case 'FAILED':
      return createElement(ErrorOutlineIcon, { color: 'error', titleAccess: 'Failed', sx })
    case 'QUEUED':
      return createElement(ScheduleIcon, { color: 'action', titleAccess: 'Queued', sx })
    case 'CANCELLED':
      return createElement(BlockIcon, { color: 'disabled', titleAccess: 'Cancelled', sx })
    case 'SKIPPED':
      return createElement(SkipNextOutlinedIcon, { color: 'disabled', titleAccess: 'Skipped', sx })
    case 'UNKNOWN':
      return createElement(HelpOutlineIcon, { color: 'disabled', titleAccess: 'Unknown', sx })
  }
}
