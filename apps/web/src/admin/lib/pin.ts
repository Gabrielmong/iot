export const PIN_PATTERN = /^\d{4,8}$/

export const isValidPin = (pin: string): boolean => PIN_PATTERN.test(pin)

export const PIN_HINT = '4 to 8 digits'
