import { describe, it, expect, jest } from "@jest/globals";
import type { Response } from "express";
import {
  buildErrorEnvelope,
  envelopeStatus,
  sendError,
} from "@/shared/utils/error-envelope.js";

const createResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
};

describe("error-envelope", () => {
  describe("envelopeStatus", () => {
    it.each([
      [400, "fail"],
      [404, "fail"],
      [405, "fail"],
      [409, "fail"],
      [499, "fail"],
      [500, "error"],
      [503, "error"],
    ])("maps %s to %s", (code, expected) => {
      expect(envelopeStatus(code as number)).toBe(expected);
    });
  });

  describe("buildErrorEnvelope", () => {
    it("always carries status and message", () => {
      expect(buildErrorEnvelope(404, "Resource not found")).toEqual({
        status: "fail",
        message: "Resource not found",
      });
    });

    it("omits errors when the list is absent or empty", () => {
      expect(buildErrorEnvelope(400, "Bad Request", { errors: [] })).toEqual({
        status: "fail",
        message: "Bad Request",
      });
    });

    it("includes field issues when present", () => {
      expect(
        buildErrorEnvelope(400, "Validation failed", {
          errors: [{ field: "body.name", message: "Required" }],
        }),
      ).toEqual({
        status: "fail",
        message: "Validation failed",
        errors: [{ field: "body.name", message: "Required" }],
      });
    });

    it("includes stack only when one is supplied", () => {
      expect(
        buildErrorEnvelope(500, "Internal Server Error", { stack: "at x" }),
      ).toEqual({
        status: "error",
        message: "Internal Server Error",
        stack: "at x",
      });
    });
  });

  describe("sendError", () => {
    it("writes the envelope with the given status code", () => {
      const res = createResponse();

      sendError(res, 405, "Method Not Allowed");

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({
        status: "fail",
        message: "Method Not Allowed",
      });
    });
  });
});
