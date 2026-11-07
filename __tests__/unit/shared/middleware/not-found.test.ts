import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response } from "express";
import { notFoundHandler } from "@/shared/middleware/not-found.js";

const createRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
};

describe("notFoundHandler", () => {
  it("answers an unmatched route with the 404 envelope", () => {
    const req = { method: "GET", originalUrl: "/api/v1/nope" } as Request;
    const res = createRes();

    notFoundHandler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Route not found",
    });
  });

  it("does not reflect the request path", () => {
    const req = {
      method: "POST",
      originalUrl: "/<script>alert(1)</script>",
    } as Request;
    const res = createRes();

    notFoundHandler(req, res as unknown as Response);

    const [body] = res.json.mock.calls[0] as [{ message: string }];
    expect(body.message).not.toContain("script");
  });
});
