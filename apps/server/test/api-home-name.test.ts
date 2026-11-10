import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const SET = `mutation($name: String!) { setHomeName(name: $name) }`;

describe("home name", () => {
  it("is Home until set, and readable without signing in", async () => {
    h = await ApiHarness.start();
    expect((await h.ok(null, `{ homeName }`)).homeName).toBe("Home");
  });

  it("lets an admin rename it, trimmed, and validates the length", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    expect((await h.ok(root.token, SET, { name: "  The Cabin " })).setHomeName).toBe("The Cabin");
    expect((await h.ok(null, `{ homeName }`)).homeName).toBe("The Cabin");
    expect(codes(await h.gql(root.token, SET, { name: "   " }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(root.token, SET, { name: "x".repeat(41) }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("forbids a USER from renaming it", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann");
    expect(codes(await h.gql(a.token, SET, { name: "Mine" }))).toEqual(["FORBIDDEN"]);
  });
});
