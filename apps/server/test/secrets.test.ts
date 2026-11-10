import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/secrets.js";

const key = randomBytes(32);

describe("secrets", () => {
  it("round-trips", () => {
    expect(decryptSecret(encryptSecret("local-key-123", key), key)).toBe("local-key-123");
  });

  it("produces different blobs for the same plaintext", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("throws on a tampered blob", () => {
    const raw = Buffer.from(encryptSecret("secret", key), "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptSecret(raw.toString("base64"), key)).toThrow();
  });

  it("throws on a wrong key or truncated blob", () => {
    const blob = encryptSecret("secret", key);
    expect(() => decryptSecret(blob, randomBytes(32))).toThrow();
    expect(() => decryptSecret("AAAA", key)).toThrow();
  });
});
