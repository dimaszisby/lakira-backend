import { randomUUID } from "node:crypto";
import { buildWiredAuthFeature } from "@/composition/auth.js";
import type {
  EmailMessage,
  EmailSender,
} from "@/features/auth/application/ports/EmailSender.js";
import type { IncomingMessage } from "@/shared/application/ports/MessageHandlerPort.js";
import { QUEUES } from "@/shared/infrastructure/queue/topology.js";
import { models } from "@/infrastructure/db/models.js";
import { TEST_ORG_ID, createUserRow } from "../../helpers/db-fixtures.js";

/**
 * worker-cancel-and-one-connection-per-job D-02 (audit 2026-10-20, X62). A job
 * handed to runOnce holds one connection for its transaction. A read inside it
 * that skips the transaction asks the pool for a second, and once every
 * connection is held by a job waiting for another, nothing moves until the
 * pool's acquire timeout. The pool here is Sequelize's default of five, so
 * eight jobs of each kind at once is more than it holds.
 */
const JOBS_PER_KIND = 8;
const WITHIN_MS = 15_000;

class RecordingEmailSender implements EmailSender {
  sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

const job = (body: Record<string, string>): IncomingMessage => ({
  content: Buffer.from(JSON.stringify(body)),
  properties: { messageId: randomUUID() },
});

describe("email jobs, more at once than the pool holds", () => {
  it(
    "all complete promptly, each sending once",
    async () => {
      const sender = new RecordingEmailSender();
      const {
        sendVerificationEmailHandler,
        sendPasswordResetEmailHandler,
        sendInviteEmailHandler,
      } = buildWiredAuthFeature({ emailSender: sender });

      const users = [];
      for (let i = 0; i < JOBS_PER_KIND * 2; i++) {
        users.push(await createUserRow());
      }
      const invites = [];
      for (let i = 0; i < JOBS_PER_KIND; i++) {
        invites.push(
          await models.OrganizationInvite.create({
            id: randomUUID(),
            organizationId: TEST_ORG_ID,
            email: `invitee-${i}-${randomUUID()}@example.com`,
            role: "member",
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          }),
        );
      }

      const started = Date.now();
      await Promise.all([
        ...users.slice(0, JOBS_PER_KIND).map((user) =>
          sendVerificationEmailHandler.handle(job({ userId: user.id }), {
            queue: QUEUES.AUTH_SEND_VERIFICATION_EMAIL,
          }),
        ),
        ...users.slice(JOBS_PER_KIND).map((user) =>
          sendPasswordResetEmailHandler.handle(job({ userId: user.id }), {
            queue: QUEUES.AUTH_SEND_PASSWORD_RESET_EMAIL,
          }),
        ),
        ...invites.map((invite) =>
          sendInviteEmailHandler.handle(job({ inviteId: invite.id }), {
            queue: QUEUES.AUTH_SEND_INVITE_EMAIL,
          }),
        ),
      ]);
      const elapsed = Date.now() - started;

      expect(elapsed).toBeLessThan(WITHIN_MS);
      expect(sender.sent).toHaveLength(JOBS_PER_KIND * 3);
      const recipients = new Set(sender.sent.map((message) => message.to));
      expect(recipients.size).toBe(JOBS_PER_KIND * 3);
    },
    WITHIN_MS * 2,
  );
});
