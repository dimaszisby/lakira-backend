import { randomUUID } from "node:crypto";
import { buildWiredAuthFeature } from "@/composition/auth.js";
import type {
  EmailMessage,
  EmailSender,
} from "@/features/auth/application/ports/EmailSender.js";
import type { IncomingMessage } from "@/shared/application/ports/MessageHandlerPort.js";
import { QUEUES } from "@/shared/infrastructure/queue/topology.js";
import { JobSlots } from "@/shared/infrastructure/queue/JobSlots.js";
import { env } from "@/config/envManager.js";
import sequelize from "@/config/db.js";
import { createUserRow } from "../../helpers/db-fixtures.js";

/**
 * #310 (audit 2026-11-14, X62; ADR-0100). Each job holds one connection while
 * it sends, so with more jobs running than the pool holds, the rest wait on the
 * pool, and past its 60 s acquire timeout they fail into retry. The worker
 * gates its jobs to `DB_POOL_MAX`; gated the same way, no job waits on the pool
 * however slow the sender, and the ungated control shows the test can tell.
 */
const JOBS = 12;
const SEND_MS = 300;

/** A provider that answers slowly, and counts how many sends overlap. */
class SlowEmailSender implements EmailSender {
  sent: EmailMessage[] = [];
  inFlight = 0;
  mostInFlight = 0;

  async send(message: EmailMessage): Promise<void> {
    this.inFlight++;
    this.mostInFlight = Math.max(this.mostInFlight, this.inFlight);
    await new Promise((resolve) => setTimeout(resolve, SEND_MS));
    this.inFlight--;
    this.sent.push(message);
  }
}

const job = (userId: string): IncomingMessage => ({
  content: Buffer.from(JSON.stringify({ userId })),
  properties: { messageId: randomUUID() },
});

type PoolStats = { using: number; waiting: number; maxSize: number };

/**
 * The most connections asked of the pool at once, in use plus waiting, sampled
 * while the jobs run. `waiting` alone also counts an ask whose connection is
 * still being opened, so a cold pool shows waiters it will serve at once; asks
 * beyond `maxSize` are the ones that wait on the acquire timeout.
 */
const watchPool = () => {
  const pool = (sequelize.connectionManager as unknown as { pool: PoolStats })
    .pool;
  let mostAsked = 0;
  const timer = setInterval(() => {
    mostAsked = Math.max(mostAsked, pool.using + pool.waiting);
  }, 5);
  return {
    maxSize: pool.maxSize,
    stop: () => {
      clearInterval(timer);
      return mostAsked;
    },
  };
};

const run = async (gate: JobSlots | null) => {
  const sender = new SlowEmailSender();
  const { sendVerificationEmailHandler } = buildWiredAuthFeature({
    emailSender: sender,
  });
  const users = [];
  for (let i = 0; i < JOBS; i++) users.push(await createUserRow());

  const handle = (userId: string) =>
    sendVerificationEmailHandler.handle(job(userId), {
      queue: QUEUES.AUTH_SEND_VERIFICATION_EMAIL,
    });

  const watch = watchPool();
  await Promise.all(
    users.map(async (user) => {
      if (!gate) return handle(user.id);
      // As RabbitMQConsumer does: a slot first, then the job, then the release.
      const release = await gate.acquire();
      try {
        await handle(user.id);
      } finally {
        release();
      }
    }),
  );
  return { sender, mostAsked: watch.stop(), maxSize: watch.maxSize };
};

describe("email jobs, more at once than the pool holds, with a slow provider", () => {
  it("gated to the pool, never wait on it, and each sends once", async () => {
    expect(JOBS).toBeGreaterThan(env.DB_POOL_MAX);

    const { sender, mostAsked, maxSize } = await run(
      new JobSlots(env.DB_POOL_MAX),
    );

    expect(maxSize).toBe(env.DB_POOL_MAX);
    expect(mostAsked).toBeLessThanOrEqual(maxSize);
    expect(sender.mostInFlight).toBeLessThanOrEqual(env.DB_POOL_MAX);
    expect(sender.sent).toHaveLength(JOBS);
    expect(new Set(sender.sent.map((m) => m.to)).size).toBe(JOBS);
  }, 30_000);

  // The control: without the gate the same jobs queue on the pool, which is
  // where the acquire timeout fails them into retry under a slower provider.
  it("ungated, queue on the pool", async () => {
    const { sender, mostAsked, maxSize } = await run(null);

    expect(mostAsked).toBeGreaterThan(maxSize);
    expect(sender.sent).toHaveLength(JOBS);
  }, 30_000);
});
