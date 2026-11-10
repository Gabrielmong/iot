type Entry = { userId: string; devices: Set<string> };

/**
 * Which cameras each session has been given video for (a WebRTC answer or an MSE stream), so ending a
 * session cuts only those cameras: a user who just signs in and out cannot force restarts that
 * interrupt everyone. Kept for the session's lifetime (independent of viewer tracking) and dropped
 * when it ends. Each session's set holds only cameras registered now, so it never exceeds the number
 * of cameras.
 */
export class SessionCameras {
  private readonly bySession = new Map<string, Entry>();

  /** `registered`: the cameras whose streams are registered now. */
  constructor(private readonly registered: () => Iterable<string>) {}

  record(sessionKey: string, userId: string, deviceId: string): void {
    const entry = this.bySession.get(sessionKey) ?? { userId, devices: new Set<string>() };
    const known = new Set(this.registered());
    for (const id of entry.devices) if (!known.has(id)) entry.devices.delete(id);
    entry.devices.add(deviceId);
    this.bySession.set(sessionKey, entry);
  }

  /** The session's cameras; the record is dropped. */
  take(sessionKey: string): Set<string> {
    const entry = this.bySession.get(sessionKey);
    this.bySession.delete(sessionKey);
    return entry?.devices ?? new Set();
  }

  /** The cameras of all the user's sessions; their records are dropped. */
  takeUser(userId: string): Set<string> {
    const devices = new Set<string>();
    for (const [key, entry] of this.bySession) {
      if (entry.userId !== userId) continue;
      for (const id of entry.devices) devices.add(id);
      this.bySession.delete(key);
    }
    return devices;
  }

  /** Session keys with a record (for the sweep's session checks). */
  sessions(): string[] {
    return [...this.bySession.keys()];
  }

  /** A removed camera leaves every record. */
  forget(deviceId: string): void {
    for (const entry of this.bySession.values()) entry.devices.delete(deviceId);
  }
}
