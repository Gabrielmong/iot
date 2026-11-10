import { TuyaCloudAuthError, TuyaCloudError, TuyaCloudStreamUnavailableError } from "@home/protocols";
import { describe, expect, it } from "vitest";
import { failureReason } from "../src/cameras/failure-reason.js";
import { Go2rtcHttpError } from "../src/cameras/go2rtc/api.js";
import { go2rtcErrorDetail } from "../src/cameras/go2rtc/error-detail.js";
import { CameraUnavailableError } from "../src/cameras/streams/errors.js";

describe("go2rtcErrorDetail", () => {
  it("keeps go2rtc's plain error text, without control characters, at most 120 characters", () => {
    expect(go2rtcErrorDetail(Buffer.from("streams: wrong response on DESCRIBE"))).toBe("streams: wrong response on DESCRIBE");
    expect(go2rtcErrorDetail(Buffer.from("webrtc: codecs not matched\n"))).toBe("webrtc: codecs not matched");
    expect(go2rtcErrorDetail(Buffer.from("codecs \u0007not\u0000 matched"))).toBe("codecs not matched");
    expect(go2rtcErrorDetail(Buffer.from("x ".repeat(300)))).toHaveLength(120);
  });

  it("drops text that could carry a URL or a login, however it is disguised, and empty text", () => {
    for (const text of [
      "rtsp://u:p@h",
      "rtsp:\u0000//u:p@h",
      "u:p@host",
      "%3A%2F%2Fu",
      "streams: rtsps:x",
      "streams: dial rtsps://cloud.example/secret-token: EOF",
      "open C:\\run\\x",
      "path /api/streams",
      "user:\u0001pass",
      "  \n",
      "stream not found cam-0123456789abcdef0123456789abcdef",
    ]) {
      expect([text, go2rtcErrorDetail(Buffer.from(text))]).toEqual([text, undefined]);
    }
  });
});

describe("failureReason", () => {
  it("names go2rtc's HTTP status and its sanitized error text", () => {
    expect(failureReason(new Go2rtcHttpError(500, "POST", "/api/webrtc", "codecs not matched"))).toBe("go2rtc HTTP 500: codecs not matched");
    expect(failureReason(new Go2rtcHttpError(404, "GET", "/api/frame.jpeg"))).toBe("go2rtc HTTP 404");
  });

  it("names the Tuya error class and code behind a refused cloud stream", () => {
    const tuya = new TuyaCloudError("Tuya cloud error 2001: device offline", { code: 2001 });
    expect(failureReason(new TuyaCloudStreamUnavailableError({ cause: tuya }))).toBe("TuyaCloudStreamUnavailableError (TuyaCloudError 2001)");
    expect(failureReason(new TuyaCloudStreamUnavailableError({ cause: new TuyaCloudAuthError("no credentials") }))).toBe(
      "TuyaCloudStreamUnavailableError (TuyaCloudAuthError)",
    );
    expect(failureReason(new TuyaCloudStreamUnavailableError())).toBe("TuyaCloudStreamUnavailableError");
  });

  it("gives other errors' class only (their text may carry a source), except the fixed camera-unavailable texts", () => {
    expect(failureReason(new Error("dial rtsp://admin:hunter2@10.0.0.5 failed"))).toBe("Error");
    expect(failureReason(new TypeError("x"))).toBe("TypeError");
    expect(failureReason(new CameraUnavailableError("camera streaming is not available"))).toBe("CameraUnavailableError: camera streaming is not available");
    expect(failureReason("boom")).toBe("unknown");
  });
});
