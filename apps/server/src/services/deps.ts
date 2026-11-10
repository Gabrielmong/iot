import type { OnvifProbeResult, RtspCredentials, RtspDescribeResult, SwannProbeResult, TuyaCloudDevice, TuyaCloudOptions } from "@home/protocols";
import type { ContextDeps } from "../auth/context.js";
import type { KasaCredentials } from "../devices/kasa-credentials.js";
import type { TuyaPresenceTarget } from "../devices/tuya-presence.js";
import type { PendingPairings } from "../devices/pending-pairings.js";
import type { Discovered } from "../devices/types.js";
import type { CameraServices } from "../cameras/camera-services.js";
import type { CameraEventSource } from "./camera-events.js";
import type { GrantEventSource } from "./grant-events.js";
import type { SessionEventSource } from "./session-events.js";
import type { DeployerClient } from "../deployer/types.js";
import type { RoutineService } from "../routines/run-service.js";

export type Clock = () => Date;
export type TuyaRegion = TuyaCloudOptions["region"];
export type TuyaCloudCredentials = { accessId: string; accessSecret: string; region: TuyaRegion };

/** The Tuya cloud calls the app makes (key sync, camera controls). Injected so tests never reach the cloud. */
export type TuyaCloudClient = {
  listDevices(): Promise<TuyaCloudDevice[]>;
  /** A camera's current control values, by code. */
  readCameraValues(deviceId: string): Promise<Record<string, unknown>>;
  /** Sends control values to a camera. */
  issueCameraProperties(deviceId: string, props: Record<string, unknown>): Promise<void>;
};
export type TuyaCloudFactory = (creds: TuyaCloudCredentials) => TuyaCloudClient;

/** Identifies the Kasa device at an IP (KLAP login + sysinfo). Injected so tests never reach a device. */
export type KasaProbe = (ip: string, creds: KasaCredentials) => Promise<Discovered>;

/** Finds the Swann recorder's camera streams (RTSP DESCRIBE). Injected so tests never reach the recorder. */
export type SwannProbe = (host: string, creds: { username: string; password: string }) => Promise<SwannProbeResult>;

/** Finds an ONVIF camera's port and RTSP stream URIs (WS-Security login). Injected so tests never reach a camera. */
export type OnvifProbe = (host: string, creds: RtspCredentials) => Promise<OnvifProbeResult>;

/** RTSP DESCRIBE with a Digest login (never Basic). Injected so tests never reach a camera. */
export type RtspDescribe = (url: string, creds: RtspCredentials) => Promise<RtspDescribeResult>;

/** Whether the real Tuya device answers at an IP (local-key session). Injected so tests never reach a device. */
export type TuyaPresence = (target: TuyaPresenceTarget) => Promise<boolean>;

/** LAN addresses accepting Tuya local connections. Injected so tests never scan the network. */
export type TuyaPortScan = () => Promise<string[]>;

/** Everything the services need. */
export interface ServiceDeps extends ContextDeps {
  secretKey: Buffer;
  now: Clock;
  /** Emits `grantsChanged(deviceId)` whenever a device's granted users change. */
  grantEvents: GrantEventSource;
  /** Emits when sessions end (logout, role/PIN change, user deletion, expiry seen by a session watch). */
  sessionEvents: SessionEventSource;
  /** Emits `sourceChanged(deviceId)` when a camera switches where its video comes from. */
  cameraEvents: CameraEventSource;
  /** Camera streaming (go2rtc and its stream registry). */
  cameras: CameraServices;
  tuyaCloud: TuyaCloudFactory;
  kasaProbe: KasaProbe;
  swannProbe: SwannProbe;
  onvifProbe: OnvifProbe;
  rtspDescribe: RtspDescribe;
  tuyaPresence: TuyaPresence;
  tuyaPortScan: TuyaPortScan;
  /** TV pairings waiting for a code or an accept on the TV (2 minutes each). */
  tvPairings: PendingPairings;
  /** Running routines; saving or deleting a routine stops its current run. */
  routines: RoutineService;
  /** The deploy helper on localhost (admin deploy page). */
  deployer: DeployerClient;
  /** Server-side log; never given secrets. */
  log: Pick<Console, "info" | "warn" | "error">;
}
