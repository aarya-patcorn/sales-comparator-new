import type { User } from "../../generated/prisma/client.js";
import type { UserRole } from "../../generated/prisma/enums.js";

/**
 * The only user shape that leaves the API.
 *
 * Serializing the raw Prisma row would expose `googleSub` and every other
 * internal column, so responses go through here instead.
 */
export type PublicUser = {
  id: string;
  name: string | null;
  role: UserRole;
  mobileNumber: string | null;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    mobileNumber: user.mobileNumber,
  };
}

/**
 * Admin-facing shape: email and avatar are useful to the admin SPA, but
 * `googleSub` stays internal.
 */
export type PublicAdmin = {
  id: string;
  name: string | null;
  role: UserRole;
  email: string | null;
  avatarUrl: string | null;
};

export function toPublicAdmin(user: User): PublicAdmin {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}
