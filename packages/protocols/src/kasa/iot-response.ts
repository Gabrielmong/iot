import { KasaDeviceError, KasaError } from './errors.js';

type IotReply = Record<string, Record<string, unknown> | undefined>;

/**
 * Unwraps `{target: {cmd: result}}` from an IOT reply, raising KasaDeviceError for a non-zero
 * `err_code` at either level (python-kasa `IotDevice._query_helper`).
 */
export function unwrapIotResult(reply: IotReply, target: string, cmd: string): Record<string, unknown> {
  const module = reply[target];
  if (!module) throw new KasaError(`No ${target} in device response`);
  checkErr(module, `${target}`);
  const result = module[cmd] as Record<string, unknown> | undefined;
  if (!result) throw new KasaError(`No ${target}.${cmd} in device response`);
  checkErr(result, `${target}.${cmd}`);
  return result;
}

function checkErr(obj: Record<string, unknown>, where: string): void {
  const code = obj.err_code;
  if (typeof code === 'number' && code !== 0) {
    const msg = typeof obj.err_msg === 'string' ? `: ${obj.err_msg}` : '';
    throw new KasaDeviceError(`Device error ${code} on ${where}${msg}`, code);
  }
}
