import type { Go2rtcSupervisor } from "./supervisor.js";

/** Whether go2rtc is up: true after `ready`, false after `down` (and while disabled, it never becomes ready). */
export interface Go2rtcReadiness {
  readonly ready: boolean;
}

export function trackReadiness(supervisor: Pick<Go2rtcSupervisor, "on">): Go2rtcReadiness {
  const state = { ready: false };
  supervisor.on("ready", () => (state.ready = true));
  supervisor.on("down", () => (state.ready = false));
  return state;
}
