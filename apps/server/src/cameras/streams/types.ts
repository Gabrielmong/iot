import type { DeviceRecord } from "../../devices/types.js";
import type { Go2rtcStream } from "../go2rtc/reregister.js";

/**
 * A camera's go2rtc sources (they carry logins or bearer cloud URLs): the main one for live video and,
 * when the camera has one, the sub stream. Names are added by the registry.
 */
export type CameraSources = { live: string; sub?: string };

/** A camera's registered go2rtc streams (named sources). */
export type CameraStreams = { live: Go2rtcStream; sub?: Go2rtcStream };

/** Builds a device's sources; throws CameraUnavailableError (or TuyaCloudStreamUnavailableError) when they cannot be built. */
export type StreamResolver = (device: DeviceRecord) => Promise<CameraSources>;
