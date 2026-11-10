import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers.js";

const original = process.env.DATABASE_URL_TEST;
afterEach(() => {
  process.env.DATABASE_URL_TEST = original;
});

describe("resetDb", () => {
  it("refuses a database not named home_test", async () => {
    process.env.DATABASE_URL_TEST = "postgresql://u:p@localhost:5432/home";
    await expect(resetDb()).rejects.toThrow(/home_test/);
  });
});
