import { vi } from "vitest";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { hashToken, SHARED_IDLE_MS } from "../src/auth/sessions.js";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const STATE = `subscription { deviceState { id } }`;
const CHANGED = `subscription { devicesChanged }`;
const expiresAt = async (token: string) => (await h.db.session.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } })).expiresAt.getTime();

describe("HTTP authentication", () => {
  it("requires a session for everything but loginUsers and login", async () => {
    h = await ApiHarness.start();
    for (const q of [`{ me { id } }`, `{ devices { id } }`, `{ rooms { id } }`, `mutation { logout }`, `{ users { id } }`]) {
      expect(codes(await h.gql(null, q))).toEqual(["UNAUTHENTICATED"]);
    }
    await h.user("Ann");
    expect((await h.ok(null, `{ loginUsers { name } }`)).loginUsers).toEqual([{ name: "Ann" }]);
  });

  it("logs in with a PIN, returns only public user fields, and logs out", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann", "USER", { pin: "4321" });
    const res = await h.gql(null, `mutation($u: ID!) { login(userId: $u, pin: "4321", shared: false) { token user { id name role avatarColor } } }`, { u: a.id });
    const { token, user } = res.data!.login;
    expect(user).toEqual({ id: a.id, name: "Ann", role: "USER", avatarColor: "#123456" });
    expect(JSON.stringify(res)).not.toMatch(/pinHash|failedPinCount|lockedUntil|scrypt/);

    expect((await h.ok(token, `{ me { name } }`)).me).toEqual({ name: "Ann" });
    await h.ok(token, `mutation { logout }`);
    expect(codes(await h.gql(token, `{ me { name } }`))).toEqual(["UNAUTHENTICATED"]);
  });

  it("returns INVALID_PIN for a wrong PIN", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann");
    const r = await h.gql(null, `mutation($u: ID!) { login(userId: $u, pin: "9999", shared: true) { token } }`, { u: a.id });
    expect(codes(r)).toEqual(["INVALID_PIN"]);
  });

  it("slides a shared session on HTTP operations", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann", "USER", { shared: true });
    const before = await expiresAt(a.token);
    h.advance(60_000);
    await h.ok(a.token, `{ me { id } }`);
    expect(await expiresAt(a.token)).toBe(before + 60_000);
  });
});

describe("WebSocket sessions", () => {
  it("closes a socket without a valid token with 4401", async () => {
    h = await ApiHarness.start();
    const none = h.wsClient(null);
    const bad = h.wsClient("not-a-token");
    await vi.waitFor(() => expect([none.closes, bad.closes]).toEqual([[4401], [4401]]));
  });

  it("does not slide the session when delivering events", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann", "USER", { shared: true });
    const d = await h.device();
    await h.grant(a.id, d);
    const before = await expiresAt(a.token);

    const sub = await h.subscribe(h.wsClient(a.token), STATE);
    h.advance(60_000);
    h.drivers.KASA.pushState(d, { online: true, on: true });
    await sub.waitFor((e) => e.data.deviceState.id === d);

    expect(await expiresAt(a.token)).toBe(before);
  });

  it("closes an idle shared screen's socket with 4401 on the periodic check", async () => {
    h = await ApiHarness.start({ sessionCheckMs: 50 });
    const a = await h.user("Ann", "USER", { shared: true });
    const ws = h.wsClient(a.token);
    await h.subscribe(ws, CHANGED);

    h.advance(SHARED_IDLE_MS + 1000);
    await vi.waitFor(() => expect(ws.closes).toEqual([4401]));
  });

  it("closes the socket with 4401 instead of delivering an event after the session expired", async () => {
    h = await ApiHarness.start({ sessionCheckMs: 60_000 });
    const a = await h.user("Ann", "USER", { shared: true });
    const d = await h.device();
    await h.grant(a.id, d);
    const ws = h.wsClient(a.token);
    const sub = await h.subscribe(ws, STATE);

    h.advance(SHARED_IDLE_MS + 1000);
    h.drivers.KASA.pushState(d, { online: true, on: true });
    await vi.waitFor(() => expect(ws.closes).toEqual([4401]));
    expect(sub.events).toEqual([]);
  });

  it("closes the socket once the user logs out elsewhere", async () => {
    h = await ApiHarness.start({ sessionCheckMs: 50 });
    const a = await h.user("Ann");
    const ws = h.wsClient(a.token);
    await h.subscribe(ws, CHANGED);
    await h.ok(a.token, `mutation { logout }`);
    await vi.waitFor(() => expect(ws.closes).toEqual([4401]));
  });
});
