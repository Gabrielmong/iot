import { afterEach, describe, expect, it, vi } from "vitest";
import { startAnnouncement, type BonjourLike } from "../src/discovery/announce.js";

function fake() {
  const calls: string[] = [];
  let errorHandler: ((err: Error) => void) | undefined;
  let upHandler: (() => void) | undefined;
  const bonjour: BonjourLike = {
    publish: vi.fn((_opts, onUp: () => void) => {
      calls.push("publish");
      upHandler = onUp;
    }),
    unpublishAll: vi.fn((cb?: () => void) => {
      calls.push("unpublishAll");
      cb?.();
    }),
    destroy: vi.fn(() => {
      calls.push("destroy");
    }),
    onError: vi.fn((handler: (err: Error) => void) => {
      errorHandler = handler;
    }),
  };
  return { bonjour, calls, emitError: (err: Error) => errorHandler?.(err), emitUp: () => upHandler?.() };
}
const log = () => ({ info: vi.fn(), warn: vi.fn() });

afterEach(() => {
  vi.useRealTimers();
});

describe("startAnnouncement", () => {
  it("publishes the service once, with the bind address as TXT addr", () => {
    const { bonjour } = fake();
    const create = vi.fn(() => bonjour);
    startAnnouncement({ port: 4000, name: "Casa", host: "192.168.0.100", log: log(), create });
    expect(create).toHaveBeenCalledWith("192.168.0.100");
    expect(bonjour.publish).toHaveBeenCalledTimes(1);
    expect(bonjour.publish).toHaveBeenCalledWith(
      { name: "Casa", type: "home-control", protocol: "tcp", port: 4000, txt: { addr: "192.168.0.100" } },
      expect.any(Function),
    );
  });

  it("publishes no TXT when there is no bind address", () => {
    const { bonjour } = fake();
    startAnnouncement({ port: 4000, name: "Casa", log: log(), create: () => bonjour });
    expect(bonjour.publish).toHaveBeenCalledWith({ name: "Casa", type: "home-control", protocol: "tcp", port: 4000 }, expect.any(Function));
  });

  it("only says it is announcing once the service is up", () => {
    const { bonjour, emitUp } = fake();
    const l = log();
    startAnnouncement({ port: 4000, name: "Casa", log: l, create: () => bonjour });
    expect(l.info.mock.calls.flat().join("\n")).not.toMatch(/^Announcing/m);
    emitUp();
    expect(l.info).toHaveBeenLastCalledWith('Announcing "Casa" over mDNS');
  });

  it("stop() unpublishes, then destroys", async () => {
    const { bonjour, calls } = fake();
    const ann = startAnnouncement({ port: 4000, name: "Casa", log: log(), create: () => bonjour });
    await ann.stop();
    expect(calls).toEqual(["publish", "unpublishAll", "destroy"]);
  });

  it("logs a warning and destroys quietly when the socket errors after publish", async () => {
    const { bonjour, emitError } = fake();
    bonjour.destroy = vi.fn(() => {
      throw new Error("not bound");
    });
    const l = log();
    const ann = startAnnouncement({ port: 4000, name: "Casa", host: "10.255.255.1", log: l, create: () => bonjour });
    await Promise.resolve();
    expect(() => emitError(new Error("bind EADDRNOTAVAIL 10.255.255.1"))).not.toThrow();
    expect(l.warn).toHaveBeenCalledWith("mDNS announcement unavailable: bind EADDRNOTAVAIL 10.255.255.1");
    expect(bonjour.destroy).toHaveBeenCalledTimes(1);
    expect(() => emitError(new Error("again"))).not.toThrow();
    expect(l.warn).toHaveBeenCalledTimes(1);
    await expect(ann.stop()).resolves.toBeUndefined();
  });

  it("logs a warning and returns a no-op stop when create throws", async () => {
    const l = log();
    const ann = startAnnouncement({ port: 4000, name: "Casa", log: l, create: () => { throw new Error("bind"); } });
    expect(l.warn).toHaveBeenCalled();
    await expect(ann.stop()).resolves.toBeUndefined();
  });

  it("logs a warning and returns a no-op stop when publish throws", async () => {
    const { bonjour } = fake();
    bonjour.publish = vi.fn(() => { throw new Error("nope"); });
    const l = log();
    const ann = startAnnouncement({ port: 4000, name: "Casa", log: l, create: () => bonjour });
    expect(l.warn).toHaveBeenCalled();
    await expect(ann.stop()).resolves.toBeUndefined();
  });

  it("stop() does not throw when destroy throws", async () => {
    const { bonjour } = fake();
    bonjour.destroy = vi.fn(() => {
      throw new Error("boom");
    });
    const ann = startAnnouncement({ port: 4000, name: "Casa", log: log(), create: () => bonjour });
    await expect(ann.stop()).resolves.toBeUndefined();
  });

  it("stop() does not throw when unpublishAll throws", async () => {
    const { bonjour } = fake();
    bonjour.unpublishAll = vi.fn(() => {
      throw new Error("boom");
    });
    const ann = startAnnouncement({ port: 4000, name: "Casa", log: log(), create: () => bonjour });
    await expect(ann.stop()).resolves.toBeUndefined();
    expect(bonjour.destroy).toHaveBeenCalled();
  });

  it("stop() gives up on unpublishAll after the timeout", async () => {
    vi.useFakeTimers();
    const { bonjour } = fake();
    bonjour.unpublishAll = vi.fn(); // never calls back
    const ann = startAnnouncement({ port: 4000, name: "Casa", log: log(), create: () => bonjour, stopTimeoutMs: 1000 });
    let done = false;
    const stopping = ann.stop().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await stopping;
    expect(done).toBe(true);
    expect(bonjour.destroy).toHaveBeenCalled();
  });
});
