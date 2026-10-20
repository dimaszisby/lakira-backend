import { randomUUID } from "crypto";
import { models } from "@/infrastructure/db/models.js";
import { SequelizeMessageIdempotency } from "@/shared/infrastructure/queue/SequelizeMessageIdempotency.js";

/**
 * Kit queue-design-hardening, D-01 (audit 2026-09-29, R8). A message is recorded as
 * processed per queue. Keyed on its id alone, a second queue bound to the same routing
 * key received the same id, found it recorded, and skipped work it had never done.
 */
describe("SequelizeMessageIdempotency", () => {
  const idempotency = new SequelizeMessageIdempotency();
  const work = jest.fn(async () => undefined);

  beforeEach(() => work.mockClear());

  it("processes the same message once on each queue it is delivered to", async () => {
    const messageId = randomUUID();

    await expect(
      idempotency.runOnce({ messageId, queue: "q.one" }, work),
    ).resolves.toBe("processed");
    await expect(
      idempotency.runOnce({ messageId, queue: "q.two" }, work),
    ).resolves.toBe("processed");

    expect(work).toHaveBeenCalledTimes(2);
    expect(await models.ProcessedMessage.count({ where: { messageId } })).toBe(
      2,
    );
  });

  it("skips a second delivery to the same queue", async () => {
    const messageId = randomUUID();

    await idempotency.runOnce({ messageId, queue: "q.one" }, work);
    await expect(
      idempotency.runOnce({ messageId, queue: "q.one" }, work),
    ).resolves.toBe("duplicate");

    expect(work).toHaveBeenCalledTimes(1);
  });
});
