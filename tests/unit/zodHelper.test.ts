import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatZodError } from "../../src/utils/zodHelper.js";

describe("formatZodError", () => {
  it("maps nested issues to { path, message }", () => {
    const result = z
      .object({
        name: z.string().min(3, "Name too short"),
      })
      .safeParse({ name: "a" });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(formatZodError(result.error)).toEqual([
      {
        path: "name",
        message: "Name too short",
      },
    ]);
  });

  it('uses "(root)" when the issue has no path', () => {
    const result = z.string().min(6, "Too short").safeParse("a");

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(formatZodError(result.error)).toEqual([
      {
        path: "(root)",
        message: "Too short",
      },
    ]);
  });
});
