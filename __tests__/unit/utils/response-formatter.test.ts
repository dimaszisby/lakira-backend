import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { successResponse } from "@/utils/response-formatter.js";
import type { Response } from "express";

// Minimal Express response stub: both status/json return the response so we can assert chaining.
const createResponse = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response & {
    status: jest.MockedFunction<(code: number) => Response>;
    json: jest.MockedFunction<(payload: unknown) => Response>;
  };
  (res.status as any).mockReturnValue(res);
  (res.json as any).mockReturnValue(res);
  return res;
};

describe("response-formatter", () => {
  let res: ReturnType<typeof createResponse>;

  beforeEach(() => {
    res = createResponse();
    jest.clearAllMocks();
  });

  describe("successResponse", () => {
    it("sends success payload with defaults", () => {
      const payload = { id: "abc" };

      successResponse(res, 201, payload);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: "success",
        message: "Success",
        data: payload,
        code: undefined,
        success: true,
      });
    });

    it("supports custom message and code", () => {
      successResponse(res, 200, null, "Created", "metric.created");

      expect(res.json).toHaveBeenCalledWith({
        status: "success",
        message: "Created",
        data: null,
        code: "metric.created",
        success: true,
      });
    });
  });
});
