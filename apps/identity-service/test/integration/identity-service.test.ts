import { randomUUID } from "node:crypto";

import { signToken, verifyToken } from "@wford26/auth-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildIdentityServiceApp } from "../../src/app";
import { createInMemoryRefreshTokenStore, type PasswordHasher } from "../../src/lib/auth";

import type {
  CreateOrganizationInput,
  CreatePendingMembershipInput,
  IdentityMembershipRecord,
  IdentityRepository,
} from "../../src/repositories/identity.repo";
import type {
  MembershipStatus,
  MembershipWithOrganization,
  Organization,
  Role,
  User,
} from "@wford26/shared-types";

const JWT_SECRET = "test-secret";

type TestState = {
  memberships: Map<string, IdentityMembershipRecord>;
  organizations: Map<string, Organization>;
  users: Map<string, User>;
};

const testPasswordHasher: PasswordHasher = {
  async hash(password) {
    return `hashed:${password}`;
  },
  async verify(password, passwordHash) {
    return passwordHash === `hashed:${password}`;
  },
};

function getCookieHeader(response: request.Response) {
  const cookieHeader = response.headers["set-cookie"]?.[0];

  expect(cookieHeader).toBeDefined();
  return cookieHeader!;
}

function createMembershipKey(userId: string, organizationId: string) {
  return `${organizationId}:${userId}`;
}

function createUser(overrides: Partial<User> = {}): User {
  const now = new Date().toISOString();

  return {
    avatarUrl: overrides.avatarUrl ?? null,
    createdAt: overrides.createdAt ?? now,
    email: overrides.email ?? `${randomUUID()}@example.com`,
    emailVerified: overrides.emailVerified ?? true,
    id: overrides.id ?? randomUUID(),
    name: overrides.name ?? "Test User",
    passwordHash: overrides.passwordHash ?? null,
    updatedAt: overrides.updatedAt ?? now,
  };
}

function createOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    businessType: overrides.businessType ?? null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    id: overrides.id ?? randomUUID(),
    name: overrides.name ?? "Northwind Studio",
    slug: overrides.slug ?? "northwind-studio",
  };
}

function createMembership(
  user: User,
  organization: Organization,
  overrides: Partial<IdentityMembershipRecord> = {}
): IdentityMembershipRecord {
  return {
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    id: overrides.id ?? randomUUID(),
    organizationId: organization.id,
    role: overrides.role ?? "owner",
    status: overrides.status ?? "active",
    user,
    userId: user.id,
  };
}

function createMembershipWithOrganization(
  membership: IdentityMembershipRecord,
  organization: Organization
): MembershipWithOrganization {
  return {
    createdAt: membership.createdAt,
    id: membership.id,
    organization,
    organizationId: membership.organizationId,
    role: membership.role,
    status: membership.status,
    userId: membership.userId,
  };
}

function createRepository(state: TestState): IdentityRepository {
  return {
    async countRegisteredUsers() {
      return [...state.users.values()].filter((user) => user.passwordHash !== null).length;
    },

    async createUser(input) {
      const user = createUser({
        email: input.email,
        emailVerified: input.emailVerified ?? false,
        name: input.name ?? null,
        passwordHash: input.passwordHash ?? null,
      });

      state.users.set(user.id, user);
      return user;
    },

    async createOrganizationWithOwnerMembership(input: CreateOrganizationInput) {
      const organization: Organization = {
        businessType: input.businessType ?? null,
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        name: input.name,
        slug: input.slug,
      };
      const user = state.users.get(input.ownerUserId);

      if (!user) {
        throw new Error("User not found");
      }

      const membership: IdentityMembershipRecord = {
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        organizationId: organization.id,
        role: "owner",
        status: "active",
        user,
        userId: user.id,
      };

      state.organizations.set(organization.id, organization);
      state.memberships.set(createMembershipKey(user.id, organization.id), membership);

      return {
        membership,
        organization,
      };
    },

    async createPendingMembership(input: CreatePendingMembershipInput) {
      const organization = state.organizations.get(input.organizationId);

      if (!organization) {
        throw new Error("Organization not found");
      }

      const existingUser = [...state.users.values()].find(
        (user) => user.email.toLowerCase() === input.email.toLowerCase()
      );
      const user =
        existingUser ??
        createUser({
          email: input.email.toLowerCase(),
          name: null,
        });

      state.users.set(user.id, user);

      const membership = createMembership(user, organization, {
        role: input.role,
        status: "pending",
      });

      state.memberships.set(createMembershipKey(user.id, organization.id), membership);

      return membership;
    },

    async deleteMembership(organizationId, userId) {
      state.memberships.delete(createMembershipKey(userId, organizationId));
    },

    async findMembershipByUserIdAndOrganizationId(userId, organizationId) {
      return state.memberships.get(createMembershipKey(userId, organizationId)) ?? null;
    },

    async findOrganizationById(organizationId) {
      return state.organizations.get(organizationId) ?? null;
    },

    async findFirstActiveMembershipForUser(userId) {
      const membership = [...state.memberships.values()].find(
        (candidate) => candidate.userId === userId && candidate.status === "active"
      );

      if (!membership) {
        return null;
      }

      const organization = state.organizations.get(membership.organizationId);

      if (!organization) {
        return null;
      }

      return {
        organization,
        role: membership.role,
        userId,
      };
    },

    async findUserByEmail(email) {
      return (
        [...state.users.values()].find(
          (user) => user.email.toLowerCase() === email.toLowerCase()
        ) ?? null
      );
    },

    async findUserById(userId) {
      return state.users.get(userId) ?? null;
    },

    async listMembershipsForUser(userId) {
      return [...state.memberships.values()]
        .filter((membership) => membership.userId === userId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map((membership) => {
          const organization = state.organizations.get(membership.organizationId);

          if (!organization) {
            throw new Error("Organization not found");
          }

          return createMembershipWithOrganization(membership, organization);
        });
    },

    async listMembershipsForOrganization(organizationId) {
      return [...state.memberships.values()].filter(
        (membership) => membership.organizationId === organizationId
      );
    },

    async organizationSlugExists(slug) {
      return [...state.organizations.values()].some((organization) => organization.slug === slug);
    },

    async updateMembershipStatus(organizationId, userId, status) {
      const membership = state.memberships.get(createMembershipKey(userId, organizationId));

      if (!membership) {
        throw new Error("Membership not found");
      }

      const updatedMembership = {
        ...membership,
        status,
      };

      state.memberships.set(createMembershipKey(userId, organizationId), updatedMembership);
      return updatedMembership;
    },

    async updateMembershipRole(organizationId, userId, role) {
      const membership = state.memberships.get(createMembershipKey(userId, organizationId));

      if (!membership) {
        throw new Error("Membership not found");
      }

      const updatedMembership = {
        ...membership,
        role,
      };

      state.memberships.set(createMembershipKey(userId, organizationId), updatedMembership);
      return updatedMembership;
    },

    async updateOrganization(organizationId, input) {
      const organization = state.organizations.get(organizationId);

      if (!organization) {
        throw new Error("Organization not found");
      }

      const updatedOrganization = {
        ...organization,
        businessType:
          input.businessType !== undefined
            ? input.businessType
            : (organization.businessType ?? null),
        name: input.name ?? organization.name,
        slug: input.slug ?? organization.slug,
      };

      state.organizations.set(organizationId, updatedOrganization);
      return updatedOrganization;
    },

    async updateUserProfile(userId, input) {
      const user = state.users.get(userId);

      if (!user) {
        throw new Error("User not found");
      }

      const updatedUser = {
        ...user,
        avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : (user.avatarUrl ?? null),
        name: input.name !== undefined ? input.name : (user.name ?? null),
        updatedAt: new Date().toISOString(),
      };

      state.users.set(userId, updatedUser);
      return updatedUser;
    },

    async updateUserAuth(userId, input) {
      const user = state.users.get(userId);

      if (!user) {
        throw new Error("User not found");
      }

      const updatedUser = {
        ...user,
        emailVerified: input.emailVerified !== undefined ? input.emailVerified : user.emailVerified,
        name: input.name !== undefined ? input.name : (user.name ?? null),
        passwordHash:
          input.passwordHash !== undefined ? input.passwordHash : (user.passwordHash ?? null),
        updatedAt: new Date().toISOString(),
      };

      state.users.set(userId, updatedUser);
      return updatedUser;
    },

    async usersWithActiveOwnerRoleCount(organizationId) {
      return [...state.memberships.values()].filter(
        (membership) =>
          membership.organizationId === organizationId &&
          membership.role === "owner" &&
          membership.status === "active"
      ).length;
    },
  };
}

function createAccessToken(user: User, organizationId: string, role: Role) {
  return signToken(
    {
      email: user.email,
      organizationId,
      role,
      userId: user.id,
    },
    JWT_SECRET,
    "15m"
  );
}

describe("identity-service T-020 routes", () => {
  let app: ReturnType<typeof buildIdentityServiceApp>;
  let state: TestState;
  let ownerUser: User;
  let secondaryOwner: User;
  let organization: Organization;

  beforeEach(async () => {
    ownerUser = createUser({
      email: "owner@example.com",
      id: randomUUID(),
      name: "Owner Person",
    });
    secondaryOwner = createUser({
      email: "co-owner@example.com",
      id: randomUUID(),
      name: "Second Owner",
    });
    organization = createOrganization({
      id: randomUUID(),
      name: "Northwind Studio",
      slug: "northwind-studio",
    });

    state = {
      memberships: new Map([
        [
          createMembershipKey(ownerUser.id, organization.id),
          createMembership(ownerUser, organization, {
            role: "owner",
          }),
        ],
        [
          createMembershipKey(secondaryOwner.id, organization.id),
          createMembership(secondaryOwner, organization, {
            role: "owner",
          }),
        ],
      ]),
      organizations: new Map([[organization.id, organization]]),
      users: new Map([
        [ownerUser.id, ownerUser],
        [secondaryOwner.id, secondaryOwner],
      ]),
    };

    app = buildIdentityServiceApp({
      jwtSecret: JWT_SECRET,
      passwordHasher: testPasswordHasher,
      refreshTokenStore: createInMemoryRefreshTokenStore(),
      repository: createRepository(state),
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns the current user from GET /me", async () => {
    const token = createAccessToken(ownerUser, organization.id, "owner");

    const response = await request(app.server).get("/me").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(ownerUser.email);
    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it("updates profile fields via PATCH /me", async () => {
    const token = createAccessToken(ownerUser, organization.id, "owner");

    const response = await request(app.server)
      .patch("/me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        avatarUrl: "https://example.com/avatar.png",
        name: "Updated Name",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Updated Name");
    expect(response.body.data.avatarUrl).toBe("https://example.com/avatar.png");
    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it("creates organizations with a unique slug and owner membership", async () => {
    const token = createAccessToken(ownerUser, organization.id, "owner");

    const response = await request(app.server)
      .post("/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        businessType: "Agency",
        name: "Northwind Studio",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.organization.slug).toBe("northwind-studio-2");
    expect(response.body.data.membership.role).toBe("owner");
    expect(response.body.data.membership.status).toBe("active");
    expect(response.body.data.membership.user.passwordHash).toBeUndefined();
  });

  it("returns organization details for an active member", async () => {
    const token = createAccessToken(ownerUser, organization.id, "owner");

    const response = await request(app.server)
      .get(`/organizations/${organization.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(organization.id);
  });

  it("updates organizations only for owners", async () => {
    const adminUser = createUser({
      email: "admin@example.com",
      id: randomUUID(),
    });
    state.users.set(adminUser.id, adminUser);
    state.memberships.set(
      createMembershipKey(adminUser.id, organization.id),
      createMembership(adminUser, organization, {
        role: "admin",
      })
    );

    const adminToken = createAccessToken(adminUser, organization.id, "admin");

    const forbiddenResponse = await request(app.server)
      .patch(`/organizations/${organization.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Forbidden Rename",
      });

    expect(forbiddenResponse.status).toBe(403);

    const ownerToken = createAccessToken(ownerUser, organization.id, "owner");
    const successResponse = await request(app.server)
      .patch(`/organizations/${organization.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Renamed Studio",
      });

    expect(successResponse.status).toBe(200);
    expect(successResponse.body.data.slug).toBe("renamed-studio");
  });

  it("lists organization memberships", async () => {
    const token = createAccessToken(ownerUser, organization.id, "owner");

    const response = await request(app.server)
      .get(`/organizations/${organization.id}/members`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]?.user.passwordHash).toBeUndefined();
  });

  it("creates pending invites for new members", async () => {
    const token = createAccessToken(ownerUser, organization.id, "owner");

    const response = await request(app.server)
      .post(`/organizations/${organization.id}/members/invite`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "invitee@example.com",
        role: "viewer",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("pending");
    expect(response.body.data.user.email).toBe("invitee@example.com");
    expect(response.body.data.user.passwordHash).toBeUndefined();
  });

  it("prevents deleting the last active owner", async () => {
    state.memberships.delete(createMembershipKey(secondaryOwner.id, organization.id));
    const token = createAccessToken(ownerUser, organization.id, "owner");

    const response = await request(app.server)
      .delete(`/organizations/${organization.id}/members/${ownerUser.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("OWNER_REQUIRED");
  });

  it("updates member roles and protects the last owner", async () => {
    state.memberships.delete(createMembershipKey(secondaryOwner.id, organization.id));
    const token = createAccessToken(ownerUser, organization.id, "owner");

    const blockedResponse = await request(app.server)
      .patch(`/organizations/${organization.id}/members/${ownerUser.id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        role: "admin" satisfies Role,
      });

    expect(blockedResponse.status).toBe(409);

    state.memberships.set(
      createMembershipKey(secondaryOwner.id, organization.id),
      createMembership(secondaryOwner, organization, {
        role: "owner",
        status: "active" satisfies MembershipStatus,
      })
    );

    const successResponse = await request(app.server)
      .patch(`/organizations/${organization.id}/members/${secondaryOwner.id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        role: "admin" satisfies Role,
      });

    expect(successResponse.status).toBe(200);
    expect(successResponse.body.data.role).toBe("admin");
  });
});

describe("identity-service T-021 auth routes", () => {
  let app: ReturnType<typeof buildIdentityServiceApp>;
  let state: TestState;

  beforeEach(async () => {
    state = {
      memberships: new Map(),
      organizations: new Map(),
      users: new Map(),
    };

    app = buildIdentityServiceApp({
      jwtSecret: JWT_SECRET,
      passwordHasher: testPasswordHasher,
      refreshTokenStore: createInMemoryRefreshTokenStore(),
      repository: createRepository(state),
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("registers a user and returns tokens without leaking the password hash", async () => {
    const response = await request(app.server).post("/auth/register").send({
      email: "new.user@example.com",
      name: "New User",
      password: "password123",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe("new.user@example.com");
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(response.body.data.tokens.refreshToken).toEqual(expect.any(String));
    expect(getCookieHeader(response)).toContain("abacus_refresh_token=");
  });

  it("reports bootstrap availability before the first auth account exists", async () => {
    const response = await request(app.server).get("/auth/bootstrap-status");

    expect(response.status).toBe(200);
    expect(response.body.data.available).toBe(true);
  });

  it("bootstraps the first admin account only once", async () => {
    const firstResponse = await request(app.server).post("/auth/bootstrap-admin").send({
      email: "bootstrap.admin@example.com",
      name: "Bootstrap Admin",
      password: "password123",
    });

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.data.user.email).toBe("bootstrap.admin@example.com");
    expect(firstResponse.body.data.user.passwordHash).toBeUndefined();
    expect(firstResponse.body.data.organization.name).toBe("Bootstrap Admin's Workspace");

    const secondResponse = await request(app.server).post("/auth/bootstrap-admin").send({
      email: "second.admin@example.com",
      name: "Second Admin",
      password: "password123",
    });

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.error.code).toBe("BOOTSTRAP_UNAVAILABLE");

    const statusResponse = await request(app.server).get("/auth/bootstrap-status");

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.available).toBe(false);
  });

  it("logs in with valid credentials and rejects invalid passwords", async () => {
    const registerResponse = await request(app.server).post("/auth/register").send({
      email: "login.user@example.com",
      name: "Login User",
      password: "password123",
    });

    expect(registerResponse.status).toBe(201);

    const successResponse = await request(app.server).post("/auth/login").send({
      email: "login.user@example.com",
      password: "password123",
    });

    expect(successResponse.status).toBe(200);
    expect(successResponse.body.data.tokens.accessToken).toEqual(expect.any(String));

    const failureResponse = await request(app.server).post("/auth/login").send({
      email: "login.user@example.com",
      password: "wrong-password",
    });

    expect(failureResponse.status).toBe(401);
  });

  it("rotates refresh tokens and prevents reuse of the old token", async () => {
    const registerResponse = await request(app.server).post("/auth/register").send({
      email: "refresh.user@example.com",
      name: "Refresh User",
      password: "password123",
    });
    const originalCookie = getCookieHeader(registerResponse);

    const refreshResponse = await request(app.server)
      .post("/auth/refresh")
      .set("Cookie", originalCookie);

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.data.tokens.accessToken).toEqual(expect.any(String));

    const rotatedCookie = getCookieHeader(refreshResponse);
    expect(rotatedCookie).not.toBe(originalCookie);

    const reusedResponse = await request(app.server)
      .post("/auth/refresh")
      .set("Cookie", originalCookie);

    expect(reusedResponse.status).toBe(401);

    const validRotatedResponse = await request(app.server)
      .post("/auth/refresh")
      .set("Cookie", rotatedCookie);

    expect(validRotatedResponse.status).toBe(200);
  });

  it("logs out by revoking the refresh token", async () => {
    const registerResponse = await request(app.server).post("/auth/register").send({
      email: "logout.user@example.com",
      name: "Logout User",
      password: "password123",
    });
    const cookie = getCookieHeader(registerResponse);

    const logoutResponse = await request(app.server).post("/auth/logout").set("Cookie", cookie);

    expect(logoutResponse.status).toBe(200);

    const refreshResponse = await request(app.server).post("/auth/refresh").set("Cookie", cookie);

    expect(refreshResponse.status).toBe(401);
  });

  it("returns 401 for expired access tokens on protected routes", async () => {
    const registerResponse = await request(app.server).post("/auth/register").send({
      email: "expired.user@example.com",
      name: "Expired User",
      password: "password123",
    });

    expect(registerResponse.status).toBe(201);

    const createdUser = [...state.users.values()].find(
      (user) => user.email === "expired.user@example.com"
    );
    const organization = [...state.organizations.values()][0];

    expect(createdUser).toBeDefined();
    expect(organization).toBeDefined();

    const expiredToken = signToken(
      {
        email: createdUser!.email,
        organizationId: organization!.id,
        role: "owner",
        userId: createdUser!.id,
      },
      JWT_SECRET,
      "-1s"
    );

    const response = await request(app.server)
      .get("/me")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("identity-service T-022 membership lifecycle and roles", () => {
  let app: ReturnType<typeof buildIdentityServiceApp>;
  let state: TestState;
  let ownerUser: User;
  let adminUser: User;
  let viewerUser: User;
  let invitedOrgOwner: User;
  let primaryOrganization: Organization;
  let invitedOrganization: Organization;
  let declinedOrganization: Organization;

  beforeEach(async () => {
    ownerUser = createUser({
      email: "owner@example.com",
      id: randomUUID(),
      name: "Owner Person",
      passwordHash: "hashed:password123",
    });
    adminUser = createUser({
      email: "admin@example.com",
      id: randomUUID(),
      name: "Admin Person",
    });
    viewerUser = createUser({
      email: "viewer@example.com",
      id: randomUUID(),
      name: "Viewer Person",
    });
    invitedOrgOwner = createUser({
      email: "invited-owner@example.com",
      id: randomUUID(),
      name: "Invited Owner",
    });

    primaryOrganization = createOrganization({
      id: randomUUID(),
      name: "Northwind Studio",
      slug: "northwind-studio",
    });
    invitedOrganization = createOrganization({
      id: randomUUID(),
      name: "Sparrow Works",
      slug: "sparrow-works",
    });
    declinedOrganization = createOrganization({
      id: randomUUID(),
      name: "Maple Ops",
      slug: "maple-ops",
    });

    state = {
      memberships: new Map([
        [
          createMembershipKey(ownerUser.id, primaryOrganization.id),
          createMembership(ownerUser, primaryOrganization, {
            role: "owner",
          }),
        ],
        [
          createMembershipKey(adminUser.id, primaryOrganization.id),
          createMembership(adminUser, primaryOrganization, {
            role: "admin",
          }),
        ],
        [
          createMembershipKey(viewerUser.id, primaryOrganization.id),
          createMembership(viewerUser, primaryOrganization, {
            role: "viewer",
          }),
        ],
        [
          createMembershipKey(invitedOrgOwner.id, invitedOrganization.id),
          createMembership(invitedOrgOwner, invitedOrganization, {
            role: "owner",
          }),
        ],
        [
          createMembershipKey(invitedOrgOwner.id, declinedOrganization.id),
          createMembership(invitedOrgOwner, declinedOrganization, {
            role: "owner",
          }),
        ],
        [
          createMembershipKey(ownerUser.id, invitedOrganization.id),
          createMembership(ownerUser, invitedOrganization, {
            role: "viewer",
            status: "pending",
          }),
        ],
        [
          createMembershipKey(ownerUser.id, declinedOrganization.id),
          createMembership(ownerUser, declinedOrganization, {
            role: "accountant",
            status: "pending",
          }),
        ],
      ]),
      organizations: new Map([
        [primaryOrganization.id, primaryOrganization],
        [invitedOrganization.id, invitedOrganization],
        [declinedOrganization.id, declinedOrganization],
      ]),
      users: new Map([
        [ownerUser.id, ownerUser],
        [adminUser.id, adminUser],
        [viewerUser.id, viewerUser],
        [invitedOrgOwner.id, invitedOrgOwner],
      ]),
    };

    app = buildIdentityServiceApp({
      jwtSecret: JWT_SECRET,
      passwordHasher: testPasswordHasher,
      refreshTokenStore: createInMemoryRefreshTokenStore(),
      repository: createRepository(state),
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists the current user's organization memberships with org context", async () => {
    const token = createAccessToken(ownerUser, primaryOrganization.id, "owner");

    const response = await request(app.server)
      .get("/organizations")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organization: expect.objectContaining({
            id: primaryOrganization.id,
            name: primaryOrganization.name,
          }),
          role: "owner",
          status: "active",
        }),
        expect.objectContaining({
          organization: expect.objectContaining({
            id: invitedOrganization.id,
          }),
          role: "viewer",
          status: "pending",
        }),
      ])
    );
    expect(response.body.data[0]?.user).toBeUndefined();
  });

  it("accepts a pending invite for another organization without token scope mismatch", async () => {
    const token = createAccessToken(ownerUser, primaryOrganization.id, "owner");

    const response = await request(app.server)
      .post(`/organizations/${invitedOrganization.id}/accept-invite`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.organizationId).toBe(invitedOrganization.id);
    expect(response.body.data.status).toBe("active");
    expect(
      state.memberships.get(createMembershipKey(ownerUser.id, invitedOrganization.id))?.status
    ).toBe("active");
  });

  it("declines a pending invite by removing the membership", async () => {
    const token = createAccessToken(ownerUser, primaryOrganization.id, "owner");

    const response = await request(app.server)
      .post(`/organizations/${declinedOrganization.id}/decline-invite`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(state.memberships.has(createMembershipKey(ownerUser.id, declinedOrganization.id))).toBe(
      false
    );
  });

  it("switches organizations with refresh-token rotation", async () => {
    const loginResponse = await request(app.server).post("/auth/login").send({
      email: ownerUser.email,
      password: "password123",
    });
    const originalCookie = getCookieHeader(loginResponse);
    const currentAccessToken = loginResponse.body.data.tokens.accessToken as string;

    const acceptResponse = await request(app.server)
      .post(`/organizations/${invitedOrganization.id}/accept-invite`)
      .set("Authorization", `Bearer ${currentAccessToken}`);

    expect(acceptResponse.status).toBe(200);

    const switchResponse = await request(app.server)
      .post("/auth/switch-organization")
      .set("Authorization", `Bearer ${currentAccessToken}`)
      .set("Cookie", originalCookie)
      .send({
        organizationId: invitedOrganization.id,
      });

    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.data.organization.id).toBe(invitedOrganization.id);

    const rotatedCookie = getCookieHeader(switchResponse);
    expect(rotatedCookie).not.toBe(originalCookie);

    const decodedToken = verifyToken(switchResponse.body.data.tokens.accessToken, JWT_SECRET);
    expect(decodedToken.organizationId).toBe(invitedOrganization.id);
    expect(decodedToken.role).toBe("viewer");

    const reusedRefreshResponse = await request(app.server)
      .post("/auth/refresh")
      .set("Cookie", originalCookie);

    expect(reusedRefreshResponse.status).toBe(401);

    const validRefreshResponse = await request(app.server)
      .post("/auth/refresh")
      .set("Cookie", rotatedCookie);

    expect(validRefreshResponse.status).toBe(200);
  });

  it("rejects switching to an organization with a pending membership", async () => {
    const loginResponse = await request(app.server).post("/auth/login").send({
      email: ownerUser.email,
      password: "password123",
    });
    const cookie = getCookieHeader(loginResponse);
    const currentAccessToken = loginResponse.body.data.tokens.accessToken as string;

    const response = await request(app.server)
      .post("/auth/switch-organization")
      .set("Authorization", `Bearer ${currentAccessToken}`)
      .set("Cookie", cookie)
      .send({
        organizationId: invitedOrganization.id,
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("allows admins to manage non-owner members but blocks owner-only changes", async () => {
    const token = createAccessToken(adminUser, primaryOrganization.id, "admin");

    const roleUpdateResponse = await request(app.server)
      .patch(`/organizations/${primaryOrganization.id}/members/${viewerUser.id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        role: "accountant" satisfies Role,
      });

    expect(roleUpdateResponse.status).toBe(200);
    expect(roleUpdateResponse.body.data.role).toBe("accountant");

    const inviteResponse = await request(app.server)
      .post(`/organizations/${primaryOrganization.id}/members/invite`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "new.member@example.com",
        role: "viewer" satisfies Role,
      });

    expect(inviteResponse.status).toBe(201);
    expect(inviteResponse.body.data.status).toBe("pending");

    const promoteOwnerResponse = await request(app.server)
      .patch(`/organizations/${primaryOrganization.id}/members/${viewerUser.id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        role: "owner" satisfies Role,
      });

    expect(promoteOwnerResponse.status).toBe(403);

    const removeOwnerResponse = await request(app.server)
      .delete(`/organizations/${primaryOrganization.id}/members/${ownerUser.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(removeOwnerResponse.status).toBe(403);
  });

  it("rejects membership-management routes for viewers", async () => {
    const token = createAccessToken(viewerUser, primaryOrganization.id, "viewer");

    const response = await request(app.server)
      .get(`/organizations/${primaryOrganization.id}/members`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});
