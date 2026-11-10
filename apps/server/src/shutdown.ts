export const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Runs `stop` once on SIGINT or SIGTERM, then exits: 0 when it finished, 1 when it failed or took
 * longer than `timeoutMs`.
 */
export function onShutdownSignal(stop: () => Promise<void>, log: Pick<Console, "info" | "error">, timeoutMs = SHUTDOWN_TIMEOUT_MS): void {
  let stopping = false;
  const handler = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    log.info(`${signal}: shutting down`);
    const timer = setTimeout(() => {
      log.error(`shutdown did not finish within ${timeoutMs} ms; exiting`);
      process.exit(1);
    }, timeoutMs);
    timer.unref();
    stop().then(
      () => {
        clearTimeout(timer);
        process.exit(0);
      },
      (err: unknown) => {
        clearTimeout(timer);
        log.error("shutdown failed", err);
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
