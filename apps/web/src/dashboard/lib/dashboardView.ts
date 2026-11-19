import type { Device, Room } from '../types'
import { ALL_TAB, devicesInTab, HOME_TAB, roomTabs } from './roomTabs'
import { visibleTiles } from './visibleTiles'

/** What the dashboard shows for the selected tab (falls back to "All" if that room vanished); Home gets every visible device. */
export function dashboardView(devices: readonly Device[], rooms: readonly Room[], selectedTab: string) {
  const tiles = visibleTiles(devices)
  const tabs = roomTabs(rooms, tiles)
  const tab = selectedTab === HOME_TAB || tabs.some((r) => r.id === selectedTab) ? selectedTab : ALL_TAB
  return { tabs, tab, tiles: devicesInTab(tiles, tab) }
}
