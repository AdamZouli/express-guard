import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import {
  ValidationError,
  type ValidationIssue,
  toValidationIssues,
} from "./errors.js";
import type {
  GuardOptions,
  GuardSchemas,
  GuardedRequest,
  Segment,
  ValidatedData,
} from "./types.js";

// Validate cheap-to-fail, position-independent segments first so that early
// aborts surface the most actionable errors.
const SEGMENTS: readonly Segment[] = ["params", "query", "headers", "body"];

interface ValidationOutcome {
  issues: ValidationIssue[];
  valid: ValidatedData<GuardSchemas>;
}

async function runValidation(
  schemas: GuardSchemas,
  req: Request,
  abortEarly: boolean,
): Promise<ValidationOutcome> {
  const issues: ValidationIssue[] = [];
  const parsed: Partial<Record<Segment, unknown>> = {};

  for (const segment of SEGMENTS) {
    const schema = schemas[segment];
    if (!schema) continue;

    // `safeParseAsync` transparently supports both sync and async schemas
    // (e.g. those using async `.refine`/`.transform`).
    const result = await schema.safeParseAsync(req[segment]);
    if (result.success) {
      parsed[segment] = result.data;
    } else {
      issues.push(...toValidationIssues(segment, result.error));
      if (abortEarly) break;
    }
  }

  const valid: ValidatedData<GuardSchemas> = {
    body: schemas.body ? parsed.body : req.body,
    query: schemas.query ? parsed.query : req.query,
    params: schemas.params ? parsed.params : req.params,
    headers: schemas.headers ? parsed.headers : req.headers,
  };

  return { issues, valid };
}

function dispatchError(
  error: ValidationError,
  options: GuardOptions,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (options.onError) {
    options.onError(error, req, res, next);
    return;
  }
  if (options.passToNext) {
    next(error);
    return;
  }
  res.status(error.statusCode).json(error.toJSON());
}

/**
 * Creates an Express middleware that validates the configured request segments
 * against their Zod schemas. On success the parsed, typed data is attached to
 * `req.valid`; on failure the request is rejected according to {@link GuardOptions}.
 *
 * @example
 * ```ts
 * app.post(
 *   "/users",
 *   guard({ body: z.object({ email: z.string().email() }) }),
 *   (req, res) => res.json(req.valid.body),
 * );
 * ```
 */
export function guard(
  schemas: GuardSchemas,
  options: GuardOptions = {},
): RequestHandler {
  const abortEarly = options.abortEarly ?? false;

  return function guardMiddleware(req, res, next) {
    runValidation(schemas, req, abortEarly).then(
      ({ issues, valid }) => {
        if (issues.length > 0) {
          dispatchError(new ValidationError(issues), options, req, res, next);
          return;
        }
        (req as unknown as { valid: ValidatedData<GuardSchemas> }).valid =
          valid;
        next();
      },
      // Unexpected (non-validation) failures — surface to Express.
      (err: unknown) => next(err),
    );
  };
}

/**
 * A route handler that receives a request with strongly-typed `req.valid`.
 */
export type GuardedHandler<S extends GuardSchemas> = (
  req: GuardedRequest<S>,
  res: Response,
  next: NextFunction,
) => void | Response | Promise<void | Response>;

/**
 * Combines validation and handling into a single, fully-typed route handler.
 * The `req.valid` object is inferred directly from `schemas`, and any error
 * thrown (or rejected) inside `fn` is forwarded to Express.
 *
 * @example
 * ```ts
 * app.get(
 *   "/users/:id",
 *   handler(
 *     { params: z.object({ id: z.coerce.number() }) },
 *     (req, res) => {
 *       // req.valid.params.id is typed as `number`
 *       res.json({ id: req.valid.params.id });
 *     },
 *   ),
 * );
 * ```
 */
export function handler<S extends GuardSchemas>(
  schemas: S,
  fn: GuardedHandler<S>,
  options: GuardOptions = {},
): RequestHandler {
  const validateMiddleware = guard(schemas, options);

  return function guardedHandler(req, res, next) {
    validateMiddleware(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      // If the guard already responded (default failure mode), stop here.
      if (res.headersSent) return;
      Promise.resolve(fn(req as unknown as GuardedRequest<S>, res, next)).catch(
        next,
      );
    });
  };
}

/**
 * Builds a pair of {@link guard} / {@link handler} functions that share a common
 * set of default options — useful for enforcing one failure strategy app-wide.
 *
 * @example
 * ```ts
 * export const { guard, handler } = createGuard({ passToNext: true });
 * ```
 */
export function createGuard(defaults: GuardOptions = {}): {
  guard: (schemas: GuardSchemas, options?: GuardOptions) => RequestHandler;
  handler: <S extends GuardSchemas>(
    schemas: S,
    fn: GuardedHandler<S>,
    options?: GuardOptions,
  ) => RequestHandler;
} {
  return {
    guard: (schemas, options) => guard(schemas, { ...defaults, ...options }),
    handler: (schemas, fn, options) =>
      handler(schemas, fn, { ...defaults, ...options }),
  };
}
