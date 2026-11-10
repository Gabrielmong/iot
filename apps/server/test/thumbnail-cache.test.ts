import { describe, expect, it, vi } from "vitest";
import { ThumbnailCache } from "../src/cameras/thumbnails/cache.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function deferred() {
  let resolve!: (b: Buffer) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<Buffer>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe("ThumbnailCache", () => {
  it("shares one running grab between concurrent requests for a camera", async () => {
    let now = 0;
    const cache = new ThumbnailCache(() => now);
    const pending = deferred();
    const grab = vi.fn(() => pending.promise);

    const all = Promise.all([cache.get("a", grab), cache.get("a", grab), cache.get("a", grab)]);
    pending.resolve(JPEG);

    expect((await all).map((f) => f.jpeg)).toEqual([JPEG, JPEG, JPEG]);
    expect(grab).toHaveBeenCalledTimes(1);
  });

  it("keeps a frame for 10 s, then grabs again", async () => {
    let now = 1_000;
    const cache = new ThumbnailCache(() => now);
    const grab = vi.fn(async () => JPEG);

    const first = await cache.get("a", grab);
    now += 9_999;
    expect(await cache.get("a", grab)).toBe(first);
    expect(cache.ageSeconds(first)).toBe(9);
    now += 1;
    await cache.get("a", grab);
    expect(grab).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed grab", async () => {
    const cache = new ThumbnailCache(() => 0);
    const grab = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(JPEG);
    await expect(cache.get("a", grab)).rejects.toThrow("down");
    await expect(cache.get("a", grab)).resolves.toMatchObject({ jpeg: JPEG });
  });

  it("drops a camera's frame on evict, including one still being grabbed", async () => {
    const cache = new ThumbnailCache(() => 0);
    const pending = deferred();
    const inFlight = cache.get("a", () => pending.promise);
    cache.evict("a");
    pending.resolve(JPEG);
    await inFlight;

    const grab = vi.fn(async () => JPEG);
    await cache.get("a", grab);
    expect(grab).toHaveBeenCalledTimes(1);
  });
});
