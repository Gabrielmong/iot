import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { apkRouter, APK_PATH, identityRouter, IDENTITY_PATH } from "./android/routes.js";
import { createCameraEndpoints } from "./cameras/http/endpoints.js";
import { CAMERAS_PATH } from "./cameras/http/router.js";
import { httpContext, type ApiContext } from "./graphql/context.js";
import { formatApiError, type ErrorLog } from "./graphql/error-masking.js";
import { buildSchema } from "./graphql/schema.js";
import { attachSubscriptions } from "./graphql/ws/subscriptions-server.js";
import { createHttpApp, GRAPHQL_PATH, MAX_BODY_BYTES } from "./http.js";
import type { ServiceDeps } from "./services/deps.js";
import { pathRoute, routeUpgrades } from "./upgrades.js";

export interface ServerOptions {
  port: number;
  host?: string;
  log: ErrorLog;
  /** Serve the built web app from here (production). */
  webDist?: string;
  sessionCheckMs?: number;
  /** How long a camera MSE socket may take to send its auth message (tests shorten it). */
  mseAuthTimeoutMs?: number;
  /** How often camera viewers are re-checked (tests shorten it). */
  viewerSweepMs?: number;
  /** Folder with the published Android app (`home.apk`, `home.json`). */
  androidApkDir?: string;
}

export interface RunningServer {
  port: number;
  /** Closes the WebSockets, drains HTTP and stops Apollo. */
  close(): Promise<void>;
}

/** GraphQL over HTTP (Apollo) and WebSocket (graphql-ws), and the camera endpoints, on one port. */
export async function startServer(deps: ServiceDeps, opts: ServerOptions): Promise<RunningServer> {
  const schema = buildSchema();
  const httpServer = createServer();
  const subscriptions = attachSubscriptions(schema, deps, {
    log: opts.log,
    maxPayload: MAX_BODY_BYTES,
    sessionCheckMs: opts.sessionCheckMs,
  });
  const cameras = createCameraEndpoints(deps, {
    authTimeoutMs: opts.mseAuthTimeoutMs,
    sessionCheckMs: opts.sessionCheckMs,
    viewerSweepMs: opts.viewerSweepMs,
  });
  routeUpgrades(httpServer, [pathRoute(GRAPHQL_PATH, subscriptions.handleUpgrade), cameras.handleUpgrade]);

  const apollo = new ApolloServer<ApiContext>({
    schema,
    formatError: (formatted, error) => formatApiError(formatted, error, opts.log),
    includeStacktraceInErrorResponses: false,
    // main.ts owns SIGINT/SIGTERM: Apollo's handlers would process.kill() (a hard kill on Windows).
    stopOnTerminationSignals: false,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        serverWillStart: async () => ({
          drainServer: async () => {
            await Promise.all([subscriptions.dispose(), cameras.dispose()]);
          },
        }),
      },
    ],
  });
  await apollo.start();

  const graphql = expressMiddleware(apollo, { context: ({ req }) => httpContext(deps, req.headers) });
  httpServer.on("request", createHttpApp({ graphql, api: { [CAMERAS_PATH]: cameras.router, [IDENTITY_PATH]: identityRouter({ prisma: deps.prisma, apkDir: opts.androidApkDir }), [APK_PATH]: apkRouter(opts.androidApkDir) }, webDist: opts.webDist }));

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port, opts.host, () => resolve());
  });

  return {
    port: (httpServer.address() as AddressInfo).port,
    close: () => apollo.stop(),
  };
}
