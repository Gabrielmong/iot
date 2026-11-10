import type { Go2rtcApi } from "./go2rtc/api.js";
import type { StreamRegistry } from "./streams/registry.js";

/** What the camera endpoints need from streaming: the stream registry, go2rtc's media API and its restart. */
export interface CameraServices {
  streams: Pick<StreamRegistry, "ensure" | "release" | "deviceIds" | "streamNamesOf">;
  go2rtc: Pick<Go2rtcApi, "frameJpeg" | "webrtcAnswer" | "mseUrl" | "authHeaders" | "streamInfo">;
  /** Restarts go2rtc, ending every media session (streams are registered again on its `ready`). */
  restartGo2rtc: () => void;
}
