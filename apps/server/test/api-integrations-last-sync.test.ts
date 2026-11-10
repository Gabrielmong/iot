import { SwannUnreachableError } from "@home/protocols";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApiHarness } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const STATUS = `{ integrations { tuyaLastSyncAt kasaLastSavedAt swannLastSyncAt } }`;
const TUYA = `mutation { setTuyaCloud(accessId: "id", accessSecret: "secret", region: "eu") { tuyaCloudConfigured } }`;
const SYNC = `mutation { syncTuyaKeys { matched } }`;
const KASA = `mutation { setKasaCredentials(username: "me@example.com", password: "pw") { kasaConfigured } }`;
const SWANN = `mutation { setSwannRecorder(host: "192.168.0.20", username: "admin", password: "pw") { channels } }`;

const probe = async () => ({ template: "t", channels: [{ channel: 1, codec: "H264" }] }) as never;

describe("integration last-synced times", () => {
  it("are null until something succeeds", async () => {
    h = await ApiHarness.start();
    const root = await h.user("Root", "ADMIN");
    expect((await h.ok(root.token, STATUS)).integrations).toEqual({ tuyaLastSyncAt: null, kasaLastSavedAt: null, swannLastSyncAt: null });
  });

  it("record the Tuya key sync, Kasa sign-in and Swann probe times", async () => {
    h = await ApiHarness.start({ swannProbe: probe });
    const root = await h.user("Root", "ADMIN");
    const at = new Date(h.time).toISOString();
    await h.ok(root.token, TUYA);
    await h.ok(root.token, SYNC);
    await h.ok(root.token, KASA);
    await h.ok(root.token, SWANN);
    expect((await h.ok(root.token, STATUS)).integrations).toEqual({ tuyaLastSyncAt: at, kasaLastSavedAt: at, swannLastSyncAt: at });
  });

  it("leave the Swann time unset when the recorder can't be reached", async () => {
    h = await ApiHarness.start({
      swannProbe: async () => {
        throw new SwannUnreachableError("no answer");
      },
    });
    const root = await h.user("Root", "ADMIN");
    await h.gql(root.token, SWANN);
    expect((await h.ok(root.token, STATUS)).integrations.swannLastSyncAt).toBeNull();
  });
});
