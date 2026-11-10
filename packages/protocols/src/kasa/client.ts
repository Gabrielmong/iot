import { unwrapIotResult } from './iot-response.js';
import type { KlapSession } from './klap.js';
import { parseSysInfo, type KasaSysInfo } from './sysinfo.js';

export type { KasaSysInfo } from './sysinfo.js';

/** IOT (legacy Kasa JSON) commands for plugs and power strips, sent over a KLAP session. */
export class KasaClient {
  constructor(private readonly session: KlapSession) {}

  async getSysInfo(): Promise<KasaSysInfo> {
    return parseSysInfo(await this.query('system', 'get_sysinfo', {}));
  }

  /** Switches the plug, or one outlet of a strip when `childId` (a sysinfo child `id`) is given. */
  async setRelay(on: boolean, childId?: string): Promise<void> {
    await this.query('system', 'set_relay_state', { state: on ? 1 : 0 }, childId);
  }

  private async query(target: string, cmd: string, arg: object, childId?: string): Promise<Record<string, unknown>> {
    const command = { [target]: { [cmd]: arg } };
    const request = childId === undefined ? command : { context: { child_ids: [childId] }, ...command };
    return unwrapIotResult(await this.session.request(request), target, cmd);
  }
}
