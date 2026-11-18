/** Marks the end of a HomeAgent download; the agent reads its pairing details backwards from it. */
export const TRAILER_MAGIC = "HOMEAGT1";

/** `<json><uint32 LE json length><HOMEAGT1>`, appended to the exe so one download pairs one PC. */
export function trailer(payload: { server: string; code: string }): Buffer {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(json.length);
  return Buffer.concat([json, len, Buffer.from(TRAILER_MAGIC, "ascii")]);
}
