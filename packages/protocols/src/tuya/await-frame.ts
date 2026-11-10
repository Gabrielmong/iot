import { TuyaDisconnectedError, TuyaTimeoutError } from './client-errors.js';
import type { TuyaConnection } from './connection.js';
import type { TuyaFrame } from './frame.js';

/**
 * Waits for the first frame that `match` maps to a value (undefined = keep waiting; a throw rejects).
 * Rejects with the stream's error on an undecodable frame, {@link TuyaDisconnectedError} if the
 * connection closes, and {@link TuyaTimeoutError} after `timeoutMs`.
 */
export function awaitFrame<T>(
  conn: TuyaConnection,
  match: (frame: TuyaFrame) => T | undefined,
  timeoutMs: number,
  what: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (conn.isClosed) return reject(new TuyaDisconnectedError(`not connected (${what})`));

    const onFrame = (frame: TuyaFrame) => {
      let value: T | undefined;
      try {
        value = match(frame);
      } catch (err) {
        return settle(() => reject(err));
      }
      if (value !== undefined) settle(() => resolve(value));
    };
    const onFrameError = (err: Error) => settle(() => reject(err));
    const onClose = () => settle(() => reject(new TuyaDisconnectedError(`connection closed while waiting for ${what}`)));
    const timer = setTimeout(
      () => settle(() => reject(new TuyaTimeoutError(`no ${what} within ${timeoutMs} ms`))),
      timeoutMs,
    );

    function settle(finish: () => void) {
      clearTimeout(timer);
      conn.off('frame', onFrame);
      conn.off('frameError', onFrameError);
      conn.off('close', onClose);
      finish();
    }

    conn.on('frame', onFrame);
    conn.on('frameError', onFrameError);
    conn.on('close', onClose);
  });
}
