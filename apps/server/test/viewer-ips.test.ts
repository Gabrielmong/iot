import { describe, expect, it } from "vitest";
import { viewerIps } from "../src/agent/viewer-pc.js";

const serverIps = () => ["127.0.0.1", "192.168.0.100"];

describe("viewerIps", () => {
  it("is the peer's IPv4 address, unwrapped from an IPv4-mapped IPv6 one", () => {
    expect(viewerIps("192.168.0.150", serverIps)).toEqual(["192.168.0.150"]);
    expect(viewerIps("::ffff:192.168.0.150", serverIps)).toEqual(["192.168.0.150"]);
  });

  it("is this server's own addresses for a loopback peer (a browser on the server itself)", () => {
    expect(viewerIps("127.0.0.1", serverIps)).toEqual(["127.0.0.1", "192.168.0.100"]);
    expect(viewerIps("::1", serverIps)).toEqual(["127.0.0.1", "192.168.0.100"]);
  });

  it("is nothing when the peer is unknown or not IPv4", () => {
    expect(viewerIps(undefined, serverIps)).toEqual([]);
    expect(viewerIps("fe80::1", serverIps)).toEqual([]);
  });
});
