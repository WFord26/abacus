import { ZodError, type ZodSchema } from "zod";

import { InvoicingServiceError } from "./errors";

export function parseSchema<T>(schema: ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const path = issue?.path.join(".") || "body";

      throw new InvoicingServiceError(
        "VALIDATION_ERROR",
        issue?.message ?? "Invalid request",
        400,
        {
          path,
        }
      );
    }

    throw error;
  }
}
