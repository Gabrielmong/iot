import { createServer, type Server } from "node:http";
import type { StatusView } from "../../src/deployer/types.js";

export const FAKE_TOKEN = "fake-token";

/** An in-process helper implementing the Task 9 HTTP contract with canned data. */
export class FakeDeployer {
  status: StatusView = { autoDeploy: { on: true }, helperUpdateAvailable: false, events: [] };
  logs = new Map<string, string>();
  /** Commands received, as posted. */
  commands: unknown[] = [];
  /** Set to make the next commands fail with this status and message. */
  fail?: { status: number; error: string };
  /** Authorization headers seen. */
  auth: (string | undefined)[] = [];
  private server!: Server;
  url = "";

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      this.auth.push(req.headers.authorization);
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.headers.authorization !== `Bearer ${FAKE_TOKEN}`) return send(401, { error: "Unauthorized" });
      const path = new URL(req.url ?? "/", "http://x").pathname;
      if (req.method === "GET" && path === "/status") return send(200, this.status);
      const m = /^\/events\/([^/]+)\/log$/.exec(path);
      if (req.method === "GET" && m) {
        const log = this.logs.get(decodeURIComponent(m[1]!));
        return log === undefined ? send(404, { error: "Not found" }) : send(200, { log });
      }
      if (req.method === "POST" && path === "/commands") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          this.commands.push(JSON.parse(body));
          if (this.fail) return send(this.fail.status, { error: this.fail.error });
          send(202, { eventId: `evt-${this.commands.length}` });
        });
        return;
      }
      send(404, { error: "Not found" });
    });
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as { port: number }).port}`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
