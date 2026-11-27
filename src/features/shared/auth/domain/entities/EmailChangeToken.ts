export type EmailChangeTokenProps = {
  id: string;
  userId: string;
  newEmail: string;
  oldEmail: string;
  /** Null until the job mints the token (credential-changes D-05). */
  tokenHash: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

/**
 * A pending email change (credential-changes D-02). Spent once: by its
 * confirmation, or by a later request, a password change or a reset that
 * supersedes it.
 */
export class EmailChangeToken {
  private constructor(private props: EmailChangeTokenProps) {}

  static fromPersistence(props: EmailChangeTokenProps) {
    return new EmailChangeToken(props);
  }

  get id() {
    return this.props.id;
  }
  get userId() {
    return this.props.userId;
  }
  get newEmail() {
    return this.props.newEmail;
  }
  get oldEmail() {
    return this.props.oldEmail;
  }
  get tokenHash() {
    return this.props.tokenHash;
  }
  get expiresAt() {
    return this.props.expiresAt;
  }
  get usedAt() {
    return this.props.usedAt;
  }
  get createdAt() {
    return this.props.createdAt;
  }

  isUsed(): boolean {
    return this.props.usedAt !== null;
  }

  isExpired(now: Date = new Date()): boolean {
    return this.props.expiresAt.getTime() <= now.getTime();
  }

  isUsable(now: Date = new Date()): boolean {
    return !this.isUsed() && !this.isExpired(now);
  }
}
