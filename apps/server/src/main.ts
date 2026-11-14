import "dotenv/config";
import { probeOnvif, probeSwann, rtspDescribe, TuyaCloud } from "@home/protocols";
import { fileURLToPath } from "node:url";
import { ensureBootstrapAdmin } from "./bootstrap-admin.js";
import { Go2rtcApi } from "./cameras/go2rtc/api.js";
import { generateCredentials } from "./cameras/go2rtc/credentials.js";
import { trackReadiness } from "./cameras/go2rtc/ready-state.js";
import { reregisterOnReady } from "./cameras/go2rtc/reregister.js";
import { Go2rtcSupervisor } from "./cameras/go2rtc/supervisor.js";
import { createCameraStreams } from "./cameras/create-streams.js";
import { httpDeployerClient } from "./deployer/client.js";
import { loadConfig } from "./config.js";
import { createPrisma } from "./db.js";
import { createDrivers } from "./devices/drivers/index.js";
import { DeviceManager } from "./devices/manager.js";
import { tuyaPresent } from "./devices/tuya-presence.js";
import { scanTuyaHosts } from "./devices/tuya-port-scan.js";
import { createCameraEvents } from "./services/camera-events.js";
import { createGrantEvents } from "./services/grant-events.js";
import { createSessionEvents } from "./services/session-events.js";
import { RoutineService } from "./routines/run-service.js";
import { RoutineScheduler } from "./routines/scheduler.js";
import { tuyaCloudCredentials } from "./services/integrations.js";
import { syncTuyaKeys } from "./services/tuya-sync.js";
import { TuyaSyncSchedule } from "./services/tuya-sync-schedule.js";
import { createPubSub } from "./graphql/pubsub.js";
import { startServer } from "./server.js";
import type { ServiceDeps } from "./services/deps.js";
import { PendingPairings } from "./devices/pending-pairings.js";
import { probeKasa } from "./services/kasa-probe.js";
import { onShutdownSignal } from "./shutdown.js";
import { startAnnouncement } from "./discovery/announce.js";
import { announcedName } from "./discovery/announced-name.js";

/** The built web app (apps/web/dist), served in production. */
const WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

async function main(): Promise<void> {
  const log = console;
  const config = loadConfig();
  const prisma = createPrisma(config.databaseUrl);
  await ensureBootstrapAdmin(prisma, config.bootstrapAdminPin, log);

  const pubsub = createPubSub();
  const drivers = createDrivers(prisma, config.secretKey, config.lanAddress);
  const manager = new DeviceManager(prisma, drivers, pubsub, config.secretKey, { log });
  await manager.start();

  // Camera streaming helper; a missing binary only disables cameras. Its API needs fresh credentials each run.
  const go2rtcCredentials = generateCredentials();
  const go2rtcApi = new Go2rtcApi(go2rtcCredentials);
  const go2rtc = new Go2rtcSupervisor({
    command: config.go2rtcPath,
    ffmpegPath: config.ffmpegPath,
    pidFile: config.go2rtcPidFile,
    credentials: go2rtcCredentials,
    api: go2rtcApi,
    log,
  });
  // Camera streams (local and Tuya cloud); listeners are attached before start so the first `ready` is seen.
  const go2rtcReadiness = trackReadiness(go2rtc);
  const { streams, cloud } = createCameraStreams({
    prisma,
    secretKey: config.secretKey,
    api: go2rtcApi,
    isReady: () => go2rtcReadiness.ready,
    log,
  });
  reregisterOnReady(go2rtc, go2rtcApi, streams, log);
  await go2rtc.start();

  const routines = new RoutineService(prisma, manager, pubsub, { now: () => new Date(), log });
  await routines.markInterrupted();

  const deps: ServiceDeps = {
    prisma,
    manager,
    pubsub,
    secretKey: config.secretKey,
    now: () => new Date(),
    grantEvents: createGrantEvents(),
    sessionEvents: createSessionEvents(),
    cameraEvents: createCameraEvents(),
    cameras: { streams, go2rtc: go2rtcApi, restartGo2rtc: () => go2rtc.restart() },
    tuyaCloud: (creds) => new TuyaCloud(creds),
    kasaProbe: probeKasa,
    swannProbe: (host, creds) => probeSwann(host, creds),
    onvifProbe: (host, creds) => probeOnvif(host, creds),
    rtspDescribe: (url, creds) => rtspDescribe(url, creds), // Digest only: allowBasic stays false
    tuyaPresence: (target) => tuyaPresent(target),
    tuyaPortScan: () => scanTuyaHosts(config.lanAddress),
    tvPairings: new PendingPairings(() => new Date()),
    routines,
    deployer: httpDeployerClient(config.deployerUrl, config.deployerTokenFile),
    log,
  };
  const production = process.env.NODE_ENV === "production";
  const server = await startServer(deps, { port: config.port, log, webDist: production ? WEB_DIST : undefined, androidApkDir: config.androidApkDir });
  log.info(`Home server listening on port ${server.port}${production ? " (serving the web app)" : ""}`);
  const announcement = startAnnouncement({ port: server.port, name: await announcedName(prisma, log), host: config.lanAddress, log });
  const scheduler = new RoutineScheduler({ prisma, run: (id) => routines.runScheduled(id), now: () => new Date(), log });
  scheduler.start();
  const tuyaSync = new TuyaSyncSchedule({
    sync: () => syncTuyaKeys(deps),
    configured: async () => (await tuyaCloudCredentials(deps)) !== undefined,
    log,
    intervalMs: config.tuyaSyncHours * 3600_000,
    firstDelayMs: 2 * 60_000,
  });
  tuyaSync.start();

  // Stop taking requests first, then go2rtc, then the drivers, then release the database.
  // go2rtc stops restarting immediately, so closing the server can't race a respawn.
  onShutdownSignal(async () => {
    await announcement.stop();
    deps.tvPairings.cancelAll();
    go2rtc.prepareStop();
    scheduler.stop();
    tuyaSync.stop();
    await server.close();
    routines.stopAll();
    cloud.dispose();
    await go2rtc.stop();
    await manager.stop();
    await prisma.$disconnect();
  }, log);
}

main().catch((err: unknown) => {
  console.error("Home server failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
