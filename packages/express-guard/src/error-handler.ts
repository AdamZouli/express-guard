import type { ErrorRequestHandler } from "express";
import { ValidationError, isValidationError } from "./errors.js";

/**
 * Options for {@link validationErrorHandler}.
 */
export interface ErrorHandlerOptions {
  /** Override the HTTP status code (defaults to the error's own `400`). */
  statusCode?: number;
  /** Transform the error into a custom response body. */
  format?: (error: ValidationError) => unknown;
  /** Side-channel for logging/metrics before the response is sent. */
  log?: (error: ValidationError) => void;
}

/**
 * An Express error-handling middleware that turns {@link ValidationError}s
 * (typically forwarded via `passToNext: true`) into clean JSON responses.
 * Non-validation errors are passed through to the next error handler.
 *
 * @example
 * ```ts
 * app.use(validationErrorHandler());
 * ```
 */
export function validationErrorHandler(
  options: ErrorHandlerOptions = {},
): ErrorRequestHandler {
  return function validationError(err, _req, res, next) {
    if (!isValidationError(err)) {
      next(err);
      return;
    }

    options.log?.(err);
    const status = options.statusCode ?? err.statusCode;
    const body = options.format ? options.format(err) : err.toJSON();
    res.status(status).json(body);
  };
}
