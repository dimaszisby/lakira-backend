export interface UserResponseDTO {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly isPublicProfile: boolean;
  readonly emailVerifiedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
