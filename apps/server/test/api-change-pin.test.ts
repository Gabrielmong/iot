import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const change = (h: ApiHarness, token: string | null, currentPin: string, newPin: string) =>
  h.gql(token, `mutation($c: String!, $n: String!) { changeMyPin(currentPin: $c, newPin: $n) }`, { c: currentPin, n: newPin });
const login = (h: ApiHarness, userId: string, pin: string) =>
  h.gql(null, `mutation($u: ID!, $p: String!) { login(userId: $u, pin: $p, shared: false) { token } }`, { u: userId, p: pin });

describe("changeMyPin", () => {
  it("changes the PIN, keeps this session, ends the others", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const other = (await h.ok(null, `mutation($u: ID!) { login(userId: $u, pin: "1234", shared: false) { token } }`, { u: ann.id })).login.token as string;
    const r = await change(h, ann.token, "1234", "5678");
    expect(r.data?.changeMyPin).toBe(true);
    expect((await h.ok(ann.token, `{ me { id } }`)).me.id).toBe(ann.id);
    expect(codes(await h.gql(other, `{ me { id } }`))).toEqual(["UNAUTHENTICATED"]);
    expect((await login(h, ann.id, "5678")).data?.login.token).toBeTruthy();
    expect(codes(await login(h, ann.id, "1234"))).toEqual(["INVALID_PIN"]);
  });

  it("a wrong current PIN counts toward the sign-in lockout", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    for (let i = 0; i < 5; i++) {
      const r = await change(h, ann.token, "9999", "5678");
      expect(codes(r)).toEqual(["INVALID_PIN"]);
      expect(r.errors?.[0].extensions?.attemptsLeft).toBe(4 - i);
    }
    expect(codes(await change(h, ann.token, "1234", "5678"))).toEqual(["LOCKED"]);
    expect(codes(await login(h, ann.id, "1234"))).toEqual(["LOCKED"]);
  });

  it("rejects an invalid or unchanged new PIN without counting an attempt", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    expect(codes(await change(h, ann.token, "1234", "12"))).toEqual(["BAD_USER_INPUT"]);
    const same = await change(h, ann.token, "1234", "1234");
    expect(codes(same)).toEqual(["BAD_USER_INPUT"]);
    expect(same.errors?.[0].message).toContain("New PIN must be different");
    const row = await h.db.user.findUniqueOrThrow({ where: { id: ann.id } });
    expect(row.failedPinCount).toBe(0);
  });

  it("a PIN-less guest can't use it, and it needs a session", async () => {
    h = await ApiHarness.start();
    const guest = await h.db.user.create({ data: { name: "Guest", role: "GUEST", avatarColor: "#8e24aa", pinHash: null } });
    const token = (await h.ok(null, `mutation($u: ID!) { loginGuest(userId: $u, shared: false) { token } }`, { u: guest.id })).loginGuest.token as string;
    expect(codes(await change(h, token, "1234", "5678"))).toEqual(["FORBIDDEN"]);
    expect(codes(await change(h, null, "1234", "5678"))).toEqual(["UNAUTHENTICATED"]);
  });
});
