import { useQuery } from '@apollo/client/react'
import { REMOTE_DESKTOP_LAUNCH } from '../../data/documents'

/** True when this browser runs on a PC with the HomeAgent, which opens `home-rdp://` links. */
export function useRemoteDesktopLaunch(skip: boolean): boolean {
  const { data } = useQuery(REMOTE_DESKTOP_LAUNCH, { skip })
  return data?.remoteDesktopLaunch ?? false
}
