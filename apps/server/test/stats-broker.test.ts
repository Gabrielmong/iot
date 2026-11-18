import { PubSub } from "graphql-subscriptions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentHub } from "../src/agent/hub.js";
import { StatsBroker } from "../src/agent/stats-broker.js";

let hub: AgentHub;
let sent: unknown[];
let broker: StatsBroker;

function connect() {
  hub.attach("pc", { send: (d) => sent.push(JSON.parse(d)), close: () => {} });
}

beforeEach(() => {
  vi.useFakeTimers();
  hub = new AgentHub();
  sent = [];
  broker = new StatsBroker(hub, new PubSub());
  connect();
});
afterEach(() => vi.useRealTimers());

const START = { v: 1, t: "stats.start", intervalMs: 2000 };
const STOP = { v: 1, t: "stats.stop" };

describe("StatsBroker", () => {
  it("asks a replacing connection for stats too (the agent's sampler stopped with its old one)", () => {
    broker.watch("pc");
    connect();
    expect(sent).toEqual([START, START]);
  });

  it("starts stats for the first watcher only", () => {
    broker.watch("pc");
    broker.watch("pc");
    expect(sent).toEqual([START]);
  });

  it("stops 10 s after the last watcher leaves", () => {
    const a = broker.watch("pc");
    const b = broker.watch("pc");
    a();
    b();
    vi.advanceTimersByTime(9_999);
    expect(sent).toEqual([START]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([START, STOP]);
  });

  it("a watcher returning within 10 s keeps the stats running", () => {
    broker.watch("pc")();
    vi.advanceTimersByTime(9_000);
    broker.watch("pc");
    vi.advanceTimersByTime(60_000);
    expect(sent).toEqual([START]);
  });

  it("releasing twice counts once", () => {
    const a = broker.watch("pc");
    broker.watch("pc");
    a();
    a();
    vi.advanceTimersByTime(20_000);
    expect(sent).toEqual([START]);
  });

  it("an agent reconnecting while watched is asked again", () => {
    broker.watch("pc");
    hub.detach("pc", { send: () => {}, close: () => {} }); // not its connection: ignored
    hub.closeAll();
    connect();
    expect(sent).toEqual([START, START]);
  });
});
