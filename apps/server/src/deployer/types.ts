/** The helper's HTTP shapes (apps/deployer), defined here so the server never imports the helper. */
export type DeployEventKind = "DEPLOY" | "ROLLBACK" | "RESTART" | "PAUSE" | "RESUME";
export type DeployEventStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

export interface DeployEventView {
  id: string;
  kind: DeployEventKind;
  status: DeployEventStatus;
  sha?: string;
  message?: string;
  by: string;
  startedAt: string;
  finishedAt?: string;
  detail?: string;
  canRollback: boolean;
  rollbackBlockedReason?: string;
}

export interface StatusView {
  running?: { sha: string; message: string; deployedAt: string };
  autoDeploy: { on: boolean; reason?: string };
  lastCheck?: { at: string; error?: string };
  busy?: string;
  helperUpdateAvailable: boolean;
  events: DeployEventView[];
}

export type Command =
  | { type: "deployNow" | "restartApp" | "pause" | "resume"; by: string }
  | { type: "rollback"; sha: string; by: string };

export interface DeployerClient {
  /** undefined when the helper can't be reached or won't talk to us. */
  status(): Promise<StatusView | undefined>;
  /** null when the event has no log (or the helper is unavailable). */
  log(id: string): Promise<string | null>;
  /** Returns the new event id; throws coded errors. */
  command(c: Command): Promise<string>;
}
