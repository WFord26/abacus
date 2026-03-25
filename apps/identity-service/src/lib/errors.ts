export type ErrorDetails = Record<string, string | number | boolean | null>;

export class IdentityServiceError extends Error {
  code: string;
  details: ErrorDetails | undefined;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number, details?: ErrorDetails) {
    super(message);
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}
