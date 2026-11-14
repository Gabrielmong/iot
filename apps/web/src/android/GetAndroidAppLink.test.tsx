import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetAndroidAppLink } from './GetAndroidAppLink'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36'
const identity = (androidApp: unknown, ok = true) => ({ ok, json: async () => ({ app: 'home-control', name: 'Home', androidApp }) })

function setup(ua: string, fetchImpl: () => Promise<unknown>) {
  vi.stubGlobal('navigator', { userAgent: ua })
  const fetchMock = vi.fn(fetchImpl)
  vi.stubGlobal('fetch', fetchMock)
  render(<GetAndroidAppLink />)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('GetAndroidAppLink', () => {
  it('links to the APK on Android when the server has one', async () => {
    setup(ANDROID, async () => identity({ versionCode: 3 }))
    const link = await screen.findByRole('link', { name: 'Get the Android app' })
    expect(link).toHaveAttribute('href', '/app/home.apk')
    expect(link).toHaveAttribute('download')
  })

  it('shows nothing when the server has no APK', async () => {
    const fetchMock = setup(ANDROID, async () => identity(null))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows nothing when the fetch fails', async () => {
    const fetchMock = setup(ANDROID, async () => Promise.reject(new Error('offline')))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows nothing when the identity request is not OK, even if the body looks like an offer', async () => {
    const fetchMock = setup(ANDROID, async () => ({ ...identity({ versionCode: 3 }, false), status: 404 }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows nothing inside the Home app and does not fetch', () => {
    const fetchMock = setup(ANDROID + ' HomeApp/1.12', async () => identity({ versionCode: 3 }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows nothing on desktop and does not fetch', () => {
    const fetchMock = setup('Mozilla/5.0 (Windows NT 10.0) Chrome/126.0', async () => identity({ versionCode: 3 }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
