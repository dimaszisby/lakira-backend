import { buildWiredAuthFeature } from "@/composition/auth.js";
import type {
  EmailMessage,
  EmailSender,
} from "@/features/auth/application/ports/EmailSender.js";
import type { IncomingMessage } from "@/shared/application/ports/MessageHandlerPort.js";
import type {
  MessagePayload,
  MessageQueuePort,
  PublishOptions,
} from "@/shared/application/ports/MessageQueuePort.js";
import { QUEUES } from "@/shared/application/messaging/job-routes.js";
import { drainBackgroundTasks } from "@/utils/background-tasks.js";
import { TEST_ORG_ID, createUserRow } from "../../helpers/db-fixtures.js";

/**
 * Kit queue-failure-paths D-03 (audit 2026-10-20 X68). A publish that times out may still
 * have reached the broker. The fallback then sent the email in process and the worker sent it
 * again, and the second token replaced the first. Now the fallback is the job itself, under
 * the message id it tried to publish, so whichever runs second is a duplicate.
 */
class RecordingEmailSender implements EmailSender {
  sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

type Published = { payload: MessagePayload; options: PublishOptions };

/**
 * A publish that reached the broker and then timed out. `beforeTimeout` stands for the worker
 * taking the message while the confirm is still outstanding.
 */
class TimedOutQueue implements MessageQueuePort {
  published: Published[] = [];
  beforeTimeout: (job: Published) => Promise<void> = async () => undefined;

  isEnabled(): boolean {
    return true;
  }

  async publish(
    _exchange: string,
    payload: MessagePayload,
    options: PublishOptions,
  ): Promise<void> {
    const job = { payload, options };
    this.published.push(job);
    await this.beforeTimeout(job);
    throw new Error("Timeout");
  }

  async close(): Promise<void> {}
}

/** The message the worker would receive for `job`. */
const delivered = ({ payload, options }: Published): IncomingMessage => ({
  content: Buffer.from(JSON.stringify(payload)),
  properties: { messageId: options.messageId },
});

const setup = () => {
  const sender = new RecordingEmailSender();
  const queue = new TimedOutQueue();
  const feature = buildWiredAuthFeature({
    emailSender: sender,
    messageQueue: queue,
  });
  return { sender, queue, feature };
};

describe("an email whose publish timed out after reaching the broker", () => {
  describe("the verification email", () => {
    const worker = (
      feature: ReturnType<typeof setup>["feature"],
      job: Published,
    ) =>
      feature.sendVerificationEmailHandler.handle(delivered(job), {
        queue: QUEUES.AUTH_SEND_VERIFICATION_EMAIL,
      });

    it("is sent once when the fallback runs first", async () => {
      const { sender, queue, feature } = setup();
      const user = await createUserRow();

      await feature.scheduleEmailVerification.execute({
        userId: user.id,
        reason: "resend",
      });
      await drainBackgroundTasks();
      await worker(feature, queue.published[0]);

      expect(sender.sent).toHaveLength(1);
    });

    it("is sent once when the worker runs first", async () => {
      const { sender, queue, feature } = setup();
      queue.beforeTimeout = (job) => worker(feature, job);
      const user = await createUserRow();

      await feature.scheduleEmailVerification.execute({
        userId: user.id,
        reason: "resend",
      });
      await drainBackgroundTasks();

      expect(sender.sent).toHaveLength(1);
    });
  });

  describe("the password-reset email", () => {
    const worker = (
      feature: ReturnType<typeof setup>["feature"],
      job: Published,
    ) =>
      feature.sendPasswordResetEmailHandler.handle(delivered(job), {
        queue: QUEUES.AUTH_SEND_PASSWORD_RESET_EMAIL,
      });

    it("is sent once when the fallback runs first", async () => {
      const { sender, queue, feature } = setup();
      const user = await createUserRow();

      await feature.requestPasswordReset.execute({ email: user.email });
      await worker(feature, queue.published[0]);

      expect(sender.sent).toHaveLength(1);
    });

    it("is sent once when the worker runs first", async () => {
      const { sender, queue, feature } = setup();
      queue.beforeTimeout = (job) => worker(feature, job);
      const user = await createUserRow();

      await feature.requestPasswordReset.execute({ email: user.email });

      expect(sender.sent).toHaveLength(1);
    });
  });

  describe("the invite email", () => {
    const worker = (
      feature: ReturnType<typeof setup>["feature"],
      job: Published,
    ) =>
      feature.sendInviteEmailHandler.handle(delivered(job), {
        queue: QUEUES.AUTH_SEND_INVITE_EMAIL,
      });

    const invite = async (feature: ReturnType<typeof setup>["feature"]) => {
      const inviter = await createUserRow();
      await feature.inviteUserToOrganization.execute({
        organizationId: TEST_ORG_ID,
        email: `invitee-${inviter.id}@example.com`,
        role: "member",
        inviterUserId: inviter.id,
        inviterRole: "owner",
      });
    };

    it("is sent once when the fallback runs first", async () => {
      const { sender, queue, feature } = setup();

      await invite(feature);
      await worker(feature, queue.published[0]);

      expect(sender.sent).toHaveLength(1);
    });

    it("is sent once when the worker runs first", async () => {
      const { sender, queue, feature } = setup();
      queue.beforeTimeout = (job) => worker(feature, job);

      await invite(feature);

      expect(sender.sent).toHaveLength(1);
    });
  });
});
