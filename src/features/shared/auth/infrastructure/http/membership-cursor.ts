import type { MembershipPosition } from "../../domain/repositories/MembershipRepository.js";

/**
 * The `after` of the organization lists: opaque base64url of the last membership a
 * page read (api-tooling-residuals D-09). A value that does not decode to one is
 * refused by the query schema with a 400.
 */
export const encodeMembershipCursor = (position: MembershipPosition): string =>
  Buffer.from(
    JSON.stringify({ j: position.joinedAt.toISOString(), i: position.id }),
  ).toString("base64url");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const decodeMembershipCursor = (
  cursor: string,
): MembershipPosition | null => {
  try {
    const { j, i } = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { j?: unknown; i?: unknown };
    if (typeof j !== "string" || typeof i !== "string" || !UUID.test(i)) {
      return null;
    }
    const joinedAt = new Date(j);
    return Number.isNaN(joinedAt.getTime()) ? null : { joinedAt, id: i };
  } catch {
    return null;
  }
};
