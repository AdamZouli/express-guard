import { pathToFileURL } from "node:url";
import express from "express";
import { createGuard, validationErrorHandler } from "@express-guard/core";
import { userStore } from "./store.js";
import {
  createUserBody,
  listUsersQuery,
  updateUserBody,
  userIdParams,
} from "./schemas.js";

// Configure guards once: forward validation failures to the error handler.
const { handler } = createGuard({ passToNext: true });

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// GET /users?q=&role=&page=&limit=&sortBy=&order=
app.get(
  "/users",
  handler({ query: listUsersQuery }, (req, res) => {
    const { data, total } = userStore.list({
      q: req.valid.query.q,
      role: req.valid.query.role,
      page: req.valid.query.page,
      limit: req.valid.query.limit,
      offset: req.valid.query.offset,
      sortBy: req.valid.query.sortBy,
      order: req.valid.query.order,
    });

    res.json({
      data,
      pagination: {
        page: req.valid.query.page,
        limit: req.valid.query.limit,
        total,
        pages: Math.ceil(total / req.valid.query.limit),
      },
    });
  }),
);

// GET /users/:id
app.get(
  "/users/:id",
  handler({ params: userIdParams }, (req, res) => {
    const user = userStore.get(req.valid.params.id);
    if (!user) {
      res.status(404).json({ error: "NotFound", message: "User not found." });
      return;
    }
    res.json(user);
  }),
);

// POST /users
app.post(
  "/users",
  handler({ body: createUserBody }, (req, res) => {
    const user = userStore.create(req.valid.body);
    res.status(201).json(user);
  }),
);

// PATCH /users/:id
app.patch(
  "/users/:id",
  handler(
    { params: userIdParams, body: updateUserBody },
    (req, res) => {
      const user = userStore.update(req.valid.params.id, req.valid.body);
      if (!user) {
        res.status(404).json({ error: "NotFound", message: "User not found." });
        return;
      }
      res.json(user);
    },
  ),
);

// DELETE /users/:id
app.delete(
  "/users/:id",
  handler({ params: userIdParams }, (req, res) => {
    const removed = userStore.remove(req.valid.params.id);
    if (!removed) {
      res.status(404).json({ error: "NotFound", message: "User not found." });
      return;
    }
    res.status(204).end();
  }),
);

// Turns any forwarded ValidationError into a clean 400 JSON payload.
app.use(validationErrorHandler());

// Generic fallback error handler.
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  },
);

const port = Number(process.env.PORT ?? 3000);

// Only listen when run directly (so this file can also be imported in tests).
const isMain =
  !!process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  app.listen(port, () => {
    console.log(`express-guard example listening on http://localhost:${port}`);
  });
}

export { app };
