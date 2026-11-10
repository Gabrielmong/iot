import { makeExecutableSchema } from "@graphql-tools/schema";
import type { GraphQLSchema } from "graphql";
import { readFileSync } from "node:fs";
import { resolvers } from "./resolvers/index.js";

/** The SDL the web app generates its types from. */
export const typeDefs = readFileSync(new URL("./schema.graphql", import.meta.url), "utf8");

export function buildSchema(): GraphQLSchema {
  return makeExecutableSchema({ typeDefs, resolvers });
}
