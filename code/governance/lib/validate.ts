import { z } from "zod";

/**
 * Wraps a ZodError from a rejected parse. `parseStrict` throws this instead
 * of letting a raw `z.ZodError` escape, so `validationResponse` has a single,
 * narrow input type to build the 422 body from -- not "whatever shape this
 * Zod version's error object happens to have this week."
 */
export class ValidationError extends Error {
  readonly zodError: z.ZodError;

  constructor(zodError: z.ZodError) {
    super("validation failed");
    this.name = "ValidationError";
    this.zodError = zodError;
  }
}

/**
 * Parse `body` against `schema` (build the schema with `.strict()` yourself
 * -- this function doesn't force it) and return the typed result, or throw
 * `ValidationError` on failure.
 *
 * This is the Zod-side half of the port of `code/policy/app/main.py`'s
 * `extra="forbid"` posture: a schema built with `.strict()` rejects any key
 * the caller didn't ask for (Zod's `unrecognized_keys` issue), so a bug that
 * sends prompt text alongside metadata gets a 422 instead of being accepted
 * and stored.
 */
export function parseStrict<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  return result.data;
}

/**
 * One issue in the 422 response body. Deliberately an allowlist of exactly
 * these three fields -- never a spread of the underlying Zod issue. Zod
 * issues carry other fields depending on issue code (`expected`, `keys`,
 * `unionErrors`, and, on some codes in some Zod versions, a `received` that
 * can hold the actual rejected value) and a spread would forward whichever
 * of those happen to be present. This is the exact bug being ported away
 * from: `code/policy/app/main.py`'s handler exists because FastAPI's
 * default 422 handler serialises Pydantic's `errors()` verbatim, and for a
 * `missing`-field error `input` can be the entire request body. The fix
 * there, and here, is the same shape: name which field was rejected and
 * why, never copy through what was rejected.
 */
interface FormattedIssue {
  code: string;
  path: (string | number)[];
  message: string;
}

function formatIssue(issue: z.ZodIssue): FormattedIssue {
  return {
    code: issue.code,
    // Zod's `path` is `PropertyKey[]` (string | number | symbol). A `symbol`
    // element would silently become JSON `null` under `JSON.stringify` --
    // stringify it explicitly instead so the path stays legible and
    // nothing is dropped without a trace.
    path: issue.path.map((segment) =>
      typeof segment === "symbol" ? segment.toString() : segment,
    ),
    // `issue.message` is Zod's own generated (or custom-validator) text.
    // For built-in issue codes this names the expected shape ("expected
    // string, received number") using a TYPE name, never the actual value.
    // A custom `.refine()`/`.superRefine()` message is caller-authored --
    // callers must follow the same rule as this file: describe the rule
    // that was violated, never interpolate the value that violated it
    // (mirror `finding_hash`'s validator in code/policy/app/models.py).
    message: issue.message,
  };
}

/**
 * Build the 422 response for a failed `parseStrict` call. Body shape is
 * `{ detail: [{code, path, message}, ...] }`, matching the field names a
 * developer needs to fix the request -- and nothing else. This is the
 * Next.js Route Handler equivalent of `code/policy/app/main.py`'s
 * `_validation_error` exception handler: same scrubbing rule (keep
 * `type`/`loc`(`code`/`path`)/`msg`(`message`), drop `input`/`ctx`),
 * ported to Zod's issue shape instead of Pydantic's.
 */
export function validationResponse(err: ValidationError): Response {
  const detail = err.zodError.issues.map(formatIssue);
  return new Response(JSON.stringify({ detail }), {
    status: 422,
    headers: { "content-type": "application/json" },
  });
}
