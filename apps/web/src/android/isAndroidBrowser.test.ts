import { isAndroidBrowser } from './isAndroidBrowser'

const chromeAndroid = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'

describe('isAndroidBrowser', () => {
  it('is true for Chrome on Android', () => {
    expect(isAndroidBrowser(chromeAndroid)).toBe(true)
  })
  it('is false inside the Home app', () => {
    expect(isAndroidBrowser(chromeAndroid + ' HomeApp/1.12')).toBe(false)
  })
  it('is false on desktop', () => {
    expect(isAndroidBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36')).toBe(false)
  })
})
