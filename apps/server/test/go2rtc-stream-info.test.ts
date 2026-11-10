import { describe, expect, it } from "vitest";
import { parseStreamInfo } from "../src/cameras/go2rtc/stream-info.js";

const SECRET = "rtsps://cloud.example:443/live/secret-token";

describe("parseStreamInfo", () => {
  it("reports consumers by format and producers as active or not, never a source URL", () => {
    // go2rtc 1.9.15: a stopped producer marshals as {"url"}; a running one as its connection (with receivers).
    const body = JSON.stringify({
      producers: [
        { url: SECRET },
        { id: 3, format_name: "rtsp", url: SECRET, medias: ["video"], receivers: [{ id: 1, codec: { codec_name: "h264" } }] },
        { id: 4, format_name: "rtsp", url: SECRET, receivers: [] },
      ],
      consumers: [{ id: 5, format_name: "webrtc", remote_addr: "10.0.0.9:5000" }, { id: 6 }],
    });
    const info = parseStreamInfo(Buffer.from(body));
    expect(info).toEqual({
      producers: [{ active: false }, { active: true }, { active: false }],
      consumers: [{ formatName: "webrtc" }, {}],
    });
    expect(JSON.stringify(info)).not.toContain("secret");
  });

  it("reads a missing list as empty, and null as no stream", () => {
    expect(parseStreamInfo(Buffer.from("{}"))).toEqual({ producers: [], consumers: [] });
    expect(parseStreamInfo(Buffer.from("null"))).toBeNull();
  });
});
