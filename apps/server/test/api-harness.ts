import { createClient, type Client } from "graphql-ws";
import { vi } from "vitest";
import WebSocket from "ws";
import { hashPin } from "../src/auth/pin.js";
import { createSession } from "../src/auth/sessions.js";
import { FakeDriver } from "../src/devices/drivers/fake.js";
import { FakeTvDriver } from "../src/devices/drivers/fake-tv.js";
import { DeviceManager } from "../src/devices/manager.js";
import type { Prisma, PrismaClient, Role } from "../src/generated/prisma/client.js";
import { createPubSub } from "../src/graphql/pubsub.js";
import type { CameraServices } from "../src/cameras/camera-services.js";
import { CameraUnavailableError } from "../src/cameras/streams/errors.js";
import { createCameraEvents } from "../src/services/camera-events.js";
import { createGrantEvents } from "../src/services/grant-events.js";
import { createSessionEvents } from "../src/services/session-events.js";
import { RoutineService } from "../src/routines/run-service.js";
import { startServer, type RunningServer } from "../src/server.js";
import { PendingPairings } from "../src/devices/pending-pairings.js";
import type { KasaProbe, OnvifProbe, RtspDescribe, ServiceDeps, SwannProbe, TuyaCloudFactory, TuyaPortScan, TuyaPresence } from "../src/services/deps.js";
import { unavailableDeployer } from "../src/deployer/client.js";
import type { DeployerClient } from "../src/deployer/types.js";
import { resetDb } from "./helpers.js";

export const KEY = Buffer.alloc(32, 9);
/** Camera calls of the default fake cloud: none reach a camera in tests. */
export const noCameraCloud = {
  readCameraValues: async (): Promise<Record<string, unknown>> => Promise.reject(new Error("no tuya cloud in tests")),
  issueCameraProperties: async (): Promise<void> => Promise.reject(new Error("no tuya cloud in tests")),
};
export const silentLog: Pick<Console, "info" | "warn" | "error"> = { info: () => {}, warn: () => {}, error: () => {} };

export interface HarnessOptions {
  sessionCheckMs?: number;
  tuyaCloud?: TuyaCloudFactory;
  kasaProbe?: KasaProbe;
  swannProbe?: SwannProbe;
  onvifProbe?: OnvifProbe;
  rtspDescribe?: RtspDescribe;
  /** Default: no device answers. */
  tuyaPresence?: TuyaPresence;
  /** Default: no Tuya hosts on the LAN. */
  tuyaPortScan?: TuyaPortScan;
  /** Default: the deploy helper is unavailable. */
  deployer?: DeployerClient;
  webDist?: string;
  androidApkDir?: string;
  /** Camera streaming fakes; by default every camera is unavailable. */
  cameras?: CameraServices;
  mseAuthTimeoutMs?: number;
  viewerSweepMs?: number;
  log?: Pick<Console, "info" | "warn" | "error">;
}

/** A running API on an ephemeral port, with FakeDrivers and a controllable clock. */
export class ApiHarness {
  readonly drivers = { TUYA: new FakeDriver("TUYA"), KASA: new FakeDriver("KASA"), WOL: new FakeDriver("WOL"), ANDROID_TV: new FakeTvDriver("ANDROID_TV") };
  readonly pubsub = createPubSub();
  readonly grantEvents = createGrantEvents();
  readonly sessionEvents = createSessionEvents();
  readonly cameraEvents = createCameraEvents();
  readonly subscribeSpy = vi.spyOn(this.pubsub, "subscribe");
  /** The clock every service and session check reads; tests move it with `advance`. */
  time = Date.now();
  /** The harness log (tests may replace its methods); `opts.log` overrides it. */
  readonly log: Pick<Console, "info" | "warn" | "error"> = { ...silentLog };
  routines!: RoutineService;
  /** Routine waits in progress; tests release them by hand. */
  private readonly waits: (() => void)[] = [];
  manager!: DeviceManager;
  server!: RunningServer;
  private readonly clients: Client[] = [];

  private constructor(readonly db: PrismaClient) {}

  static async start(opts: HarnessOptions = {}): Promise<ApiHarness> {
    const h = new ApiHarness(await resetDb());
    const log = opts.log ?? h.log;
    h.manager = new DeviceManager(h.db, Object.values(h.drivers), h.pubsub, KEY, { log, now: () => new Date(h.time) });
    await h.manager.start();
    h.routines = new RoutineService(h.db, h.manager, h.pubsub, {
      now: () => new Date(h.time),
      log,
      delay: (_ms, signal) =>
        new Promise((resolve, reject) => {
          const release = () => resolve();
          h.waits.push(release);
          signal.addEventListener("abort", () => {
            h.waits.splice(h.waits.indexOf(release), 1);
            reject(new Error("aborted"));
          });
        }),
    });
    const deps: ServiceDeps = {
      prisma: h.db,
      manager: h.manager,
      pubsub: h.pubsub,
      secretKey: KEY,
      now: () => new Date(h.time),
      grantEvents: h.grantEvents,
      sessionEvents: h.sessionEvents,
      cameraEvents: h.cameraEvents,
      cameras: opts.cameras ?? unavailableCameras,
      tuyaCloud: opts.tuyaCloud ?? (() => ({ listDevices: async () => [], ...noCameraCloud })),
      kasaProbe: opts.kasaProbe ?? (async () => Promise.reject(new Error("no kasa probe in tests"))),
      swannProbe: opts.swannProbe ?? (async () => Promise.reject(new Error("no swann probe in tests"))),
      onvifProbe: opts.onvifProbe ?? (async () => Promise.reject(new Error("no onvif probe in tests"))),
      rtspDescribe: opts.rtspDescribe ?? (async () => Promise.reject(new Error("no rtsp describe in tests"))),
      tuyaPresence: opts.tuyaPresence ?? (async () => false),
      tuyaPortScan: opts.tuyaPortScan ?? (async () => []),
      tvPairings: new PendingPairings(() => new Date(h.time)),
      routines: h.routines,
      deployer: opts.deployer ?? unavailableDeployer,
      log,
    };
    h.server = await startServer(deps, { port: 0, host: "127.0.0.1", log, sessionCheckMs: opts.sessionCheckMs, webDist: opts.webDist, androidApkDir: opts.androidApkDir, mseAuthTimeoutMs: opts.mseAuthTimeoutMs, viewerSweepMs: opts.viewerSweepMs });
    return h;
  }

  get url(): string {
    return `http://127.0.0.1:${this.server.port}/graphql`;
  }

  advance(ms: number): void {
    this.time += ms;
  }

  pendingWaits(): number {
    return this.waits.length;
  }

  /** Ends every routine wait in progress. */
  releaseWaits(): void {
    for (const release of this.waits.splice(0)) release();
  }

  async stop(): Promise<void> {
    this.routines.stopAll();
    await this.routines.idle(); // a run's last update must not race the next test's TRUNCATE
    await Promise.all(this.clients.map((c) => c.dispose()));
    await this.server.close();
    await this.manager.stop();
  }

  /** A user with a session; the token is created at the harness clock. */
  async user(name: string, role: Role = "USER", opts: { shared?: boolean; pin?: string } = {}): Promise<{ id: string; token: string }> {
    const user = await this.db.user.create({ data: { name, role, avatarColor: "#123456", pinHash: await hashPin(opts.pin ?? "1234") } });
    const token = await createSession(this.db, user.id, opts.shared ?? false, new Date(this.time));
    return { id: user.id, token };
  }

  /** An adopted device the drivers are synced with. */
  async device(over: Partial<Prisma.DeviceUncheckedCreateInput> = {}): Promise<string> {
    const n = (await this.db.device.count()) + 1;
    const d = await this.db.device.create({
      data: { brand: "KASA", kind: "PLUG", externalId: `ext-${n}`, name: `Device ${n}`, ip: `10.0.0.${n}`, adopted: true, config: {}, ...over },
    });
    await this.manager.refresh();
    return d.id;
  }

  async grant(userId: string, ...deviceIds: string[]): Promise<void> {
    await this.db.deviceGrant.createMany({ data: deviceIds.map((deviceId) => ({ userId, deviceId })) });
  }

  /** POSTs an operation over HTTP; returns the parsed GraphQL response. */
  async gql<T = Record<string, any>>(token: string | null, query: string, variables?: Record<string, unknown>): Promise<GqlResult<T>> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ query, variables }),
    });
    return (await res.json()) as GqlResult<T>;
  }

  /** Runs an operation that must succeed and returns its data. */
  async ok<T = Record<string, any>>(token: string | null, query: string, variables?: Record<string, unknown>): Promise<T> {
    const r = await this.gql<T>(token, query, variables);
    if (r.errors) throw new Error(`unexpected errors: ${JSON.stringify(r.errors)}`);
    return r.data as T;
  }

  /** A graphql-ws client that records how its socket closed. */
  wsClient(token: string | null): WsClient {
    const closes: number[] = [];
    const client = createClient({
      url: this.url.replace("http", "ws"),
      webSocketImpl: WebSocket,
      connectionParams: token ? { authToken: token } : {},
      retryAttempts: 0,
      lazy: false,
      on: { closed: (e) => closes.push((e as { code: number }).code) },
      onNonLazyError: () => {},
    });
    this.clients.push(client);
    return { client, closes };
  }

  /** Subscribes and resolves once the server has registered the PubSub listener. */
  async subscribe(ws: WsClient, query: string): Promise<Subscription> {
    const before = this.subscribeSpy.mock.calls.length;
    const sub = new Subscription(ws.client, query);
    await vi.waitFor(() => {
      if (sub.error) throw new Error(`subscription failed: ${JSON.stringify(sub.error)}`);
      if (this.subscribeSpy.mock.calls.length <= before) throw new Error("not subscribed yet");
    });
    return sub;
  }
}

const unavailable = async (): Promise<never> => Promise.reject(new CameraUnavailableError("no cameras in tests"));
const unavailableCameras: CameraServices = {
  streams: { ensure: unavailable, release: async () => {}, deviceIds: () => [], streamNamesOf: () => [] },
  restartGo2rtc: () => {},
  go2rtc: { frameJpeg: unavailable, webrtcAnswer: unavailable, mseUrl: () => "ws://127.0.0.1:9/none", authHeaders: () => ({ authorization: "" }), streamInfo: async () => null },
};

export type GqlResult<T> = { data?: T | null; errors?: { message: string; path?: string[]; extensions?: Record<string, unknown> }[] };
export type WsClient = { client: Client; closes: number[] };

/** Collects the events of one subscription. */
export class Subscription {
  readonly events: any[] = [];
  error: unknown;
  done = false;
  private readonly unsubscribe: () => void;

  constructor(client: Client, query: string) {
    this.unsubscribe = client.subscribe(
      { query },
      {
        next: (v) => void this.events.push(v),
        error: (e) => void (this.error = e),
        complete: () => void (this.done = true),
      },
    );
  }

  /** Waits until an event matches. */
  async waitFor(match: (event: any) => boolean): Promise<any> {
    let found: any;
    await vi.waitFor(() => {
      found = this.events.find(match);
      if (!found) throw new Error(`no matching event yet: ${JSON.stringify(this.events)}`);
    });
    return found;
  }

  close(): void {
    this.unsubscribe();
  }
}

export function codes(r: GqlResult<unknown>): unknown[] {
  return (r.errors ?? []).map((e) => e.extensions?.code);
}
