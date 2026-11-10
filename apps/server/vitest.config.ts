import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ quiet: true });
const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    // Tests run against the protocols source, so no prior `pnpm build` of the package is needed
    // and error classes are shared with the fake devices imported from its src/test helpers.
    alias: [
      {
        find: /^@home\/protocols$/,
        replacement: fileURLToPath(new URL("../../packages/protocols/src/index.ts", import.meta.url)),
      },
      // One graphql instance, as in production: without this our source would get graphql's ESM build
      // while Apollo and graphql-ws load its CJS build, and their `instanceof GraphQLError` checks fail.
      { find: /^graphql$/, replacement: require.resolve("graphql") },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    fileParallelism: false,
  },
});
