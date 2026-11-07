import { Response } from "express";

/**
 * * Standardized API Success Response Helper
 *
 * Errors do not go through here. Handlers `throw new AppError(...)` and the
 * global error handler renders the one envelope via
 * `src/shared/utils/error-envelope.ts`. An `errorResponse()` helper used to sit
 * beside this one with zero production callers and a fourth, incompatible body
 * shape; it was removed in the C3 error-envelope work rather than wired in.
 */

interface SuccessResponse<T> {
  status: "success";
  message: string;
  code?: number | string;
  data: T | null;
  success?: true;
}

/**
 * Sends a success response.
 *
 * @param res - Express response object
 * @param statusCode - HTTP status code
 * @param data - Data to be sent in the response (default: null)
 * @param message - Success message (default: "Success")
 * @param code - Optional custom code for the response
 */
const successResponse = <T>(
  res: Response,
  statusCode: number,
  data: T | null,
  message = "Success",
  code?: number | string,
): Response<SuccessResponse<T>> => {
  return res.status(statusCode).json({
    status: "success",
    message,
    data,
    code,
    success: true,
  });
};

export { successResponse };
