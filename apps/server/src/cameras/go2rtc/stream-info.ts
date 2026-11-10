/**
 * What go2rtc reports about a stream, reduced to what the server needs. Producers and consumers keep
 * no URL or address: a producer's JSON carries its source (login or bearer cloud URL).
 */
export interface StreamInfo {
  /** Active: connected and receiving (go2rtc 1.9.15 marshals a stopped producer as just `{"url"}`). */
  producers: { active: boolean }[];
  /** go2rtc's `format_name`: "webrtc", "mse/fmp4" (MSE WebSocket), "keyframe" (frame.jpeg), ...; undefined if not reported. */
  consumers: { formatName?: string }[];
}

/** Parses `GET /api/streams?src=<name>`; null when go2rtc reports no such stream. */
export function parseStreamInfo(body: Buffer): StreamInfo | null {
  const parsed = JSON.parse(body.toString("utf8")) as { producers?: unknown; consumers?: unknown } | null;
  if (!parsed) return null;
  return {
    producers: list(parsed.producers).map((p) => {
      const receivers = (p as { receivers?: unknown } | null)?.receivers;
      return { active: Array.isArray(receivers) && receivers.length > 0 };
    }),
    consumers: list(parsed.consumers).map((c) => {
      const format = (c as { format_name?: unknown } | null)?.format_name;
      return typeof format === "string" ? { formatName: format } : {};
    }),
  };
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
