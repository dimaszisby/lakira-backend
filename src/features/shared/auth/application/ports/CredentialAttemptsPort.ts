/**
 * The per-user count of current-password attempts at the credential routes
 * (credential-changes D-04). The HTTP edge reserves each attempt before it is
 * judged, and answers 429 past the limit; `ConfirmCurrentPassword` clears the
 * count when the password is right. A wrong one stays counted.
 */
export interface CredentialAttemptsPort {
  reset(userId: string): Promise<void>;
}
