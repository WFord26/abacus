export class ReportingServiceError extends Error {
  readonly code: string;
  readonly details: Record<string, string | number | boolean | null> | undefined;
  readonly statusCode: number;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, string | number | boolean | null>
  ) {
    super(message);
    this.name = "ReportingServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
