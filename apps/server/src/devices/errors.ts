/** The device cannot be controlled yet: no local key or credentials, or a kind not controlled in Phase 1. */
export class DeviceNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceNotReadyError";
  }
}

/** The driver has no live connection to the device. */
export class DeviceOfflineError extends Error {
  constructor(message = "device is offline") {
    super(message);
    this.name = "DeviceOfflineError";
  }
}

/** The pairing code didn't match what the TV showed; the pairing session can be retried. */
export class WrongPairingCodeError extends Error {
  constructor(message = "wrong pairing code") {
    super(message);
    this.name = "WrongPairingCodeError";
  }
}

/** The TV refused or cancelled the pairing. */
export class PairingRejectedError extends Error {
  constructor(message = "pairing rejected") {
    super(message);
    this.name = "PairingRejectedError";
  }
}
