/** Which of a camera's streams a viewer wants: full quality, or the light sub-stream (grid tiles). */
export type StreamQuality = "main" | "sub";

/** The `quality` query parameter of a request URL: exactly `sub` asks for the light stream; anything else is main. Never throws. */
export function qualityOf(url: string | undefined): StreamQuality {
  if (!url) return "main";
  try {
    return new URL(url, "http://localhost").searchParams.get("quality") === "sub" ? "sub" : "main";
  } catch {
    return "main";
  }
}

/** The go2rtc stream to serve: `thumb` is the sub-stream when the camera has one, else the main stream. */
export const streamFor = (names: { live: string; thumb: string }, quality: StreamQuality): string => (quality === "sub" ? names.thumb : names.live);
