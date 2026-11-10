import { describe, expect, it, vi } from "vitest";
import { PAIRING_TTL_MS, PendingPairings } from "../src/devices/pending-pairings.js";
import type { PairingSession } from "../src/devices/types.js";

const session = (): PairingSession & { cancel: ReturnType<typeof vi.fn> } => ({ mode: "CODE", finish: async () => "secret", cancel: vi.fn() });

describe("PendingPairings", () => {
  it("keeps a session until it expires after 2 minutes, then cancels it", () => {
    let now = 0;
    const p = new PendingPairings(() => new Date(now));
    const s = session();
    p.set("tv1", s);
    now = PAIRING_TTL_MS - 1;
    expect(p.get("tv1")).toBe(s);
    now = PAIRING_TTL_MS + 1;
    expect(p.get("tv1")).toBeUndefined();
    expect(s.cancel).toHaveBeenCalledOnce();
    expect(PAIRING_TTL_MS).toBe(120_000);
  });

  it("a new session for the same device cancels the old one", () => {
    const p = new PendingPairings(() => new Date(0));
    const first = session();
    const second = session();
    p.set("tv1", first);
    p.set("tv1", second);
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(p.get("tv1")).toBe(second);
  });

  it("closes an abandoned session after 2 minutes even if nothing asks for it again", () => {
    vi.useFakeTimers();
    try {
      const p = new PendingPairings(() => new Date(0));
      const s = session();
      p.set("tv1", s);
      vi.advanceTimersByTime(PAIRING_TTL_MS - 1);
      expect(s.cancel).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(s.cancel).toHaveBeenCalledOnce();
      p.take("tv1");
      const kept = session();
      p.set("tv2", kept);
      p.take("tv2");
      vi.advanceTimersByTime(PAIRING_TTL_MS + 1);
      expect(kept.cancel).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a cancel while the session is still opening closes it once it opens", async () => {
    const p = new PendingPairings(() => new Date(0));
    const s = session();
    let open!: (s: PairingSession) => void;
    const started = p.start("tv1", () => new Promise((r) => (open = r)));
    expect(p.cancel("tv1")).toBe(true);
    open(s);
    await started;
    expect(s.cancel).toHaveBeenCalledOnce();
    expect(p.get("tv1")).toBeUndefined();
  });

  it("cancelAll() closes every session (shutdown)", () => {
    const p = new PendingPairings(() => new Date(0));
    const a = session();
    const b = session();
    p.set("a", a);
    p.set("b", b);
    p.cancelAll();
    expect(a.cancel).toHaveBeenCalledOnce();
    expect(b.cancel).toHaveBeenCalledOnce();
  });

  it("take() removes without cancelling; cancel() cancels", () => {
    const p = new PendingPairings(() => new Date(0));
    const a = session();
    const b = session();
    p.set("a", a);
    p.set("b", b);
    p.take("a");
    expect(a.cancel).not.toHaveBeenCalled();
    expect(p.get("a")).toBeUndefined();
    expect(p.cancel("b")).toBe(true);
    expect(b.cancel).toHaveBeenCalledOnce();
    expect(p.cancel("b")).toBe(false);
  });
});
