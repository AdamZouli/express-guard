import type { z } from "zod";
import type { Segment } from "./types.js";

/**
 * A single, normalized validation problem. Framework-agnostic and safe to send
 * to clients or logs.
 */
export interface ValidationIssue {
  /** Which part of the request failed: `body`, `query`, `params`, or `headers`. */
  segment: Segment;
  /** Dot-delimited path to the offending field (e.g. `address.zip`, `items.0.id`). */
  path: string;
  /** Human-readable explanation of what went wrong. */
  message: string;
  /** The underlying Zod issue code (e.g. `invalid_type`, `too_small`). */
  code: string;
}

/**
 * Thrown / produced when a request fails schema validation. Carries a flat list
 * of {@link ValidationIssue}s and a sensible default `statusCode` of `400`.
 */
export class ValidationError extends Error {
  override readonly name = "ValidationError";
  readonly statusCode = 400;
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      `Request validation failed with ${issues.length} issue${
        issues.length === 1 ? "" : "s"
      }.`,
    );
    this.issues = issues;
    // Restore prototype chain for reliable `instanceof` across build targets.
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /** Groups issues by segment — handy for building form-style error responses. */
  bySegment(): Record<Segment, ValidationIssue[]> {
    const grouped: Record<Segment, ValidationIssue[]> = {
      body: [],
      query: [],
      params: [],
      headers: [],
    };
    for (const issue of this.issues) {
      grouped[issue.segment].push(issue);
    }
    return grouped;
  }

  /** Serializable representation used by the default error response. */
  toJSON(): {
    error: "ValidationError";
    message: string;
    issues: ValidationIssue[];
  } {
    return {
      error: "ValidationError",
      message: this.message,
      issues: this.issues,
    };
  }
}

/** Type guard for {@link ValidationError} that survives bundling/duplication. */
export function isValidationError(value: unknown): value is ValidationError {
  return (
    value instanceof ValidationError ||
    (typeof value === "object" &&
      value !== null &&
      (value as { name?: unknown }).name === "ValidationError" &&
      Array.isArray((value as { issues?: unknown }).issues))
  );
}

/** Converts a Zod error for a given segment into normalized issues. */
export function toValidationIssues(
  segment: Segment,
  error: z.ZodError,
): ValidationIssue[] {
  return error.issues.map((issue) => ({
    segment,
    path: issue.path.map((p) => String(p)).join("."),
    message: issue.message,
    code: issue.code,
  }));
}
