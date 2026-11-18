import type { AgentHub } from "./hub.js";

/** Tells the device manager when a PC's agent connects or disconnects; returns the unlink. */
export function linkAgentPresence(agents: AgentHub, manager: { agentPresence(deviceId: string, connected: boolean): void }): () => void {
  const connected = (id: string) => manager.agentPresence(id, true);
  const disconnected = (id: string) => manager.agentPresence(id, false);
  agents.on("connected", connected);
  agents.on("disconnected", disconnected);
  return () => {
    agents.off("connected", connected);
    agents.off("disconnected", disconnected);
  };
}
