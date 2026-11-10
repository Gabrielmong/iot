import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness, codes } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const FIELDS = `id name scope layout cameraIds audience editable owner { id }`;
const LIST = `{ cameraGroups { ${FIELDS} } }`;
const OTHERS = `{ otherCameraGroups { ${FIELDS} } }`;
const CREATE = `mutation($input: CameraGroupInput!) { createCameraGroup(input: $input) { ${FIELDS} } }`;
const UPDATE = `mutation($id: ID!, $input: CameraGroupInput!) { updateCameraGroup(id: $id, input: $input) { ${FIELDS} } }`;
const DELETE = `mutation($id: ID!) { deleteCameraGroup(id: $id) }`;

const input = (cameraIds: string[], over: Record<string, unknown> = {}) => ({ name: "Front", scope: "PERSONAL", layout: 4, cameraIds, ...over });
const camera = (name?: string) => h.device({ brand: "SWANN", kind: "CAMERA", ...(name ? { name } : {}) });

describe("camera groups API", () => {
  it("a user creates, reads, updates and deletes a personal group", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const [a, b] = [await camera(), await camera()];
    await h.grant(ann.id, a, b);
    const created = (await h.ok(ann.token, CREATE, { input: input([b, a]) })).createCameraGroup;
    expect(created).toMatchObject({ name: "Front", scope: "PERSONAL", layout: 4, cameraIds: [b, a], editable: true, owner: { id: ann.id } });
    const updated = (await h.ok(ann.token, UPDATE, { id: created.id, input: input([a], { name: "Porch", layout: 1 }) })).updateCameraGroup;
    expect(updated).toMatchObject({ name: "Porch", layout: 1, cameraIds: [a] });
    expect((await h.ok(ann.token, LIST)).cameraGroups.map((g: { id: string }) => g.id)).toEqual([created.id]);
    expect((await h.ok(ann.token, DELETE, { id: created.id })).deleteCameraGroup).toBe(true);
    expect((await h.ok(ann.token, LIST)).cameraGroups).toEqual([]);
  });

  it("rejects a bad layout, too many cameras, duplicates and non-cameras", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const cams: string[] = [];
    for (let i = 0; i < 17; i++) cams.push(await camera()); // sequential: the harness numbers devices by count
    const plug = await h.device();
    const bad = async (i: unknown) => codes(await h.gql(root.token, CREATE, { input: i }));
    expect(await bad(input([cams[0]!], { layout: 3 }))).toEqual(["BAD_USER_INPUT"]);
    expect(await bad(input(cams))).toEqual(["BAD_USER_INPUT"]);
    expect(await bad(input([]))).toEqual(["BAD_USER_INPUT"]);
    expect(await bad(input([cams[0]!, cams[0]!]))).toEqual(["BAD_USER_INPUT"]);
    expect(await bad(input([plug]))).toEqual(["BAD_USER_INPUT"]);
    expect(await bad(input([cams[0]!], { name: " " }))).toEqual(["BAD_USER_INPUT"]);
    await h.ok(root.token, CREATE, { input: input(cams.slice(0, 16), { layout: 16 }) });
  });

  it("a user can't add a camera they can't access", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const cam = await camera();
    expect(codes(await h.gql(ann.token, CREATE, { input: input([cam]) }))).toEqual(["FORBIDDEN"]);
  });

  it("a user can't create a shared group", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const cam = await camera();
    await h.grant(ann.id, cam);
    expect(codes(await h.gql(ann.token, CREATE, { input: input([cam], { scope: "SHARED" }) }))).toEqual(["FORBIDDEN"]);
  });

  it("shared groups reach only their audience; users can't edit them", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const cam = await camera();
    await h.grant(ann.id, cam);
    const g = (await h.ok(root.token, CREATE, { input: input([cam], { scope: "SHARED", audience: [ann.id] }) })).createCameraGroup;
    expect(g).toMatchObject({ scope: "SHARED", owner: null, audience: [ann.id], editable: true });
    expect((await h.ok(ann.token, LIST)).cameraGroups).toEqual([expect.objectContaining({ id: g.id, editable: false, audience: [] })]);
    expect((await h.ok(bob.token, LIST)).cameraGroups).toEqual([]);
    expect(codes(await h.gql(ann.token, UPDATE, { id: g.id, input: input([cam], { scope: "SHARED" }) }))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(bob.token, DELETE, { id: g.id }))).toEqual(["NOT_FOUND"]);
  });

  it("cameraIds are filtered to what the viewer can see", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const [seen, hidden] = [await camera(), await camera()];
    await h.grant(ann.id, seen);
    await h.ok(root.token, CREATE, { input: input([hidden, seen], { scope: "SHARED", audience: [ann.id] }) });
    expect((await h.ok(ann.token, LIST)).cameraGroups[0].cameraIds).toEqual([seen]);
    expect((await h.ok(root.token, LIST)).cameraGroups[0].cameraIds).toEqual([hidden, seen]);
  });

  it("admin sees others' personal groups only in otherCameraGroups and edits them against the owner's access", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const ann = await h.user("Ann");
    const [mine, notAnns] = [await camera(), await camera()];
    await h.grant(ann.id, mine);
    const g = (await h.ok(ann.token, CREATE, { input: input([mine]) })).createCameraGroup;
    expect((await h.ok(root.token, LIST)).cameraGroups).toEqual([]);
    expect((await h.ok(root.token, OTHERS)).otherCameraGroups).toEqual([expect.objectContaining({ id: g.id, owner: { id: ann.id }, editable: true })]);
    expect(codes(await h.gql(root.token, UPDATE, { id: g.id, input: input([mine, notAnns]) }))).toEqual(["FORBIDDEN"]);
    await h.ok(root.token, UPDATE, { id: g.id, input: input([mine], { name: "Renamed" }) });
    expect(codes(await h.gql(ann.token, OTHERS))).toEqual(["FORBIDDEN"]);
  });

  it("duplicate names per owner are rejected (case-insensitive)", async () => {
    h = await ApiHarness.start();
    const ann = await h.user("Ann");
    const bob = await h.user("Bob");
    const cam = await camera();
    await h.grant(ann.id, cam);
    await h.grant(bob.id, cam);
    await h.ok(ann.token, CREATE, { input: input([cam]) });
    expect(codes(await h.gql(ann.token, CREATE, { input: input([cam], { name: "front" }) }))).toEqual(["BAD_USER_INPUT"]);
    await h.ok(bob.token, CREATE, { input: input([cam]) });
  });

  it("scope can't change on update", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const cam = await camera();
    const g = (await h.ok(root.token, CREATE, { input: input([cam]) })).createCameraGroup;
    expect(codes(await h.gql(root.token, UPDATE, { id: g.id, input: input([cam], { scope: "SHARED" }) }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("lists personal groups before shared, each by name", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const cam = await camera();
    for (const [name, scope] of [["Zeta", "SHARED"], ["Beta", "PERSONAL"], ["Alpha", "SHARED"], ["Gamma", "PERSONAL"]]) {
      await h.ok(root.token, CREATE, { input: input([cam], { name, scope }) });
    }
    expect((await h.ok(root.token, LIST)).cameraGroups.map((g: { name: string }) => g.name)).toEqual(["Beta", "Gamma", "Alpha", "Zeta"]);
  });

  it("cameraGroupsChanged fires on create", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    const cam = await camera();
    const sub = await h.subscribe(h.wsClient(root.token), "subscription { cameraGroupsChanged }");
    await h.ok(root.token, CREATE, { input: input([cam]) });
    await sub.waitFor((e) => e.data?.cameraGroupsChanged === true);
  });
});
