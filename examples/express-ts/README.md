# express-ts-example

A small, runnable Express + TypeScript API that demonstrates
[`@express-guard/core`](../../packages/express-guard) in a realistic setup:

- Typed `body`, `query`, and `params` validation per route
- Reusable schemas built from the typed helpers (`idParams`, `pagination`, `sort`)
- Centralized error handling via `createGuard({ passToNext: true })` +
  `validationErrorHandler()`
- An in-memory user store (no database required)

## Run it

From the repository root:

```bash
npm install
npm run example        # starts on http://localhost:3000
```

Or from this folder:

```bash
npm run dev            # watch mode (tsx)
npm start              # run once
```

Set a custom port with the `PORT` environment variable.

## Endpoints

| Method   | Path         | Validates                     |
| -------- | ------------ | ----------------------------- |
| `GET`    | `/health`    | —                             |
| `GET`    | `/users`     | `query` (search/sort/paginate)|
| `GET`    | `/users/:id` | `params.id` (number)          |
| `POST`   | `/users`     | `body`                        |
| `PATCH`  | `/users/:id` | `params.id` + partial `body`  |
| `DELETE` | `/users/:id` | `params.id`                   |

## Try it

```bash
# Paginated, sorted, filtered list
curl "http://localhost:3000/users?q=a&sortBy=name&order=asc&limit=2"

# Create (valid)
curl -X POST http://localhost:3000/users \
  -H "content-type: application/json" \
  -d '{"name":"Katherine Johnson","email":"kj@example.com","role":"admin"}'

# Create (invalid) -> 400 with structured issues
curl -X POST http://localhost:3000/users \
  -H "content-type: application/json" \
  -d '{"name":"x","email":"nope"}'

# Invalid id -> 400
curl "http://localhost:3000/users/not-a-number"
```
