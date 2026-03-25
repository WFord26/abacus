import { IdentityServiceError } from "../lib/errors";

import type { IdentityMembershipRecord, IdentityRepository } from "../repositories/identity.repo";
import type { MembershipWithOrganization, Organization, Role, User } from "@wford26/shared-types";

type CreateOrganizationRequest = {
  businessType?: string | null;
  name: string;
  userId: string;
};

type InviteMemberRequest = {
  currentUserId: string;
  email: string;
  organizationId: string;
  role: Role;
};

type UpdateMemberRoleRequest = {
  currentUserId: string;
  organizationId: string;
  role: Role;
  userId: string;
};

type UpdateOrganizationRequest = {
  businessType?: string | null;
  currentUserId: string;
  name?: string;
  organizationId: string;
};

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "organization";
}

export function createIdentityService(repository: IdentityRepository) {
  async function ensureActiveMembership(userId: string, organizationId: string) {
    const membership = await repository.findMembershipByUserIdAndOrganizationId(
      userId,
      organizationId
    );

    if (!membership || membership.status !== "active") {
      throw new IdentityServiceError(
        "FORBIDDEN",
        "You do not have access to this organization",
        403
      );
    }

    return membership;
  }

  async function ensureMembershipManager(userId: string, organizationId: string) {
    const membership = await ensureActiveMembership(userId, organizationId);

    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new IdentityServiceError(
        "FORBIDDEN",
        "Only organization owners or admins can perform this action",
        403
      );
    }

    return membership;
  }

  async function ensureOwnerMembership(userId: string, organizationId: string) {
    const membership = await ensureActiveMembership(userId, organizationId);

    if (membership.role !== "owner") {
      throw new IdentityServiceError(
        "FORBIDDEN",
        "Only organization owners can perform this action",
        403
      );
    }

    return membership;
  }

  function ensureAdminCanManageMembership(
    actingMembership: IdentityMembershipRecord,
    membershipToManage: IdentityMembershipRecord
  ) {
    if (actingMembership.role !== "admin") {
      return;
    }

    if (membershipToManage.role === "owner") {
      throw new IdentityServiceError("FORBIDDEN", "Admins cannot manage organization owners", 403);
    }
  }

  async function buildUniqueSlug(name: string, excludedOrganizationId?: string) {
    const baseSlug = slugify(name);
    let candidateSlug = baseSlug;
    let suffix = 2;

    while (await repository.organizationSlugExists(candidateSlug)) {
      if (!excludedOrganizationId) {
        candidateSlug = `${baseSlug}-${suffix}`;
        suffix += 1;
        continue;
      }

      const existingOrganization = await repository.findOrganizationById(excludedOrganizationId);

      if (existingOrganization?.slug === candidateSlug) {
        return candidateSlug;
      }

      candidateSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidateSlug;
  }

  return {
    async acceptInvite(userId: string, organizationId: string) {
      const user = await repository.findUserById(userId);

      if (!user) {
        throw new IdentityServiceError("NOT_FOUND", "User not found", 404);
      }

      const membership = await repository.findMembershipByUserIdAndOrganizationId(
        userId,
        organizationId
      );

      if (!membership) {
        throw new IdentityServiceError("NOT_FOUND", "Membership not found", 404);
      }

      if (membership.user.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new IdentityServiceError(
          "FORBIDDEN",
          "You cannot accept an invite for another user",
          403
        );
      }

      if (membership.status !== "pending") {
        throw new IdentityServiceError("CONFLICT", "This invite is no longer pending", 409);
      }

      return repository.updateMembershipStatus(organizationId, userId, "active");
    },

    async createOrganization(input: CreateOrganizationRequest) {
      const user = await repository.findUserById(input.userId);

      if (!user) {
        throw new IdentityServiceError("NOT_FOUND", "User not found", 404);
      }

      const slug = await buildUniqueSlug(input.name);

      return repository.createOrganizationWithOwnerMembership({
        name: input.name,
        ownerUserId: input.userId,
        slug,
        ...(input.businessType !== undefined ? { businessType: input.businessType } : {}),
      });
    },

    async declineInvite(userId: string, organizationId: string) {
      const user = await repository.findUserById(userId);

      if (!user) {
        throw new IdentityServiceError("NOT_FOUND", "User not found", 404);
      }

      const membership = await repository.findMembershipByUserIdAndOrganizationId(
        userId,
        organizationId
      );

      if (!membership) {
        throw new IdentityServiceError("NOT_FOUND", "Membership not found", 404);
      }

      if (membership.user.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new IdentityServiceError(
          "FORBIDDEN",
          "You cannot decline an invite for another user",
          403
        );
      }

      if (membership.status !== "pending") {
        throw new IdentityServiceError("CONFLICT", "This invite is no longer pending", 409);
      }

      await repository.deleteMembership(organizationId, userId);
    },

    async getCurrentUser(userId: string) {
      const user = await repository.findUserById(userId);

      if (!user) {
        throw new IdentityServiceError("NOT_FOUND", "User not found", 404);
      }

      return user;
    },

    async getOrganization(userId: string, organizationId: string) {
      await ensureActiveMembership(userId, organizationId);

      const organization = await repository.findOrganizationById(organizationId);

      if (!organization) {
        throw new IdentityServiceError("NOT_FOUND", "Organization not found", 404);
      }

      return organization;
    },

    async inviteMember(input: InviteMemberRequest) {
      const actingMembership = await ensureMembershipManager(
        input.currentUserId,
        input.organizationId
      );

      if (actingMembership.role === "admin" && input.role === "owner") {
        throw new IdentityServiceError("FORBIDDEN", "Admins cannot assign the owner role", 403);
      }

      const memberships = await repository.listMembershipsForOrganization(input.organizationId);
      const duplicateMembership = memberships.find(
        (membership) => membership.user.email.toLowerCase() === input.email.toLowerCase()
      );

      if (duplicateMembership) {
        throw new IdentityServiceError(
          "CONFLICT",
          "A membership already exists for this email address",
          409
        );
      }

      return repository.createPendingMembership({
        email: input.email.toLowerCase(),
        organizationId: input.organizationId,
        role: input.role,
      });
    },

    async listCurrentUserOrganizations(userId: string): Promise<MembershipWithOrganization[]> {
      return repository.listMembershipsForUser(userId);
    },

    async listOrganizationMemberships(userId: string, organizationId: string) {
      await ensureMembershipManager(userId, organizationId);
      return repository.listMembershipsForOrganization(organizationId);
    },

    async removeMember(currentUserId: string, organizationId: string, userId: string) {
      const actingMembership = await ensureMembershipManager(currentUserId, organizationId);

      const membership = await repository.findMembershipByUserIdAndOrganizationId(
        userId,
        organizationId
      );

      if (!membership) {
        throw new IdentityServiceError("NOT_FOUND", "Membership not found", 404);
      }

      ensureAdminCanManageMembership(actingMembership, membership);

      if (membership.role === "owner" && membership.status === "active") {
        const activeOwnerCount = await repository.usersWithActiveOwnerRoleCount(organizationId);

        if (activeOwnerCount <= 1) {
          throw new IdentityServiceError(
            "OWNER_REQUIRED",
            "An organization must have at least one owner",
            409
          );
        }
      }

      await repository.deleteMembership(organizationId, userId);
    },

    async updateCurrentUser(
      userId: string,
      input: {
        avatarUrl?: string | null;
        name?: string | null;
      }
    ) {
      const user = await repository.findUserById(userId);

      if (!user) {
        throw new IdentityServiceError("NOT_FOUND", "User not found", 404);
      }

      return repository.updateUserProfile(userId, input);
    },

    async updateMemberRole(input: UpdateMemberRoleRequest) {
      const actingMembership = await ensureMembershipManager(
        input.currentUserId,
        input.organizationId
      );

      const membership = await repository.findMembershipByUserIdAndOrganizationId(
        input.userId,
        input.organizationId
      );

      if (!membership) {
        throw new IdentityServiceError("NOT_FOUND", "Membership not found", 404);
      }

      ensureAdminCanManageMembership(actingMembership, membership);

      if (actingMembership.role === "admin" && input.role === "owner") {
        throw new IdentityServiceError("FORBIDDEN", "Admins cannot assign the owner role", 403);
      }

      if (membership.role === "owner" && membership.status === "active" && input.role !== "owner") {
        const activeOwnerCount = await repository.usersWithActiveOwnerRoleCount(
          input.organizationId
        );

        if (activeOwnerCount <= 1) {
          throw new IdentityServiceError(
            "OWNER_REQUIRED",
            "An organization must have at least one owner",
            409
          );
        }
      }

      return repository.updateMembershipRole(input.organizationId, input.userId, input.role);
    },

    async updateOrganization(input: UpdateOrganizationRequest) {
      await ensureOwnerMembership(input.currentUserId, input.organizationId);

      const organization = await repository.findOrganizationById(input.organizationId);

      if (!organization) {
        throw new IdentityServiceError("NOT_FOUND", "Organization not found", 404);
      }

      const slug = input.name
        ? await buildUniqueSlug(input.name, input.organizationId)
        : organization.slug;

      return repository.updateOrganization(input.organizationId, {
        slug,
        ...(input.businessType !== undefined ? { businessType: input.businessType } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
      });
    },
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
export type { IdentityMembershipRecord, Organization, User };
