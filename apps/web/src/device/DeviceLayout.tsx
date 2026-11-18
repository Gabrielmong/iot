import Box from '@mui/material/Box'
import { useCurrentUser } from '../auth/useCurrentUser'
import { isCamera, isComputer, isSwitchable, isTv } from '../dashboard/lib/capabilities'
import { RevealGroup, RevealItem } from '../motion/Reveal'
import { ControlsCard } from './controls/ControlsCard'
import { DeviceHeader } from './header/DeviceHeader'
import { DeviceInfoCard } from './info/DeviceInfoCard'
import { DeviceAdminSection } from './admin/DeviceAdminSection'
import { ComputerCard } from './computer/ComputerCard'
import { PowerHistoryCard } from './computer/history/PowerHistoryCard'
import { TvRemoteCard } from './tv/TvRemoteCard'
import { CameraPreview } from './preview/CameraPreview'
import { PreviewCard } from './preview/PreviewCard'
import type { DeviceDetail } from './types'

const twoColumns = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'start' }

/**
 * Header, then preview | controls (switchable kinds), the live view (cameras), the remote (TVs) or the
 * Wake | history cards (computers), then info | admin.
 * The admin card renders only for admins. Sections rise in one after another.
 */
export function DeviceLayout({ device }: { device: DeviceDetail }) {
  const isAdmin = useCurrentUser().user?.role === 'ADMIN'
  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <RevealGroup>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <RevealItem>
            <DeviceHeader device={device} />
          </RevealItem>
          {isCamera(device) && (
            <RevealItem>
              <CameraPreview device={device} />
            </RevealItem>
          )}
          {(isTv(device) || isComputer(device)) && (
            <Box sx={twoColumns}>
              <RevealItem>{isTv(device) ? <TvRemoteCard device={device} /> : <ComputerCard device={device} isAdmin={isAdmin} />}</RevealItem>
              {isComputer(device) && (
                <RevealItem>
                  <PowerHistoryCard device={device} />
                </RevealItem>
              )}
            </Box>
          )}
          {isSwitchable(device) && (
            <Box sx={twoColumns}>
              <RevealItem>
                <PreviewCard device={device} />
              </RevealItem>
              <RevealItem>
                <ControlsCard device={device} />
              </RevealItem>
            </Box>
          )}
          <Box sx={twoColumns}>
            <RevealItem>
              <DeviceInfoCard device={device} />
            </RevealItem>
            <RevealItem>
              <DeviceAdminSection device={device} />
            </RevealItem>
          </Box>
        </Box>
      </RevealGroup>
    </Box>
  )
}
