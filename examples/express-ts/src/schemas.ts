import { z } from "@express-guard/core";
import { idParams, pagination, sort } from "@express-guard/core/helpers";

/**
 * All request schemas for the users API live here so routes stay declarative.
 */

export const userRole = z.enum(["admin", "member"]);

export const createUserBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  role: userRole.default("member"),
});

export const updateUserBody = createUserBody.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update." },
);

export const userIdParams = idParams;

export const listUsersQuery = z
  .object({ role: userRole.optional() })
  .and(sort(["name", "createdAt"], { default: "createdAt", defaultOrder: "desc" }))
  .and(pagination({ defaultLimit: 10, maxLimit: 50 }))
  .and(z.object({ q: z.string().trim().min(1).optional() }));
