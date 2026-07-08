import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  guard,
  handler,
  createGuard,
  validationErrorHandler,
  ValidationError,
  isValidationError,
} from "../src/index.js";

function makeApp(configure: (app: Express) => void): Express {
  const app = express();
  app.use(express.json());
  configure(app);
  return app;
}

describe("guard middleware", () => {
  it("passes valid body through and exposes typed req.valid", async () => {
    const app = makeApp((a) => {
      a.post(
        "/users",
        guard({
          body: z.object({ email: z.string().email(), age: z.number() }),
        }),
        (req, res) => {
          res.json(req.valid.body);
        },
      );
    });

    const res = await request(app)
      .post("/users")
      .send({ email: "a@b.com", age: 30 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: "a@b.com", age: 30 });
  });

  it("rejects invalid body with a 400 and structured issues", async () => {
    const app = makeApp((a) => {
      a.post(
        "/users",
        guard({ body: z.object({ email: z.string().email() }) }),
        (_req, res) => res.json({ ok: true }),
      );
    });

    const res = await request(app).post("/users").send({ email: "nope" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0]).toMatchObject({
      segment: "body",
      path: "email",
      code: "invalid_string",
    });
  });

  it("collects issues across multiple segments by default", async () => {
    const app = makeApp((a) => {
      a.post(
        "/items/:id",
        guard({
          params: z.object({ id: z.coerce.number() }),
          query: z.object({ page: z.coerce.number() }),
          body: z.object({ name: z.string() }),
        }),
        (_req, res) => res.json({ ok: true }),
      );
    });

    const res = await request(app)
      .post("/items/not-a-number?page=abc")
      .send({ name: 123 });

    expect(res.status).toBe(400);
    const segments = res.body.issues.map(
      (i: { segment: string }) => i.segment,
    );
    expect(segments).toContain("params");
    expect(segments).toContain("query");
    expect(segments).toContain("body");
  });

  it("stops at the first segment when abortEarly is set", async () => {
    const app = makeApp((a) => {
      a.post(
        "/items/:id",
        guard(
          {
            params: z.object({ id: z.coerce.number() }),
            body: z.object({ name: z.string() }),
          },
          { abortEarly: true },
        ),
        (_req, res) => res.json({ ok: true }),
      );
    });

    const res = await request(app).post("/items/bad").send({ name: 123 });
    expect(res.status).toBe(400);
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0].segment).toBe("params");
  });

  it("applies transforms and defaults to the output", async () => {
    const app = makeApp((a) => {
      a.get(
        "/search",
        guard({
          query: z.object({
            page: z.coerce.number().default(1),
            tag: z.string().transform((s) => s.toUpperCase()),
          }),
        }),
        (req, res) => res.json(req.valid.query),
      );
    });

    const res = await request(app).get("/search?tag=hello");
    expect(res.body).toEqual({ page: 1, tag: "HELLO" });
  });

  it("forwards to an error handler when passToNext is enabled", async () => {
    const app = makeApp((a) => {
      a.post(
        "/users",
        guard(
          { body: z.object({ email: z.string().email() }) },
          { passToNext: true },
        ),
        (_req, res) => res.json({ ok: true }),
      );
      a.use(
        validationErrorHandler({
          format: (err) => ({ failed: true, count: err.issues.length }),
        }),
      );
    });

    const res = await request(app).post("/users").send({ email: "bad" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ failed: true, count: 1 });
  });

  it("supports custom onError handling", async () => {
    const app = makeApp((a) => {
      a.get(
        "/x",
        guard(
          { query: z.object({ n: z.coerce.number() }) },
          {
            onError: (err, _req, res) => {
              res.status(422).json({ custom: true, issues: err.issues.length });
            },
          },
        ),
        (_req, res) => res.json({ ok: true }),
      );
    });

    const res = await request(app).get("/x?n=abc");
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ custom: true, issues: 1 });
  });
});

describe("handler wrapper", () => {
  it("validates and runs the typed handler", async () => {
    const app = makeApp((a) => {
      a.get(
        "/users/:id",
        handler(
          { params: z.object({ id: z.coerce.number() }) },
          (req, res) => {
            const id: number = req.valid.params.id;
            res.json({ id, double: id * 2 });
          },
        ),
      );
    });

    const res = await request(app).get("/users/21");
    expect(res.body).toEqual({ id: 21, double: 42 });
  });

  it("does not run the handler when validation fails", async () => {
    let ran = false;
    const app = makeApp((a) => {
      a.get(
        "/users/:id",
        handler({ params: z.object({ id: z.coerce.number() }) }, (_req, res) => {
          ran = true;
          res.json({ ok: true });
        }),
      );
    });

    const res = await request(app).get("/users/not-a-number");
    expect(res.status).toBe(400);
    expect(ran).toBe(false);
  });

  it("forwards async errors thrown in the handler to Express", async () => {
    const app = makeApp((a) => {
      a.get(
        "/boom",
        handler({ query: z.object({}) }, async () => {
          throw new Error("kaboom");
        }),
      );
      a.use(
        (
          err: Error,
          _req: express.Request,
          res: express.Response,
          _next: express.NextFunction,
        ) => {
          res.status(500).json({ message: err.message });
        },
      );
    });

    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "kaboom" });
  });

  it("supports async schema refinements", async () => {
    const app = makeApp((a) => {
      a.post(
        "/async",
        handler(
          {
            body: z.object({
              name: z.string().refine(async (v) => v.length > 2, {
                message: "too short",
              }),
            }),
          },
          (req, res) => res.json(req.valid.body),
        ),
      );
    });

    const ok = await request(app).post("/async").send({ name: "abcd" });
    expect(ok.status).toBe(200);

    const bad = await request(app).post("/async").send({ name: "a" });
    expect(bad.status).toBe(400);
    expect(bad.body.issues[0].message).toBe("too short");
  });
});

describe("createGuard", () => {
  it("shares default options across produced guards", async () => {
    const { guard: g } = createGuard({ passToNext: true });
    const app = makeApp((a) => {
      a.get(
        "/x",
        g({ query: z.object({ n: z.coerce.number() }) }),
        (_req, res) => res.json({ ok: true }),
      );
      a.use(validationErrorHandler());
    });

    const res = await request(app).get("/x?n=bad");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });
});

describe("ValidationError", () => {
  it("groups issues by segment and is detectable via isValidationError", () => {
    const err = new ValidationError([
      { segment: "body", path: "a", message: "m", code: "custom" },
      { segment: "query", path: "b", message: "m", code: "custom" },
      { segment: "body", path: "c", message: "m", code: "custom" },
    ]);

    expect(isValidationError(err)).toBe(true);
    const grouped = err.bySegment();
    expect(grouped.body).toHaveLength(2);
    expect(grouped.query).toHaveLength(1);
    expect(grouped.params).toHaveLength(0);
  });
});
