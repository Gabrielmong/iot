import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { adminErrorMessage } from './adminErrorMessage'

const gqlError = (code: string, message: string) =>
  new CombinedGraphQLErrors({ errors: [{ message, extensions: { code } }] })

describe('adminErrorMessage', () => {
  it('maps known codes to friendly text', () => {
    expect(adminErrorMessage(gqlError('TUYA_CLOUD_AUTH', 'x'))).toMatch(/rejected that Access ID or Secret/)
    expect(adminErrorMessage(gqlError('TUYA_CLOUD_EXPIRED', 'x'))).toMatch(/expired/)
    expect(adminErrorMessage(gqlError('DEVICE_UNREACHABLE', 'x'))).toMatch(/No device answered/)
    expect(adminErrorMessage(gqlError('KASA_AUTH_FAILED', 'x'))).toMatch(/rejected these TP-Link credentials/)
    expect(adminErrorMessage(gqlError('SWANN_AUTH_FAILED', 'x'))).toMatch(/rejected that username or password/)
    expect(adminErrorMessage(gqlError('SWANN_UNREACHABLE', 'x'))).toMatch(/didn't answer/)
    expect(adminErrorMessage(gqlError('SWANN_NO_STREAMS', 'x'))).toMatch(/no camera streams/)
    expect(adminErrorMessage(gqlError('ONVIF_AUTH_FAILED', 'x'))).toMatch(/camera rejected that username or password/)
    expect(adminErrorMessage(gqlError('ONVIF_UNREACHABLE', 'x'))).toMatch(/didn't answer over ONVIF/)
    expect(adminErrorMessage(gqlError('ONVIF_NO_STREAM', 'x'))).toMatch(/no usable local stream/)
    expect(adminErrorMessage(gqlError('ONVIF_CAMERA_NOT_CONFIRMED', 'x'))).toMatch(/Wait until the camera shows online/)
  })

  it('uses the server message for BAD_USER_INPUT (e.g. last admin)', () => {
    expect(adminErrorMessage(gqlError('BAD_USER_INPUT', 'Cannot remove the last admin'))).toBe('Cannot remove the last admin')
  })

  it('does not leak raw server messages for other unmapped codes', () => {
    expect(adminErrorMessage(gqlError('INTERNAL_SERVER_ERROR', 'prisma exploded'))).toBe('Something went wrong. Try again.')
    expect(adminErrorMessage(gqlError('NOT_FOUND', 'Device not found'))).toBe('Something went wrong. Try again.')
  })

  it('has a generic message for non-GraphQL failures', () => {
    expect(adminErrorMessage(new Error('offline'))).toBe('Something went wrong. Try again.')
  })
})
