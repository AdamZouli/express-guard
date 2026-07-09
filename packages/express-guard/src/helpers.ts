import { z } from "zod";

/**
 * A collection of ready-made, typed Zod schemas for the request shapes almost
 * every backend needs: ids, pagination, sorting, boolean/CSV query params, and
 * more. They are deliberately built with coercion in mind because query and
 * path params always arrive as strings.
 */

/** A positive integer, coerced from strings (`"42"` -> `42`). */
export const positiveInt = z.coerce.number().int().positive();

/** A non-negative integer, coerced from strings (`"0"` -> `0`). */
export const nonNegativeInt = z.coerce.number().int().nonnegative();

/**
 * `{ id: number }` params schema — the classic `/resource/:id` case.
 * `req.valid.params.id` is typed as `number`.
 */
export const idParams = z.object({ id: positiveInt });

/** `{ id: string }` params schema validated as a UUID. */
export const uuidParams = z.object({ id: z.string().uuid() });

/**
 * Coerces common truthy/falsy query strings into a real boolean.
 * Accepts `true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off` (case-insensitive),
 * as well as actual booleans.
 */
export const booleanQuery = z
  .union([z.boolean(), z.string()])
  .transform((value, ctx) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Expected a boolean-like value, received "${value}".`,
    });
    return z.NEVER;
  });

/**
 * Builds a pagination query schema with sensible, overridable defaults.
 * Produces `{ page, limit, offset }` where `offset` is derived for convenience.
 *
 * @example
 * ```ts
 * guard({ query: pagination({ defaultLimit: 25, maxLimit: 100 }) });
 * // req.valid.query -> { page: number; limit: number; offset: number }
 * ```
 */
export function pagination(
  options: {
    defaultPage?: number;
    defaultLimit?: number;
    maxLimit?: number;
  } = {},
) {
  const { defaultPage = 1, defaultLimit = 20, maxLimit = 100 } = options;
  return z
    .object({
      page: z.coerce.number().int().min(1).default(defaultPage),
      limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    })
    .transform((value) => ({
      ...value,
      offset: (value.page - 1) * value.limit,
    }));
}

function buildDefaultedSort<const T extends readonly [string, ...string[]]>(
  fields: T,
  fallback: T[number],
  order: "asc" | "desc",
) {
  return z.object({
    sortBy: z.enum(fields).default(fallback),
    order: z.enum(["asc", "desc"]).default(order),
  });
}

function buildOptionalSort<const T extends readonly [string, ...string[]]>(
  fields: T,
  order: "asc" | "desc",
) {
  return z.object({
    sortBy: z.enum(fields).optional(),
    order: z.enum(["asc", "desc"]).default(order),
  });
}

/**
 * Builds a sorting query schema constrained to an allow-list of fields.
 * When `default` is supplied, `sortBy` is non-optional in the output type.
 *
 * @example
 * ```ts
 * guard({ query: sort(["createdAt", "name"], { default: "createdAt" }) });
 * // req.valid.query -> { sortBy: "createdAt" | "name"; order: "asc" | "desc" }
 * ```
 */
export function sort<const T extends readonly [string, ...string[]]>(
  fields: T,
  options: { default: T[number]; defaultOrder?: "asc" | "desc" },
): ReturnType<typeof buildDefaultedSort<T>>;
export function sort<const T extends readonly [string, ...string[]]>(
  fields: T,
  options?: { default?: undefined; defaultOrder?: "asc" | "desc" },
): ReturnType<typeof buildOptionalSort<T>>;
export function sort<const T extends readonly [string, ...string[]]>(
  fields: T,
  options: { default?: T[number]; defaultOrder?: "asc" | "desc" } = {},
) {
  const order = options.defaultOrder ?? "asc";
  return options.default !== undefined
    ? buildDefaultedSort(fields, options.default, order)
    : buildOptionalSort(fields, order);
}

/**
 * Parses a comma-separated string (or an already-split array) into an array of
 * items validated by `itemSchema`. Empty segments are dropped.
 *
 * @example
 * ```ts
 * guard({ query: z.object({ tags: csv(z.string()) }) });
 * // "a,b,c" -> ["a", "b", "c"]
 * ```
 */
export function csv<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
      (Array.isArray(value) ? value : value.split(","))
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    )
    .pipe(z.array(itemSchema));
}

/**
 * A trimmed, non-empty string. Optionally enforce a maximum length.
 */
export function nonEmptyString(max?: number) {
  const base = z.string().trim().min(1, "Must not be empty.");
  return max === undefined ? base : base.max(max);
}

/**
 * A common `?q=` full-text search query combined with pagination.
 * `q` is optional and trimmed.
 */
export function search(
  options: Parameters<typeof pagination>[0] & { minQueryLength?: number } = {},
) {
  const { minQueryLength = 1, ...paginationOptions } = options;
  return z
    .object({
      q: z.string().trim().min(minQueryLength).optional(),
    })
    .and(pagination(paginationOptions));
}
