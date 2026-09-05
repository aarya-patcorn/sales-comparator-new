import { describe, expect, it } from "vitest";

import {
  MAX_PAGE_SIZE,
  normalizeMobile,
  paginationSchema,
  safeNormalizeMobile,
  slugSchema,
  toSkipTake,
  uuidParamSchema,
} from "./common.js";

describe("paginationSchema", () => {
  it("applies defaults and coerces query strings", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginationSchema.parse({ page: "3", pageSize: "50" })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it("caps pageSize and rejects nonsense", () => {
    expect(
      paginationSchema.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success,
    ).toBe(false);
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: 1.5 }).success).toBe(false);
  });

  it("maps to skip/take", () => {
    expect(toSkipTake({ page: 3, pageSize: 20 })).toEqual({
      skip: 40,
      take: 20,
    });
  });
});

describe("uuidParamSchema / slugSchema", () => {
  it("validates ids", () => {
    expect(
      uuidParamSchema.safeParse({
        id: "f8a25f63-0a19-408d-a28f-c96ef2d7d5f3",
      }).success,
    ).toBe(true);
    expect(uuidParamSchema.safeParse({ id: "K90" }).success).toBe(false);
    expect(slugSchema.safeParse("myk_laticrete").success).toBe(true);
    expect(slugSchema.safeParse("MYK Laticrete").success).toBe(false);
  });
});

describe("normalizeMobile", () => {
  it("strips non-digits", () => {
    expect(normalizeMobile("+91 98765-43210")).toBe("919876543210");
    expect(normalizeMobile("(022) 2222 3333")).toBe("02222223333");
  });

  it("rejects too few or too many digits", () => {
    expect(safeNormalizeMobile("12345")).toBeNull();
    expect(safeNormalizeMobile("1234567890123456")).toBeNull();
    expect(safeNormalizeMobile("abcdefgh")).toBeNull();
    expect(() => normalizeMobile("12345")).toThrow();
  });

  it("accepts the 7 and 15 digit bounds", () => {
    expect(normalizeMobile("1234567")).toBe("1234567");
    expect(normalizeMobile("123456789012345")).toBe("123456789012345");
  });
});
