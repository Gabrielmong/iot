import { isValidPin } from './pin'

describe('isValidPin', () => {
  it.each(['1234', '12345678', '0000'])('accepts %s', (pin) => expect(isValidPin(pin)).toBe(true))
  it.each(['', '123', '123456789', '12a4', ' 1234', '12.4'])('rejects "%s"', (pin) => expect(isValidPin(pin)).toBe(false))
})
