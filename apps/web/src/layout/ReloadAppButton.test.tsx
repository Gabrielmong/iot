import { fireEvent, render, screen } from '@testing-library/react'
import { ReloadAppButton } from './ReloadAppButton'

const APP_UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36 HomeApp/1.12'
const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36'

describe('ReloadAppButton', () => {
  afterEach(() => vi.restoreAllMocks())

  it('inside the Home app, reloads the page to pick up a new deploy', () => {
    const reload = vi.fn()
    render(<ReloadAppButton userAgent={APP_UA} reload={reload} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload app' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('renders nothing in a browser, which has its own reload', () => {
    render(<ReloadAppButton userAgent={BROWSER_UA} reload={() => {}} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
