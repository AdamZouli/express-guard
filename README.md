# Express-Guard

> Type-safe Express request validation powered by [Zod](https://zod.dev) — validate `body`, `query`, `params`, and `headers` with schemas, and get **fully typed** results on `req.valid`.

Almost every backend needs to validate untrusted input. Express-Guard turns that
boilerplate into a single, declarative middleware while giving you end-to-end
type inference: the shape you validate is the shape TypeScript knows about in your
handler. No casts, no `any`, no runtime surprises.

```ts
import express from "express";
import { handler, z } from "@express-guard/core";
import { idParams } from "@express-guard/core/helpers";

const app = express();
app.use(express.json());

app.get(
  "/users/:id",
  handler({ params: idParams }, (req, res) => {
    // req.valid.params.id is typed as `number` — coerced & validated
    res.json({ id: req.valid.params.id });
  }),
);
```

## Why it matters

- **Prevents runtime bugs & unsafe inputs.** Bad requests are rejected at the
  boundary with a structured `400` before they reach your business logic.
- **Type-safe by construction.** `req.valid` is inferred from your schemas, so
  the compiler catches mismatches you'd otherwise find in production.
- **Great DX.** One clean API, sensible defaults, and typed helpers for the
  patterns you write over and over (ids, pagination, sorting, CSV, booleans).

## Repository layout

This is an npm workspaces monorepo:

```
express-guard/
├── packages/
│   └── express-guard/      # @express-guard/core — the library
└── examples/
    └── express-ts/         # a runnable Express + TypeScript API
```

## Quick start

```bash
# Install all workspace dependencies
npm install

# Build the library
npm run build

# Run the test suite (Vitest + Supertest)
npm test

# Run the example API on http://localhost:3000
npm run example
```

Then try the example API:

```bash
curl "http://localhost:3000/users?limit=2&sortBy=name&order=asc"
curl "http://localhost:3000/users/1"
curl -X POST http://localhost:3000/users \
  -H "content-type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'

# A validation failure returns a structured 400:
curl "http://localhost:3000/users/not-a-number"
# { "error": "ValidationError", "message": "...", "issues": [ ... ] }
```

## The library

Full API documentation lives in
[`packages/express-guard/README.md`](./packages/express-guard/README.md).

At a glance:

| Export                   | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `guard(schemas, opts?)`  | Middleware that validates and populates `req.valid`.                |
| `handler(schemas, fn)`   | Validate + handle in one, with a fully typed `req.valid`.           |
| `createGuard(defaults)`  | Pre-configure `guard`/`handler` with shared options.                |
| `validationErrorHandler` | Express error middleware that formats `ValidationError`s as JSON.   |
| `ValidationError`        | Structured error carrying a flat list of normalized issues.         |
| `@express-guard/core/helpers` | `idParams`, `pagination`, `sort`, `csv`, `booleanQuery`, and more. |

## Development

```bash
npm run build       # build @express-guard/core (ESM + CJS + d.ts via tsup)
npm test            # run the test suite
npm run typecheck   # type-check every workspace
```

## License

MIT
