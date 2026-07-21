import { describe, expect, test } from "vitest";
import { z } from "zod";
import { parseStrict, strictObject, ValidationError, validationResponse } from "./validate";

/**
 * Test-only plumbing: parseStrict throws ValidationError on a bad parse;
 * this just does the throw/catch so each test reads as one line. Not part
 * of the module's public surface — validate.ts exports only parseStrict
 * and validationResponse.
 */
function catchParse<T>(schema: z.ZodType<T>, body: unknown): ValidationError {
  try {
    parseStrict(schema, body);
  } catch (err) {
    if (err instanceof ValidationError) return err;
    throw err;
  }
  throw new Error("expected parseStrict to throw ValidationError, but it returned");
}

describe("validationResponse", () => {
  test("422 body never echoes the rejected value", async () => {
    const schema = z.object({ pseudo_id: z.string() }).strict();
    const res = validationResponse(
      catchParse(schema, { pseudo_id: 1, prompt: "my NRIC 900101-01-1234" }),
    );
    const text = await res.text();
    expect(res.status).toBe(422);
    expect(text).not.toContain("900101"); // no leaked value
    expect(text).not.toContain("my NRIC");
    expect(text).toContain("unrecognized_keys"); // strict rejects `prompt`
  });

  test("missing-field error does not echo the request body", async () => {
    // The FastAPI original's bug (app/main.py:31): a `missing`-field error's
    // `input` can be the ENTIRE request body, not just the missing field --
    // so a body carrying sensitive data in an allowed field still leaks it
    // via the error for a DIFFERENT, missing field. Reproduce that shape:
    // `pseudo_id` is missing, `note` is present, allowed, and sensitive.
    const schema = z
      .object({ pseudo_id: z.string(), note: z.string().optional() })
      .strict();
    const err = catchParse(schema, { note: "my NRIC 900101-01-1234" });
    const res = validationResponse(err);
    const text = await res.text();
    expect(res.status).toBe(422);
    expect(text).not.toContain("900101");
    expect(text).not.toContain("my NRIC");
  });

  test("response body never includes a received/input field from the issue", async () => {
    const schema = z.object({ pseudo_id: z.string() }).strict();
    const err = catchParse(schema, { pseudo_id: 12345 });
    const res = validationResponse(err);
    const body = (await res.json()) as { detail: Array<Record<string, unknown>> };
    for (const issue of body.detail) {
      expect(Object.keys(issue).sort()).toEqual(["code", "message", "path"]);
      expect(issue).not.toHaveProperty("received");
      expect(issue).not.toHaveProperty("input");
    }
  });
});

describe("parseStrict", () => {
  test("returns the parsed value on success", () => {
    const schema = z.object({ pseudo_id: z.string() }).strict();
    const result = parseStrict(schema, { pseudo_id: "abc" });
    expect(result).toEqual({ pseudo_id: "abc" });
  });

  test("throws ValidationError (not a raw ZodError) on failure", () => {
    const schema = z.object({ pseudo_id: z.string() }).strict();
    expect(() => parseStrict(schema, {})).toThrow(ValidationError);
  });
});

describe("strictObject", () => {
  test("rejects unknown keys the same way a manually-.strict()'d schema does", () => {
    const schema = strictObject({ pseudo_id: z.string() });
    const err = catchParse(schema, { pseudo_id: "abc", prompt: "extra field" });
    expect(err.zodError.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(
      true,
    );
  });
});
