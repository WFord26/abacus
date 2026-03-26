export class InvoicingServiceError extends Error {
  code: string;
  details: Record<string, string | number | boolean | null> | undefined;
  statusCode: number;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, string | number | boolean | null>
  ) {
    super(message);
    this.name = "InvoicingServiceError";
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}
