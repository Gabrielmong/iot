import { describe, expect, it } from "vitest";
import { TRIAL_IDLE_MS, TrialSet } from "../src/devices/trial-set.js";

const at = (ms: number) => new Date(1_000_000 + ms);

describe("TrialSet", () => {
  it("expires a trial after 2 minutes without use", () => {
    const trials = new TrialSet();
    trials.touch("a", "KASA", at(0));
    expect(TRIAL_IDLE_MS).toBe(120_000);
    expect(trials.expired(at(119_999))).toEqual([]);
    expect(trials.expired(at(120_000))).toEqual(["a"]);
  });

  it("renews the expiry on every touch", () => {
    const trials = new TrialSet();
    trials.touch("a", "KASA", at(0));
    trials.touch("a", "KASA", at(100_000));
    expect(trials.expired(at(150_000))).toEqual([]);
    expect(trials.expired(at(220_000))).toEqual(["a"]);
  });

  it("lists trials per brand and forgets removed ones", () => {
    const trials = new TrialSet();
    trials.touch("a", "KASA", at(0));
    trials.touch("b", "TUYA", at(0));
    expect(trials.ids("KASA")).toEqual(["a"]);
    expect(trials.has("b")).toBe(true);
    trials.remove("b");
    expect(trials.has("b")).toBe(false);
    expect(trials.ids("TUYA")).toEqual([]);
  });
});
