import type { PrismaClient } from "@prisma/client";
import type {
  MembershipStatus,
  MembershipWithOrganization,
  Organization,
  Role,
  User,
} from "@wford26/shared-types";

export type IdentityMembershipRecord = {
  createdAt: string;
  id: string;
  organizationId: string;
  role: Role;
  status: MembershipStatus;
  user: User;
  userId: string;
};

export type IdentityMembershipWithOrganizationRecord = MembershipWithOrganization & {
  userId: string;
};

export type CreateOrganizationInput = {
  businessType?: string | null;
  name: string;
  ownerUserId: string;
  slug: string;
};

export type CreatePendingMembershipInput = {
  email: string;
  organizationId: string;
  role: Role;
};

export type IdentityRepository = {
  countRegisteredUsers(): Promise<number>;
  createUser(input: {
    email: string;
    emailVerified?: boolean;
    name?: string | null;
    passwordHash?: string | null;
  }): Promise<User>;
  createOrganizationWithOwnerMembership(
    input: CreateOrganizationInput
  ): Promise<{ membership: IdentityMembershipRecord; organization: Organization }>;
  createPendingMembership(input: CreatePendingMembershipInput): Promise<IdentityMembershipRecord>;
  deleteMembership(organizationId: string, userId: string): Promise<void>;
  findMembershipByUserIdAndOrganizationId(
    userId: string,
    organizationId: string
  ): Promise<IdentityMembershipRecord | null>;
  findOrganizationById(organizationId: string): Promise<Organization | null>;
  findFirstActiveMembershipForUser(userId: string): Promise<{
    organization: Organization;
    role: Role;
    userId: string;
  } | null>;
  listMembershipsForUser(userId: string): Promise<IdentityMembershipWithOrganizationRecord[]>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(userId: string): Promise<User | null>;
  listMembershipsForOrganization(organizationId: string): Promise<IdentityMembershipRecord[]>;
  organizationSlugExists(slug: string): Promise<boolean>;
  updateMembershipStatus(
    organizationId: string,
    userId: string,
    status: MembershipStatus
  ): Promise<IdentityMembershipRecord>;
  updateMembershipRole(
    organizationId: string,
    userId: string,
    role: Role
  ): Promise<IdentityMembershipRecord>;
  updateOrganization(
    organizationId: string,
    input: {
      businessType?: string | null;
      name?: string;
      slug?: string;
    }
  ): Promise<Organization>;
  updateUserProfile(
    userId: string,
    input: {
      avatarUrl?: string | null;
      name?: string | null;
    }
  ): Promise<User>;
  updateUserAuth(
    userId: string,
    input: {
      emailVerified?: boolean;
      name?: string | null;
      passwordHash?: string | null;
    }
  ): Promise<User>;
  usersWithActiveOwnerRoleCount(organizationId: string): Promise<number>;
};

function toUserRecord(user: {
  avatarUrl: string | null;
  createdAt: Date;
  email: string;
  emailVerified: boolean;
  id: string;
  name: string | null;
  passwordHash: string | null;
  updatedAt: Date;
}): User {
  return {
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    email: user.email,
    emailVerified: user.emailVerified,
    id: user.id,
    name: user.name,
    passwordHash: user.passwordHash,
    updatedAt: user.updatedAt.toISOString(),
  };
}

function toOrganizationRecord(organization: {
  businessType: string | null;
  createdAt: Date;
  id: string;
  name: string;
  slug: string;
}): Organization {
  return {
    businessType: organization.businessType,
    createdAt: organization.createdAt.toISOString(),
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  };
}

function toMembershipRecord(membership: {
  createdAt: Date;
  id: string;
  organizationId: string;
  role: string;
  status: string;
  user: {
    avatarUrl: string | null;
    createdAt: Date;
    email: string;
    emailVerified: boolean;
    id: string;
    name: string | null;
    passwordHash: string | null;
    updatedAt: Date;
  };
  userId: string;
}): IdentityMembershipRecord {
  return {
    createdAt: membership.createdAt.toISOString(),
    id: membership.id,
    organizationId: membership.organizationId,
    role: membership.role as Role,
    status: membership.status as MembershipStatus,
    user: toUserRecord(membership.user),
    userId: membership.userId,
  };
}

function toMembershipWithOrganizationRecord(membership: {
  createdAt: Date;
  id: string;
  organization: {
    businessType: string | null;
    createdAt: Date;
    id: string;
    name: string;
    slug: string;
  };
  organizationId: string;
  role: string;
  status: string;
  userId: string;
}): IdentityMembershipWithOrganizationRecord {
  return {
    createdAt: membership.createdAt.toISOString(),
    id: membership.id,
    organization: toOrganizationRecord(membership.organization),
    organizationId: membership.organizationId,
    role: membership.role as Role,
    status: membership.status as MembershipStatus,
    userId: membership.userId,
  };
}

export function createPrismaIdentityRepository(db: PrismaClient): IdentityRepository {
  return {
    async countRegisteredUsers() {
      return db.user.count({
        where: {
          passwordHash: {
            not: null,
          },
        },
      });
    },

    async createUser(input) {
      const user = await db.user.create({
        data: {
          email: input.email,
          ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.passwordHash !== undefined ? { passwordHash: input.passwordHash } : {}),
        },
      });

      return toUserRecord(user);
    },

    async createOrganizationWithOwnerMembership(input) {
      const organizationCreateInput = {
        name: input.name,
        slug: input.slug,
        ...(input.businessType !== undefined ? { businessType: input.businessType } : {}),
      };

      const result = await db.$transaction(async (transaction) => {
        const organization = await transaction.organization.create({
          data: organizationCreateInput,
        });

        const membership = await transaction.membership.create({
          data: {
            organizationId: organization.id,
            role: "owner",
            status: "active",
            userId: input.ownerUserId,
          },
          include: {
            user: true,
          },
        });

        return {
          membership,
          organization,
        };
      });

      return {
        membership: toMembershipRecord(result.membership),
        organization: toOrganizationRecord(result.organization),
      };
    },

    async createPendingMembership(input) {
      const user =
        (await db.user.findUnique({
          where: {
            email: input.email,
          },
        })) ??
        (await db.user.create({
          data: {
            email: input.email,
          },
        }));

      const membership = await db.membership.create({
        data: {
          organizationId: input.organizationId,
          role: input.role,
          status: "pending",
          userId: user.id,
        },
        include: {
          user: true,
        },
      });

      return toMembershipRecord(membership);
    },

    async deleteMembership(organizationId, userId) {
      await db.membership.delete({
        where: {
          userId_organizationId: {
            organizationId,
            userId,
          },
        },
      });
    },

    async findMembershipByUserIdAndOrganizationId(userId, organizationId) {
      const membership = await db.membership.findUnique({
        where: {
          userId_organizationId: {
            organizationId,
            userId,
          },
        },
        include: {
          user: true,
        },
      });

      return membership ? toMembershipRecord(membership) : null;
    },

    async findOrganizationById(organizationId) {
      const organization = await db.organization.findUnique({
        where: {
          id: organizationId,
        },
      });

      return organization ? toOrganizationRecord(organization) : null;
    },

    async findUserById(userId) {
      const user = await db.user.findUnique({
        where: {
          id: userId,
        },
      });

      return user ? toUserRecord(user) : null;
    },

    async listMembershipsForUser(userId) {
      const memberships = await db.membership.findMany({
        include: {
          organization: true,
        },
        orderBy: [
          {
            status: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
        where: {
          userId,
        },
      });

      return memberships.map(toMembershipWithOrganizationRecord);
    },

    async findFirstActiveMembershipForUser(userId) {
      const membership = await db.membership.findFirst({
        include: {
          organization: true,
        },
        orderBy: {
          createdAt: "asc",
        },
        where: {
          status: "active",
          userId,
        },
      });

      if (!membership) {
        return null;
      }

      return {
        organization: toOrganizationRecord(membership.organization),
        role: membership.role as Role,
        userId: membership.userId,
      };
    },

    async findUserByEmail(email) {
      const user = await db.user.findUnique({
        where: {
          email,
        },
      });

      return user ? toUserRecord(user) : null;
    },

    async listMembershipsForOrganization(organizationId) {
      const memberships = await db.membership.findMany({
        include: {
          user: true,
        },
        orderBy: [
          {
            status: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
        where: {
          organizationId,
        },
      });

      return memberships.map(toMembershipRecord);
    },

    async organizationSlugExists(slug) {
      const organization = await db.organization.findUnique({
        where: {
          slug,
        },
      });

      return Boolean(organization);
    },

    async updateMembershipStatus(organizationId, userId, status) {
      const membership = await db.membership.update({
        where: {
          userId_organizationId: {
            organizationId,
            userId,
          },
        },
        data: {
          status,
        },
        include: {
          user: true,
        },
      });

      return toMembershipRecord(membership);
    },

    async updateMembershipRole(organizationId, userId, role) {
      const membership = await db.membership.update({
        where: {
          userId_organizationId: {
            organizationId,
            userId,
          },
        },
        data: {
          role,
        },
        include: {
          user: true,
        },
      });

      return toMembershipRecord(membership);
    },

    async updateOrganization(organizationId, input) {
      const organizationUpdateInput = {
        ...(input.businessType !== undefined ? { businessType: input.businessType } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
      };

      const organization = await db.organization.update({
        where: {
          id: organizationId,
        },
        data: organizationUpdateInput,
      });

      return toOrganizationRecord(organization);
    },

    async updateUserProfile(userId, input) {
      const userUpdateInput = {
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
      };

      const user = await db.user.update({
        where: {
          id: userId,
        },
        data: userUpdateInput,
      });

      return toUserRecord(user);
    },

    async updateUserAuth(userId, input) {
      const user = await db.user.update({
        where: {
          id: userId,
        },
        data: {
          ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.passwordHash !== undefined ? { passwordHash: input.passwordHash } : {}),
        },
      });

      return toUserRecord(user);
    },

    async usersWithActiveOwnerRoleCount(organizationId) {
      return db.membership.count({
        where: {
          organizationId,
          role: "owner",
          status: "active",
        },
      });
    },
  };
}
