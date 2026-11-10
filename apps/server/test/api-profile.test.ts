import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const PROFILE = `mutation($name: String, $color: String, $img: String) {
  updateProfile(name: $name, avatarColor: $color, avatarImage: $img) { id name avatarColor avatarImage role }
}`;

describe("updateProfile", () => {
  it("lets any signed-in user change their own name, color and picture", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const r = await h.ok(ann.token, PROFILE, { name: "  Annie ", color: "#8e24aa", img: "otter" });
    expect(r.updateProfile).toEqual({ id: ann.id, name: "Annie", avatarColor: "#8e24aa", avatarImage: "otter", role: "USER" });
    expect((await h.ok(ann.token, `{ me { name avatarImage } }`)).me).toEqual({ name: "Annie", avatarImage: "otter" });
  });

  it("leaves omitted fields alone, clears the picture with an empty string, and keeps the session", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    await h.ok(ann.token, PROFILE, { img: "cat" });
    expect((await h.ok(ann.token, PROFILE, { img: "" })).updateProfile).toMatchObject({ name: "Ann", avatarImage: null });
    expect((await h.ok(ann.token, `{ me { name } }`)).me).toEqual({ name: "Ann" });
  });

  it("validates like the admin form: unique name, real colors and known pictures", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    await h.user("Bob");
    expect(codes(await h.gql(ann.token, PROFILE, { name: "Bob" }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(ann.token, PROFILE, { color: "red" }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(ann.token, PROFILE, { img: "unicorn" }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("cannot change the role or PIN, and needs a session", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    expect((await h.gql(ann.token, `mutation { updateProfile(role: ADMIN) { role } }`)).errors).toBeDefined();
    expect((await h.gql(ann.token, `mutation { updateProfile(pin: "9999") { id } }`)).errors).toBeDefined();
    expect((await h.ok(ann.token, `{ me { role } }`)).me).toEqual({ role: "USER" });
    expect(codes(await h.gql(null, PROFILE, { name: "X" }))).toEqual(["UNAUTHENTICATED"]);
  });
});
