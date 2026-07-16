import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import type { ValidationError } from "./errors.js";

/**
 * The four request locations Express-Guard can validate.
 */
export type Segment = "body" | "query" | "params" | "headers";

/**
 * A map of request segments to Zod schemas. Every field is optional — only the
 * segments you provide are validated. Segments without a schema are passed
 * through untouched.
 */
export interface GuardSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  headers?: z.ZodTypeAny;
}

/**
 * Resolves a schema entry to its *output* type (post-transform), falling back
 * to `Fallback` when no schema is provided for that segment.
 */
export type InferSegment<T, Fallback> = T extends z.ZodTypeAny
  ? z.output<T>
  : Fallback;

/**
 * The fully-typed, validated request data derived from a {@link GuardSchemas}
 * definition. Available on `req.valid` after a guard runs successfully.
 *
 * Only the segments that have a corresponding schema are present — accessing
 * a segment that was not validated is a compile-time error. For unvalidated
 * segments use the original Express properties (`req.body`, `req.query`, etc.).
 */
export type ValidatedData<S extends GuardSchemas> = {
  [K in Segment as S[K] extends z.ZodTypeAny ? K : never]: z.output<
    Extract<S[K], z.ZodTypeAny>
  >;
};

/**
 * An Express `Request` narrowed with a strongly-typed `valid` property that
 * matches the schemas passed to the guard.
 */
export type GuardedRequest<
  S extends GuardSchemas,
  ResBody = unknown,
  Locals extends Record<string, unknown> = Record<string, unknown>,
> = Omit<Request<never, ResBody, unknown, unknown, Locals>, "valid"> & {
  valid: ValidatedData<S>;
};

/**
 * Behaviour options shared by {@link guard} and {@link handler}.
 */
export interface GuardOptions {
  /**
   * Stop validating at the first segment that fails instead of collecting every
   * issue across all segments. Defaults to `false` (collect everything).
   */
  abortEarly?: boolean;
  /**
   * When `true`, validation failures are forwarded to Express via `next(error)`
   * so a downstream error handler (e.g. {@link validationErrorHandler}) can
   * deal with them. When `false` (the default) the guard responds with a
   * `400` JSON payload directly.
   */
  passToNext?: boolean;
  /**
   * Fully custom failure handling. When provided it takes precedence over both
   * the default JSON response and `passToNext`.
   */
  onError?: (
    error: ValidationError,
    req: Request,
    res: Response,
    next: NextFunction,
  ) => void;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Validated request data populated by an Express-Guard middleware.
       * Only segments that were given a schema are present at runtime.
       * Prefer the {@link handler} wrapper or a {@link GuardedRequest} cast to
       * access this with precise types.
       */
      valid: Partial<Record<Segment, unknown>>;
    }
  }
}
