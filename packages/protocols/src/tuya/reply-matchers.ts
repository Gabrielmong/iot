import type { TuyaVersion } from '../types.js';
import { TuyaKeyError } from './client-errors.js';
import { TuyaCmd } from './constants.js';
import { TuyaFrameError } from './errors.js';
import type { TuyaFrame } from './frame.js';
import { extractDps } from './payloads.js';

/** A frame matcher for `awaitFrame`: returns the reply's value, undefined to keep waiting, or throws. */
export type ReplyMatcher<T> = (frame: TuyaFrame) => T | undefined;

/**
 * Whether `frame` can be the reply to the request sent with `seq`. 55AA devices (3.1-3.4) echo the
 * request seq; 3.5 devices reply with their own counter, so only the command can be checked.
 */
function isReplyTo(version: TuyaVersion, cmd: number, seq: number, frame: TuyaFrame): boolean {
  return frame.cmd === cmd && (version === '3.5' || frame.seq === seq);
}

/**
 * Matches the reply to a DP query: the query command carrying dps, or an empty query ack followed by
 * a STATUS carrying them. STATUS frames before the ack are unsolicited pushes and are not taken.
 * A non-JSON query reply means a wrong key on 3.1/3.3 ({@link TuyaKeyError}), else {@link TuyaFrameError}.
 */
export function queryReplyMatcher(version: TuyaVersion, queryCmd: number, seq: number): ReplyMatcher<Record<string, unknown>> {
  let acked = false;
  return (frame) => {
    if (isReplyTo(version, queryCmd, seq, frame)) {
      const dps = frame.payload.length === 0 ? undefined : parseQueryReply(version, frame.payload);
      if (dps === undefined) acked = true;
      return dps;
    }
    if (acked && frame.cmd === TuyaCmd.STATUS) return tryExtractDps(frame.payload);
    return undefined;
  };
}

/**
 * Matches the device's ack of a control request. STATUS pushes do not count as acks. An ack with a
 * non-zero retcode means the device refused the command, so it throws rather than reporting success.
 */
export function controlAckMatcher(version: TuyaVersion, controlCmd: number, seq: number): ReplyMatcher<true> {
  return (frame) => {
    if (!isReplyTo(version, controlCmd, seq, frame)) return undefined;
    if (frame.retcode !== undefined && frame.retcode !== 0) {
      throw new TuyaFrameError(`device refused the command (retcode ${frame.retcode})`);
    }
    return true;
  };
}

/** The dps in a payload, or undefined if it is empty, not JSON, or has none. */
export function tryExtractDps(payload: Buffer): Record<string, unknown> | undefined {
  if (payload.length === 0) return undefined;
  try {
    return extractDps(payload);
  } catch {
    return undefined;
  }
}

function parseQueryReply(version: TuyaVersion, payload: Buffer): Record<string, unknown> | undefined {
  try {
    return extractDps(payload);
  } catch (cause) {
    if (version === '3.1' || version === '3.3') throw new TuyaKeyError('dps reply is not JSON; wrong local key?', { cause });
    throw new TuyaFrameError('dps reply is not JSON', { cause });
  }
}
