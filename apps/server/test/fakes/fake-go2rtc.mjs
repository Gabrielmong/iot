// A tiny stand-in for go2rtc used by the supervisor tests. Never the real binary.
// Usage: node fake-go2rtc.mjs --port <port> [--foreign] -config <path>
// Like go2rtc with `local_auth: true`, it enforces Basic auth from the config on every API request,
// and `GET /api` reports `config_path` (--foreign reports another instance's path).
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const port = Number(argValue("--port"));
const configPath = argValue("-config");
if (!configPath || !existsSync(configPath)) process.exit(2);
const config = readFileSync(configPath, "utf8");
const configValue = (key) => {
  const m = new RegExp(`^ +${key}: (".*")$`, "m").exec(config);
  return m ? JSON.parse(m[1]) : undefined;
};
const username = configValue("username");
const password = configValue("password");
const expectedAuth = username ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` : undefined;
const reportedConfigPath = args.includes("--foreign") ? resolve(configPath, "..", "..", "someone-else", "go2rtc.yaml") : resolve(configPath);

/** Requests seen by this process, for the tests to inspect via GET /__calls. */
const calls = [];
const streams = new Map();
/** Consumers per stream (format names), set by the tests via POST /__consumers?src=<name>&formats=a,b. */
const consumers = new Map();
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://fake");
  const q = Object.fromEntries(url.searchParams);
  const body = await readBody(req);
  const send = (status, type, payload) => {
    res.writeHead(status, { "content-type": type });
    res.end(payload);
  };

  if (url.pathname === "/__calls") return send(200, "application/json", JSON.stringify({ calls, config }));
  if (url.pathname === "/__consumers") {
    consumers.set(q.src, q.formats ? q.formats.split(",") : []);
    return send(200, "text/plain", "ok");
  }
  if (url.pathname === "/__exit") {
    send(200, "text/plain", "bye");
    return setImmediate(() => process.exit(3));
  }

  if (expectedAuth && req.headers.authorization !== expectedAuth) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="go2rtc"' });
    return res.end("Unauthorized");
  }

  calls.push({ method: req.method, path: url.pathname, query: q, body, contentType: req.headers["content-type"] });

  if (url.pathname === "/api" && req.method === "GET") return send(200, "application/json", JSON.stringify({ version: "fake", config_path: reportedConfigPath }));
  if (url.pathname === "/api/streams" && (req.method === "PUT" || req.method === "PATCH")) {
    streams.set(q.name, q.src);
    return send(200, "text/plain", "");
  }
  if (url.pathname === "/api/streams" && req.method === "GET" && q.src) {
    // Like go2rtc: the stream object, whose producers carry the source URL.
    if (!streams.has(q.src)) return send(404, "text/plain", "");
    const cons = (consumers.get(q.src) ?? []).map((format_name, i) => ({ id: i + 1, format_name, remote_addr: "10.0.0.9:5000" }));
    return send(200, "application/json", JSON.stringify({ producers: [{ url: streams.get(q.src) }], consumers: cons }));
  }
  if (url.pathname === "/api/streams" && req.method === "DELETE") {
    streams.delete(q.src);
    return send(200, "text/plain", "");
  }
  if (url.pathname === "/api/frame.jpeg" && req.method === "GET") {
    return streams.has(q.src) ? send(200, "image/jpeg", JPEG) : send(404, "text/plain", "stream not found");
  }
  if (url.pathname === "/api/webrtc" && req.method === "POST") {
    return streams.has(q.src) ? send(200, "application/sdp", `answer-for:${body}`) : send(404, "text/plain", "stream not found");
  }
  send(404, "text/plain", "not found");
});

server.listen(port, "127.0.0.1");

// Never outlive the test process, even if it crashes.
setInterval(() => {
  try {
    process.kill(process.ppid, 0);
  } catch {
    process.exit(0);
  }
}, 500).unref();
