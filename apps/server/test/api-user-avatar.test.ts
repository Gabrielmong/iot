import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const CREATE = `mutation($img: String) { createUser(name: "Kid", pin: "2468", role: USER, avatarColor: "#43a047", avatarImage: $img) { id avatarImage } }`;
const UPDATE = `mutation($id: ID!, $img: String) { updateUser(id: $id, avatarImage: $img) { avatarColor avatarImage } }`;

describe("avatar pictures", () => {
  it("are optional on create and shown to everyone, including the sign-in list", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const { createUser } = await h.ok(root.token, CREATE, { img: "otter" });
    expect(createUser.avatarImage).toBe("otter");
    expect((await h.ok(null, `{ loginUsers { name avatarImage } }`)).loginUsers).toContainEqual({ name: "Kid", avatarImage: "otter" });
    expect((await h.ok(root.token, `{ me { avatarImage } }`)).me).toEqual({ avatarImage: null });
  });

  it("change independently of the color; null keeps the picture and an empty string clears it", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const { createUser } = await h.ok(root.token, CREATE, { img: "cat" });
    expect((await h.ok(root.token, UPDATE, { id: createUser.id, img: null })).updateUser).toEqual({ avatarColor: "#43a047", avatarImage: "cat" });
    expect((await h.ok(root.token, UPDATE, { id: createUser.id, img: "crow" })).updateUser.avatarImage).toBe("crow");
    expect((await h.ok(root.token, UPDATE, { id: createUser.id, img: "" })).updateUser.avatarImage).toBeNull();
  });

  it("only accept the known pictures", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    expect(codes(await h.gql(root.token, CREATE, { img: "../../etc/passwd" }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(root.token, UPDATE, { id: root.id, img: "unicorn" }))).toEqual(["BAD_USER_INPUT"]);
  });
});
