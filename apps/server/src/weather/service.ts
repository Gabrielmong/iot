import type { PubSubEngine } from "graphql-subscriptions";
import type { PrismaClient } from "../generated/prisma/client.js";
import { publishWeatherUpdated } from "../graphql/pubsub.js";
import { xweatherCredentials } from "./credentials.js";
import { DEFAULT_OPTIONS, locationOf, readWeatherOptions, type WeatherOptions } from "./settings.js";
import { loadSnapshot, saveSnapshot } from "./snapshot-store.js";
import { WeatherFetchError, type LatLng, type WeatherFetcher, type WeatherReading, type XweatherCredentials } from "./types.js";

export type WeatherStatus = "OK" | "NO_LOCATION" | "NOT_CONFIGURED" | "DISABLED" | "ERROR";
/** What the app shows: the status, the last reading for the current pin, and whether it's too old to trust. */
export type WeatherState = { status: WeatherStatus; reading: WeatherReading | null; stale: boolean; lastError: string | null; location: LatLng | null };
/** What routines check: the reading only when fresh, enabled and for the current pin; the pin for sun checks. */
export type WeatherFacts = { reading: WeatherReading | null; location: LatLng | null; now: Date };

type Timer = { cancel(): void };
export type WeatherServiceDeps = {
  prisma: PrismaClient;
  secretKey: Buffer;
  fetch: WeatherFetcher;
  pubsub: PubSubEngine;
  now: () => Date;
  log: Pick<Console, "warn" | "error">;
  setTimer?: (fn: () => void, ms: number) => Timer;
};

const MINUTE_MS = 60_000;
const realTimer = (fn: () => void, ms: number): Timer => {
  const t = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(t) };
};
const samePlace = (r: WeatherReading, at: LatLng | null) => at !== null && r.lat === at.lat && r.lng === at.lng;

/** Polls Xweather for the household pin, keeps (and persists) the latest reading, and publishes every change. */
export class WeatherService {
  private options: WeatherOptions = { ...DEFAULT_OPTIONS };
  private creds: XweatherCredentials | undefined;
  private reading: WeatherReading | null = null;
  private lastError: string | null = null;
  private timer: Timer | null = null;
  private running = false;
  private inFlight: Promise<void> | null = null;
  private readonly setTimer: (fn: () => void, ms: number) => Timer;

  constructor(private readonly deps: WeatherServiceDeps) {
    this.setTimer = deps.setTimer ?? realTimer;
  }

  /** Loads the options and the saved reading, refreshes in the background if it's due, and starts the timer. */
  async start(): Promise<void> {
    this.running = true;
    await this.load();
    const saved = await loadSnapshot(this.deps.prisma);
    if (saved && samePlace(saved, this.location())) this.reading = saved;
    const due = !this.reading || this.age() >= this.options.refreshMinutes * MINUTE_MS;
    if (due) void this.refreshNow();
    this.arm();
  }

  stop(): void {
    this.running = false;
    this.timer?.cancel();
    this.timer = null;
  }

  /** After the options or credentials change: forget a reading for another pin, fetch now and restart the timer. */
  async reconfigure(): Promise<void> {
    await this.load();
    if (this.reading && !samePlace(this.reading, this.location())) this.reading = null;
    this.lastError = null;
    await publishWeatherUpdated(this.deps.pubsub);
    await this.refreshNow();
    this.arm();
  }

  /** Fetches once if enabled, configured and pinned; a failure keeps the last reading and records the error. */
  refreshNow(): Promise<void> {
    this.inFlight ??= this.fetchOnce().finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  state(): WeatherState {
    const location = this.location();
    const reading = this.reading && samePlace(this.reading, location) ? this.reading : null;
    const stale = reading !== null && this.age() > this.options.staleMinutes * MINUTE_MS;
    return { status: this.status(), reading, stale, lastError: this.lastError, location };
  }

  facts(): WeatherFacts {
    const s = this.state();
    const usable = this.options.enabled && !s.stale ? s.reading : null;
    return { reading: usable, location: s.location, now: this.deps.now() };
  }

  private async fetchOnce(): Promise<void> {
    const at = this.location();
    if (!this.options.enabled || !this.creds || !at) return;
    try {
      const data = await this.deps.fetch(this.creds, at);
      this.reading = { ...data, fetchedAt: this.deps.now(), lat: at.lat, lng: at.lng };
      this.lastError = null;
      await saveSnapshot(this.deps.prisma, this.reading);
    } catch (error) {
      this.lastError = error instanceof WeatherFetchError ? error.message : "Couldn't fetch the weather";
      this.deps.log.warn(`weather fetch failed: ${this.lastError}`);
    }
    await publishWeatherUpdated(this.deps.pubsub);
  }

  private async load(): Promise<void> {
    this.options = await readWeatherOptions(this.deps.prisma);
    this.creds = await xweatherCredentials(this.deps);
  }

  private status(): WeatherStatus {
    if (!this.options.enabled) return "DISABLED";
    if (!this.creds) return "NOT_CONFIGURED";
    if (!this.location()) return "NO_LOCATION";
    return this.lastError ? "ERROR" : "OK";
  }

  private location(): LatLng | null {
    return locationOf(this.options);
  }

  private age(): number {
    return this.reading ? this.deps.now().getTime() - this.reading.fetchedAt.getTime() : Infinity;
  }

  private arm(): void {
    this.timer?.cancel();
    this.timer = null;
    if (!this.running) return;
    this.timer = this.setTimer(() => {
      void this.refreshNow().finally(() => this.arm());
    }, this.options.refreshMinutes * MINUTE_MS);
  }
}
