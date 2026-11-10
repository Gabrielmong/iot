import { coded } from "../api-errors.js";

export function invalidPinError(attemptsLeft: number) {
  return coded("INVALID_PIN", "Incorrect PIN", { attemptsLeft });
}

export function lockedError(retryAfterSeconds: number) {
  return coded("LOCKED", "Too many attempts. Try again later.", { retryAfterSeconds });
}
