import { signToken } from "@wford26/auth-sdk";

import {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_TTL_SECONDS,
  type PasswordHasher,
  type RefreshTokenStore,
} from "../lib/auth";
import { IdentityServiceError } from "../lib/errors";

import type { IdentityRepository } from "../repositories/identity.repo";
import type { AuthTokens, Organization, Role, User } from "@wford26/shared-types";

type RegisterRequest = {
  email: string;
  name: string;
  password: string;
};

type LoginRequest = {
  email: string;
  password: string;
};

type SwitchOrganizationRequest = {
  currentRefreshToken?: string | undefined;
  organizationId: string;
  userId: string;
};

type AuthSessionResponse = {
  organization: Organization;
  tokens: AuthTokens;
  user: User;
};

type BootstrapStatusResponse = {
  available: boolean;
};

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "organization";
}

function createPersonalOrganizationName(name: string, email: string) {
  const trimmedName = name.trim();

  if (trimmedName.length > 0) {
    return `${trimmedName}'s Workspace`;
  }

  const emailPrefix = email.split("@")[0] ?? "workspace";
  return `${emailPrefix}'s Workspace`;
}

export function createAuthService(
  repository: IdentityRepository,
  options: {
    jwtSecret: string;
    passwordHasher: PasswordHasher;
    refreshTokenStore: RefreshTokenStore;
  }
) {
  async function buildUniqueSlug(name: string) {
    const baseSlug = slugify(name);
    let candidateSlug = baseSlug;
    let suffix = 2;

    while (await repository.organizationSlugExists(candidateSlug)) {
      candidateSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidateSlug;
  }

  async function issueTokens(session: {
    email: string;
    organizationId: string;
    role: Role;
    userId: string;
  }): Promise<AuthTokens> {
    const refreshRecord = await options.refreshTokenStore.issue(session, REFRESH_TOKEN_TTL_SECONDS);

    return {
      accessToken: signToken(session, options.jwtSecret, ACCESS_TOKEN_EXPIRES_IN),
      expiresIn: 60 * 15,
      refreshToken: refreshRecord.token,
      tokenType: "Bearer",
    };
  }

  async function issueSessionForMembership(input: {
    currentRefreshToken?: string | undefined;
    membership: {
      organization: Organization;
      role: Role;
      userId: string;
    };
    user: User;
  }): Promise<AuthSessionResponse> {
    if (input.currentRefreshToken) {
      await options.refreshTokenStore.revoke(input.currentRefreshToken);
    }

    const tokens = await issueTokens({
      email: input.user.email,
      organizationId: input.membership.organization.id,
      role: input.membership.role,
      userId: input.user.id,
    });

    return {
      organization: input.membership.organization,
      tokens,
      user: input.user,
    };
  }

  async function resolvePrimaryMembership(userId: string) {
    const membership = await repository.findFirstActiveMembershipForUser(userId);

    if (!membership) {
      throw new IdentityServiceError(
        "FORBIDDEN",
        "No active organization membership is available for this user",
        403
      );
    }

    return membership;
  }

  async function isBootstrapAvailable() {
    return (await repository.countRegisteredUsers()) === 0;
  }

  async function registerUser(input: RegisterRequest): Promise<AuthSessionResponse> {
    const normalizedEmail = input.email.toLowerCase();
    const existingUser = await repository.findUserByEmail(normalizedEmail);

    if (existingUser?.passwordHash) {
      throw new IdentityServiceError("CONFLICT", "An account already exists for this email", 409);
    }

    const passwordHash = await options.passwordHasher.hash(input.password);
    const user = existingUser
      ? await repository.updateUserAuth(existingUser.id, {
          emailVerified: false,
          name: input.name,
          passwordHash,
        })
      : await repository.createUser({
          email: normalizedEmail,
          emailVerified: false,
          name: input.name,
          passwordHash,
        });

    const organizationName = createPersonalOrganizationName(input.name, normalizedEmail);
    const slug = await buildUniqueSlug(organizationName);
    const organizationResult = await repository.createOrganizationWithOwnerMembership({
      name: organizationName,
      ownerUserId: user.id,
      slug,
    });

    return issueSessionForMembership({
      membership: {
        organization: organizationResult.organization,
        role: organizationResult.membership.role,
        userId: user.id,
      },
      user,
    });
  }

  return {
    async bootstrapAdmin(input: RegisterRequest): Promise<AuthSessionResponse> {
      if (!(await isBootstrapAvailable())) {
        throw new IdentityServiceError(
          "BOOTSTRAP_UNAVAILABLE",
          "Bootstrap admin creation is only available before the first account exists",
          409
        );
      }

      return registerUser(input);
    },

    async getBootstrapStatus(): Promise<BootstrapStatusResponse> {
      return {
        available: await isBootstrapAvailable(),
      };
    },

    async login(input: LoginRequest): Promise<AuthSessionResponse> {
      const user = await repository.findUserByEmail(input.email.toLowerCase());

      if (!user?.passwordHash) {
        throw new IdentityServiceError("UNAUTHORIZED", "Invalid email or password", 401);
      }

      const passwordMatches = await options.passwordHasher.verify(
        input.password,
        user.passwordHash
      );

      if (!passwordMatches) {
        throw new IdentityServiceError("UNAUTHORIZED", "Invalid email or password", 401);
      }

      const membership = await resolvePrimaryMembership(user.id);
      const tokens = await issueTokens({
        email: user.email,
        organizationId: membership.organization.id,
        role: membership.role,
        userId: user.id,
      });

      return {
        organization: membership.organization,
        tokens,
        user,
      };
    },

    async logout(refreshToken: string | undefined) {
      if (!refreshToken) {
        return;
      }

      await options.refreshTokenStore.revoke(refreshToken);
    },

    async refresh(refreshToken: string | undefined) {
      if (!refreshToken) {
        throw new IdentityServiceError("UNAUTHORIZED", "Refresh token is required", 401);
      }

      const storedToken = await options.refreshTokenStore.read(refreshToken);

      if (!storedToken) {
        throw new IdentityServiceError("UNAUTHORIZED", "Refresh token is invalid or expired", 401);
      }

      await options.refreshTokenStore.revoke(refreshToken);

      const tokens = await issueTokens({
        email: storedToken.email,
        organizationId: storedToken.organizationId,
        role: storedToken.role,
        userId: storedToken.userId,
      });

      return {
        tokens,
      };
    },

    async switchOrganization(input: SwitchOrganizationRequest): Promise<AuthSessionResponse> {
      const user = await repository.findUserById(input.userId);

      if (!user) {
        throw new IdentityServiceError("NOT_FOUND", "User not found", 404);
      }

      const membership = await repository.findMembershipByUserIdAndOrganizationId(
        input.userId,
        input.organizationId
      );

      if (!membership) {
        throw new IdentityServiceError(
          "FORBIDDEN",
          "You do not have access to this organization",
          403
        );
      }

      if (membership.status !== "active") {
        throw new IdentityServiceError(
          "FORBIDDEN",
          "Only active organization memberships can be used",
          403
        );
      }

      const organization = await repository.findOrganizationById(input.organizationId);

      if (!organization) {
        throw new IdentityServiceError("NOT_FOUND", "Organization not found", 404);
      }

      return issueSessionForMembership({
        currentRefreshToken: input.currentRefreshToken,
        membership: {
          organization,
          role: membership.role,
          userId: membership.userId,
        },
        user,
      });
    },

    async register(input: RegisterRequest): Promise<AuthSessionResponse> {
      return registerUser(input);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
