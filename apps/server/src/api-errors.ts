import { GraphQLError } from "graphql";

/** A domain error the API returns as-is, with `extensions.code`. Messages never include secrets. */
export const coded = (code: string, message: string, extensions: Record<string, unknown> = {}) =>
  new GraphQLError(message, { extensions: { code, ...extensions } });

export const unauthenticated = () => coded("UNAUTHENTICATED", "Sign in required");
export const forbidden = (message = "Not allowed") => coded("FORBIDDEN", message);
export const badInput = (message: string) => coded("BAD_USER_INPUT", message);
export const notFound = (what: string) => coded("NOT_FOUND", `${what} not found`);
