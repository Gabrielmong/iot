import type { ExecutionResult, FormattedExecutionResult, GraphQLError, GraphQLFormattedError } from "graphql";

export type ErrorLog = Pick<Console, "error">;

const INTERNAL: GraphQLFormattedError = { message: "Internal server error", extensions: { code: "INTERNAL_SERVER_ERROR" } };

/**
 * Domain errors carry `extensions.code` and go out as they are; so do GraphQL's own errors (parse,
 * validation, coercion), which have no original error. Anything else a resolver threw is unexpected:
 * it is logged and the client only sees INTERNAL_SERVER_ERROR. Services never put secrets into
 * error messages. Duck-typed rather than `instanceof`, since graphql can be loaded as both CJS and ESM.
 */
export function isUnexpected(error: unknown): boolean {
  const original = isObject(error) && "originalError" in error ? error.originalError : error;
  if (original == null) return false;
  return !(isObject(original) && isObject(original.extensions) && typeof original.extensions.code === "string");
}

/** Apollo `formatError` (HTTP). */
export function formatApiError(formatted: GraphQLFormattedError, error: unknown, log: ErrorLog): GraphQLFormattedError {
  if (!isUnexpected(error)) return formatted;
  log.error("graphql: unexpected error", isObject(error) && "originalError" in error ? (error.originalError ?? error) : error);
  return { ...INTERNAL, ...(formatted.path ? { path: formatted.path } : {}) };
}

/** graphql-ws `onNext` (WebSocket): the same masking for subscription results. */
export function maskResult(result: ExecutionResult, log: ErrorLog): FormattedExecutionResult | undefined {
  if (!result.errors?.some(isUnexpected)) return undefined;
  return {
    ...(result.data !== undefined ? { data: result.data } : {}),
    errors: result.errors.map((e: GraphQLError) => formatApiError(e.toJSON(), e, log)),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
