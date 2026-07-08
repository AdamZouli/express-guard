/**
 * Express-Guard — type-safe Express request validation powered by Zod.
 *
 * @packageDocumentation
 */

export { guard, handler, createGuard } from "./validate.js";
export type { GuardedHandler } from "./validate.js";

export {
  ValidationError,
  isValidationError,
  toValidationIssues,
} from "./errors.js";
export type { ValidationIssue } from "./errors.js";

export { validationErrorHandler } from "./error-handler.js";
export type { ErrorHandlerOptions } from "./error-handler.js";

export type {
  GuardSchemas,
  GuardOptions,
  GuardedRequest,
  ValidatedData,
  InferSegment,
  Segment,
} from "./types.js";

// Re-exported for convenience so consumers can build schemas without importing
// zod separately. (zod remains a peer dependency.)
export { z } from "zod";
