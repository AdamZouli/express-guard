# @express-guard/core

Type-safe [Express](https://expressjs.com) request validation powered by
[Zod](https://zod.dev). Validate `body`, `query`, `params`, and `headers` with
schemas and get **fully typed** results on `req.valid`.

- Validate any combination of request segments in one middleware
- End-to-end type inference — `req.valid` matches your schemas exactly
- Collects issues across all segments (or fail fast with `abortEarly`)
- Choose your failure strategy: direct `400` JSON, `next(error)`, or custom
- Async schema support (`.refine`/`.transform` with promises just work)
- Zero mutation of `req.query`/`req.params` — safe with **Express 4 and 5**
- Ships ESM + CJS + type declarations. `zod` and `express` are peer deps.

## Installation

```bash
npm install @express-guard/core zod express
```

## Quick start

```ts
import express from "express";
import { guard, z } from "@express-guard/core";

const app = express();
app.use(express.json());

app.post(
  "/users",
  guard({
    body: z.object({
      email: z.string().email(),
      age: z.number().int().positive(),
    }),
  }),
  (req, res) => {
    // req.valid.body is available at runtime.
    res.status(201).json(req.valid.body);
  },
);
```

For full type inference inside the handler, use the `handler` wrapper.

## `handler` — validate and handle, fully typed

`handler(schemas, fn)` runs validation and then calls your function with a
request whose `req.valid` is inferred from the schemas. Any error thrown (or
rejected) inside `fn` is forwarded to Express automatically.

```ts
import { handler, z } from "@express-guard/core";

app.get(
  "/users/:id",
  handler(
    {
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({ verbose: z.coerce.boolean().default(false) }),
    },
    (req, res) => {
      const id = req.valid.params.id; // number
      const verbose = req.valid.query.verbose; // boolean
      res.json({ id, verbose });
    },
  ),
);
```

> Because `handler` returns a single middleware, thrown errors and rejected
> promises are safely routed to your Express error handler — no `try/catch`
> boilerplate needed.

## `guard` — the middleware

```ts
guard(schemas: GuardSchemas, options?: GuardOptions): RequestHandler
```

`schemas` may include any of `body`, `query`, `params`, `headers`. On success the
parsed output is written to `req.valid`. **Only the segments you provide a schema
for appear on `req.valid`** — accessing any other segment on `req.valid` is a
compile-time error. Use `req.body`, `req.query`, `req.params`, and `req.headers`
directly for segments you choose not to validate.

### Options

| Option       | Type                                                | Default | Description                                                                  |
| ------------ | --------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `abortEarly` | `boolean`                                            | `false` | Stop at the first failing segment instead of collecting every issue.        |
| `passToNext` | `boolean`                                            | `false` | Forward failures via `next(error)` instead of responding directly.          |
| `onError`    | `(err, req, res, next) => void`                      | —       | Fully custom failure handling (takes precedence over the two options above).|

### Failure strategies

**1. Default — respond with `400` JSON automatically:**

```ts
app.post("/users", guard({ body: schema }), handlerFn);
// -> 400 { "error": "ValidationError", "message": "...", "issues": [...] }
```

**2. Centralized — forward to an error handler:**

```ts
import { guard, validationErrorHandler } from "@express-guard/core";

app.post("/users", guard({ body: schema }, { passToNext: true }), handlerFn);
app.use(validationErrorHandler());
```

**3. Custom per-route:**

```ts
guard(
  { body: schema },
  {
    onError: (err, _req, res) => {
      res.status(422).json({ problems: err.issues });
    },
  },
);
```

## `createGuard` — shared defaults

```ts
import { createGuard } from "@express-guard/core";

export const { guard, handler } = createGuard({ passToNext: true });
```

Every guard/handler produced now defaults to forwarding failures to your error
handler, while still allowing per-call overrides.

## Error shape

A failed validation produces a `ValidationError` (status `400`) whose default
JSON body is:

```json
{
  "error": "ValidationError",
  "message": "Request validation failed with 2 issues.",
  "issues": [
    { "segment": "body", "path": "email", "message": "Invalid email", "code": "invalid_string" },
    { "segment": "params", "path": "id", "message": "Expected number, received nan", "code": "invalid_type" }
  ]
}
```

Helpers on the error:

```ts
err.issues;        // flat ValidationIssue[]
err.bySegment();   // { body: [...], query: [...], params: [...], headers: [...] }
err.toJSON();      // the serializable body above
isValidationError(value); // robust type guard
```

Customize the response with `validationErrorHandler`:

```ts
app.use(
  validationErrorHandler({
    statusCode: 422,
    log: (err) => logger.warn({ issues: err.issues }, "validation failed"),
    format: (err) => ({ ok: false, errors: err.issues }),
  }),
);
```

## Typed helpers

Import from `@express-guard/core/helpers`. Every helper is coercion-aware because
query and path params always arrive as strings.

```ts
import {
  idParams,       // z.object({ id: number })  — coerced, positive int
  uuidParams,     // z.object({ id: string })  — UUID
  positiveInt,    // coerced positive integer
  nonNegativeInt, // coerced non-negative integer
  booleanQuery,   // "true"/"1"/"yes"/"on" -> true, etc.
  pagination,     // { page, limit, offset } with defaults
  sort,           // { sortBy, order } constrained to an allow-list
  csv,            // "a,b,c" | string[] -> validated array
  nonEmptyString, // trimmed, non-empty string
  search,         // ?q= + pagination combined
} from "@express-guard/core/helpers";
```

Examples:

```ts
// GET /users?page=2&limit=25
guard({ query: pagination({ defaultLimit: 20, maxLimit: 100 }) });
// req.valid.query -> { page: number; limit: number; offset: number }

// GET /articles?sortBy=title&order=desc
guard({ query: sort(["title", "createdAt"], { default: "createdAt" }) });
// req.valid.query -> { sortBy: "title" | "createdAt"; order: "asc" | "desc" }

// GET /posts?tags=ts,zod,express
guard({ query: z.object({ tags: csv(z.string()) }) });
// req.valid.query.tags -> string[]
```

## Type utilities

```ts
import type {
  GuardSchemas,
  GuardOptions,
  GuardedRequest,
  ValidatedData,
} from "@express-guard/core";

// Reuse a typed request in a standalone handler:
function listUsers(req: GuardedRequest<{ query: typeof listQuery }>, res) {
  const { page } = req.valid.query;
}
```

## Headers validation

You can validate `headers` the same way as any other segment:

```ts
app.get(
  "/admin/report",
  handler(
    {
      headers: z.object({
        "x-api-key": z.string().min(32),
        "x-request-id": z.string().uuid().optional(),
      }),
    },
    (req, res) => {
      // req.valid.headers["x-api-key"] is typed as string
      res.json({ ok: true });
    },
  ),
);
```

> **Header names are always lowercase.** Express (and the HTTP/2 spec) normalises
> all incoming header names to lower-case before they reach your middleware.
> Always use lower-case keys in your header schemas — `"Authorization"` will
> never match; `"authorization"` will.

```ts
// Wrong — will never validate because Express lowercases the key:
z.object({ Authorization: z.string() });

// Correct:
z.object({ authorization: z.string() });
```

## Notes on Express 5

Express 5 makes `req.query` a read-only getter. Express-Guard never reassigns
`req.query`/`req.params`; validated output is stored on `req.valid`, so it works
seamlessly on both Express 4 and 5.

## License

MIT
