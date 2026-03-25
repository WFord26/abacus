import type {
  IdentityMembershipRecord,
  IdentityMembershipWithOrganizationRecord,
} from "../repositories/identity.repo";
import type {
  Membership,
  MembershipWithOrganization,
  Organization,
  User,
} from "@wford26/shared-types";

export function sanitizeUser(user: User) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function sanitizeOrganization(organization: Organization) {
  return organization;
}

export function sanitizeMembership(membership: IdentityMembershipRecord): Membership & {
  user: ReturnType<typeof sanitizeUser>;
} {
  return {
    createdAt: membership.createdAt,
    id: membership.id,
    organizationId: membership.organizationId,
    role: membership.role,
    status: membership.status,
    user: sanitizeUser(membership.user),
    userId: membership.userId,
  };
}

export function sanitizeMembershipWithOrganization(
  membership: IdentityMembershipWithOrganizationRecord
): MembershipWithOrganization {
  return {
    createdAt: membership.createdAt,
    id: membership.id,
    organization: sanitizeOrganization(membership.organization),
    organizationId: membership.organizationId,
    role: membership.role,
    status: membership.status,
    userId: membership.userId,
  };
}
