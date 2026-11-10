import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { scanTargets, scanTuyaHosts } from "../src/devices/tuya-port-scan.js";

describe("scanTargets", () => {
  it("covers the /24 of the configured LAN address, minus itself", () => {
    const targets = scanTargets("192.168.0.150");
    expect(targets).toHaveLength(253);
    expect(targets).toContain("192.168.0.1");
    expect(targets).toContain("192.168.0.254");
    expect(targets).not.toContain("192.168.0.150");
  });

  it("falls back to private IPv4 interfaces, ignoring loopback, IPv6 and public ones", () => {
    const iface = (address: string, family: "IPv4" | "IPv6" = "IPv4", internal = false) => ({ address, family, internal, netmask: "", mac: "", cidr: null });
    const targets = scanTargets(undefined, { eth: [iface("10.1.2.3"), iface("fe80::1", "IPv6")], lo: [iface("127.0.0.1", "IPv4", true)], wan: [iface("8.8.8.8")] });
    expect(targets).toHaveLength(253);
    expect(targets.every((ip) => ip.startsWith("10.1.2."))).toBe(true);
  });
});

describe("scanTuyaHosts", () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  it("reports only the addresses where the port accepts a connection", async () => {
    server = createServer((s) => s.destroy());
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    expect(await scanTuyaHosts(undefined, { port, timeoutMs: 500, targets: ["127.0.0.1", "127.0.0.2"] })).toEqual(["127.0.0.1"]);
  });
});
