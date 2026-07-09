import { describe, expect, it } from "vitest";
import {
  booleanQuery,
  csv,
  idParams,
  nonEmptyString,
  pagination,
  search,
  sort,
  uuidParams,
} from "../src/helpers.js";
import { z } from "zod";

describe("helper schemas", () => {
  it("idParams coerces a numeric id", () => {
    expect(idParams.parse({ id: "42" })).toEqual({ id: 42 });
    expect(idParams.safeParse({ id: "-1" }).success).toBe(false);
    expect(idParams.safeParse({ id: "abc" }).success).toBe(false);
  });

  it("uuidParams validates a uuid", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(uuidParams.parse({ id: uuid })).toEqual({ id: uuid });
    expect(uuidParams.safeParse({ id: "nope" }).success).toBe(false);
  });

  it("booleanQuery coerces truthy/falsy strings", () => {
    for (const truthy of ["true", "1", "yes", "on", "TRUE"]) {
      expect(booleanQuery.parse(truthy)).toBe(true);
    }
    for (const falsy of ["false", "0", "no", "off", "OFF"]) {
      expect(booleanQuery.parse(falsy)).toBe(false);
    }
    expect(booleanQuery.parse(true)).toBe(true);
    expect(booleanQuery.safeParse("maybe").success).toBe(false);
  });

  it("pagination applies defaults and derives offset", () => {
    expect(pagination().parse({})).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(pagination().parse({ page: "3", limit: "10" })).toEqual({
      page: 3,
      limit: 10,
      offset: 20,
    });
    expect(
      pagination({ maxLimit: 50 }).safeParse({ limit: "1000" }).success,
    ).toBe(false);
  });

  it("sort constrains to an allow-list", () => {
    const schema = sort(["name", "createdAt"], { default: "createdAt" });
    expect(schema.parse({})).toEqual({ sortBy: "createdAt", order: "asc" });
    expect(schema.parse({ sortBy: "name", order: "desc" })).toEqual({
      sortBy: "name",
      order: "desc",
    });
    expect(schema.safeParse({ sortBy: "evil" }).success).toBe(false);
  });

  it("csv splits and validates each item", () => {
    const schema = csv(z.string());
    expect(schema.parse("a, b ,c")).toEqual(["a", "b", "c"]);
    expect(schema.parse(["x", "y"])).toEqual(["x", "y"]);
    expect(schema.parse("")).toEqual([]);

    const nums = csv(z.coerce.number());
    expect(nums.parse("1,2,3")).toEqual([1, 2, 3]);
    expect(nums.safeParse("1,foo").success).toBe(false);
  });

  it("nonEmptyString trims and enforces bounds", () => {
    expect(nonEmptyString().parse("  hi ")).toBe("hi");
    expect(nonEmptyString().safeParse("   ").success).toBe(false);
    expect(nonEmptyString(3).safeParse("abcd").success).toBe(false);
  });

  it("search combines an optional query with pagination", () => {
    expect(search().parse({ q: "hello" })).toMatchObject({
      q: "hello",
      page: 1,
      limit: 20,
      offset: 0,
    });
    expect(search().parse({})).toMatchObject({ page: 1, limit: 20 });
  });
});
