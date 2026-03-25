import { z } from "zod";

import { IdentityServiceError } from "./errors";

export function parseSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const details = Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join(".") || "root", issue.message])
  );

  throw new IdentityServiceError("VALIDATION_ERROR", "Invalid request payload", 400, details);
}
