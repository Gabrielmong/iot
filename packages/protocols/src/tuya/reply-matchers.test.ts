import { describe, expect, it } from 'vitest';
import { TuyaCmd } from './constants.js';
import { TuyaFrameError } from './errors.js';
import { controlAckMatcher } from './reply-matchers.js';

const ack = (retcode: number | undefined, seq = 7) => ({ seq, cmd: TuyaCmd.CONTROL, retcode, payload: Buffer.alloc(0) });

describe('controlAckMatcher', () => {
  it('accepts an ack with retcode 0', () => {
    expect(controlAckMatcher('3.3', TuyaCmd.CONTROL, 7)(ack(0))).toBe(true);
  });

  it('accepts an ack without a retcode', () => {
    expect(controlAckMatcher('3.3', TuyaCmd.CONTROL, 7)(ack(undefined))).toBe(true);
  });

  it('rejects an ack whose retcode reports the command was refused', () => {
    expect(() => controlAckMatcher('3.3', TuyaCmd.CONTROL, 7)(ack(1))).toThrow(TuyaFrameError);
  });

  it('ignores an ack for a different request, even with a non-zero retcode', () => {
    expect(controlAckMatcher('3.3', TuyaCmd.CONTROL, 7)(ack(1, 8))).toBeUndefined();
  });
});
