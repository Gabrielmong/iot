import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { createServer, connect } from "node:net";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

const FAKE_SCRIPT = fileURLToPath(new URL("./fakes/fake-go2rtc.mjs", import.meta.url));

export interface FakeGo2rtc {
  /** Spawn command and leading args for the supervisor (it appends `-config <path>`). */
  command: string;
  args: string[];
  port: number;
  baseUrl: string;
}

/** A launch spec for the fake go2rtc script on a free local port. */
export async function fakeGo2rtc(extraArgs: string[] = []): Promise<FakeGo2rtc> {
  const port = await freePort();
  return {
    command: process.execPath,
    args: [FAKE_SCRIPT, "--port", String(port), ...extraArgs],
    port,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

/** Starts the fake directly, outside any supervisor (an "orphan" left by a previous run). */
export function spawnFakeDirectly(fake: FakeGo2rtc, configPath: string): ChildProcess {
  return spawn(fake.command, [...fake.args, "-config", configPath], { windowsHide: true, stdio: "ignore" });
}

export const testLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

/** node:http rather than fetch, so nothing here depends on (possibly faked) global timers. */
export function send(method: string, url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

export async function getJson<T>(url: string): Promise<T> {
  return JSON.parse((await send("GET", url)).body) as T;
}

/** Makes the fake exit as if go2rtc crashed. */
export async function crashFake(baseUrl: string): Promise<void> {
  await send("POST", `${baseUrl}/__exit`);
}

export function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
