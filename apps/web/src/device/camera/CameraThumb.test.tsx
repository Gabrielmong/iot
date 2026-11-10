import { render, screen } from '@testing-library/react'
import { CameraThumb } from './CameraThumb'

describe('CameraThumb', () => {
  it('shows the image with its age', () => {
    render(<CameraThumb src="blob:x" ageSeconds={12} stale={false} />)
    expect(screen.getByRole('img', { name: 'Latest camera image' })).toHaveAttribute('src', 'blob:x')
    expect(screen.getByText('12 s ago')).toBeInTheDocument()
  })

  it('shows "No recent image" and no image when stale', () => {
    render(<CameraThumb src="blob:x" ageSeconds={61} stale />)
    expect(screen.getByText('No recent image')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText('61 s ago')).not.toBeInTheDocument()
  })

  it('says the cloud stream is not available when the Tuya cloud refused it', () => {
    render(<CameraThumb src={null} ageSeconds={null} stale cloudUnavailable />)
    expect(screen.getByText('Cloud stream not available for this camera')).toBeInTheDocument()
    expect(screen.queryByText('No recent image')).not.toBeInTheDocument()
  })

  it('shows neither before the first frame arrives', () => {
    render(<CameraThumb src={null} ageSeconds={null} stale={false} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText('No recent image')).not.toBeInTheDocument()
  })
})
