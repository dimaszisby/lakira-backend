import { envelopeStatus } from "@/shared/utils/error-envelope.js";

class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: "fail" | "error";
  public readonly isOperational: boolean;
  /**
   * Creates an instance of AppError.
   * @param message - Error message.
   * @param statusCode - HTTP status code.
   */

  constructor(message: string, statusCode: number) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // Maintain correct prototype chain

    // Names the class in a log line, as DomainError does (v6-small-items D-01).
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.status = envelopeStatus(statusCode);
    this.isOperational = true; // Distinguish operational errors from programming errors

    Error.captureStackTrace(this);
  }
}

export default AppError;
