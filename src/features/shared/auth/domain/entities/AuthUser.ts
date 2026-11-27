export type AuthUserProps = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  isPublicProfile: boolean;
  emailVerifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/** The fields a method of `AuthUser` can change, and so the ones `save` may write. */
export type AuthUserChangedField =
  | "email"
  | "username"
  | "passwordHash"
  | "isPublicProfile"
  | "emailVerifiedAt";

export class AuthUser {
  /**
   * What this instance's methods changed since it was loaded. A save writes
   * these and nothing else, so a field read before another request changed it
   * is never written back (credential-changes D-11).
   */
  private changed = new Set<AuthUserChangedField>();

  private constructor(private props: AuthUserProps) {}

  static fromPersistence(props: AuthUserProps) {
    return new AuthUser(props);
  }

  get id() {
    return this.props.id;
  }
  get email() {
    return this.props.email;
  }
  get username() {
    return this.props.username;
  }
  get passwordHash() {
    return this.props.passwordHash;
  }
  get isPublicProfile() {
    return this.props.isPublicProfile;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get deletedAt() {
    return this.props.deletedAt;
  }
  get emailVerifiedAt(): Date | null {
    return this.props.emailVerifiedAt ?? null;
  }
  get changedFields(): ReadonlySet<AuthUserChangedField> {
    return this.changed;
  }

  setEmailVerifiedAt(date: Date) {
    this.props.emailVerifiedAt = date;
    this.touch("emailVerifiedAt");
  }

  changeEmail(next: string) {
    const trimmed = next.trim().toLowerCase();
    if (!trimmed) throw new Error("Email cannot be empty");
    this.props.email = trimmed;
    this.touch("email");
  }

  changeUsername(next: string) {
    const trimmed = next.trim();
    if (!trimmed) throw new Error("Username cannot be empty");
    this.props.username = trimmed;
    this.touch("username");
  }

  togglePublicProfile(value: boolean) {
    this.props.isPublicProfile = value;
    this.touch("isPublicProfile");
  }

  setPasswordHash(hash: string) {
    this.props.passwordHash = hash;
    this.touch("passwordHash");
  }

  private touch(field: AuthUserChangedField) {
    this.changed.add(field);
    this.props.updatedAt = new Date();
  }
}
