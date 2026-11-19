import { defaultIntegration, isIntegrationSlug } from './integrations'

const status = (tuya: boolean, kasa: boolean, swann: boolean) => ({ tuyaCloudConfigured: tuya, kasaConfigured: kasa, swannConfigured: swann, xweatherConfigured: false, googleMapsConfigured: false })

describe('defaultIntegration', () => {
  it('picks the first integration that is not set up', () => {
    expect(defaultIntegration(status(true, false, false))).toBe('kasa')
    expect(defaultIntegration(status(true, true, false))).toBe('swann')
    expect(defaultIntegration(status(false, true, true))).toBe('tuya')
  })

  it('falls back to Tuya when everything is set up', () => {
    expect(defaultIntegration(status(true, true, true))).toBe('tuya')
  })

  it('never opens weather or maps on its own', () => {
    expect(defaultIntegration({ ...status(true, true, true), xweatherConfigured: false, googleMapsConfigured: false })).toBe('tuya')
  })
})

describe('isIntegrationSlug', () => {
  it('accepts only known integrations', () => {
    expect(isIntegrationSlug('kasa')).toBe(true)
    expect(isIntegrationSlug('xyz')).toBe(false)
  })
})
