import { signToken } from "@wford26/auth-sdk";

import {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_TTL_SECONDS,
  type PasswordHasher,
  type RefreshTokenStore,
} from "../lib/auth";
import { IdentityServiceError } from "../lib/errors";

import type { IdentityEmailSender } from "../lib/email";
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

type MagicLinkRequest = {
  email: string;
};

type MagicLinkConsumeRequest = {
  currentRefreshToken?: string | undefined;
  token: string;
};

type EmailVerificationRequest = {
  userId: string;
};

type EmailVerificationResponse = {
  user: User;
  verified: true;
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

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;
const MAGIC_LINK_TTL_MS = 1000 * 60 * 30;

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
    appOrigin: string;
    emailSender: IdentityEmailSender;
    jwtSecret: string;
    passwordHasher: PasswordHasher;
    refreshTokenStore: RefreshTokenStore;
  }
) {
  function buildAppUrl(pathname: string, params: Record<string, string>) {
    const url = new URL(pathname, options.appOrigin);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    return url.toString();
  }

  async function sendVerificationEmail(user: User) {
    const emailToken = await repository.createEmailToken({
      email: user.email,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      type: "verification",
      userId: user.id,
    });
    const verificationUrl = buildAppUrl("/verify-email", {
      token: emailToken.token,
    });

    await options.emailSender.send({
      html: `<p>Hi ${user.name ?? user.email},</p><p>Confirm your email for Abacus.</p><p><a href="${verificationUrl}">Verify your email</a></p><p>This link expires in 24 hours.</p>`,
      subject: "Verify your Abacus email",
      text: `Hi ${user.name ?? user.email},\n\nConfirm your email for Abacus: ${verificationUrl}\n\nThis link expires in 24 hours.`,
      to: user.email,
    });
  }

  async function trySendVerificationEmail(user: User) {
    try {
      await sendVerificationEmail(user);
    } catch (error) {
      console.error("failed to send verification email", {
        email: user.email,
        error,
      });
    }
  }

  async function resolveUserForToken(input: { email: string; userId?: string | null }) {
    if (input.userId) {
      const user = await repository.findUserById(input.userId);

      if (user) {
        return user;
      }
    }

    return repository.findUserByEmail(input.email.toLowerCase());
  }

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

      const session = await registerUser(input);
      await trySendVerificationEmail(session.user);
      return session;
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

    async consumeMagicLink(input: MagicLinkConsumeRequest): Promise<AuthSessionResponse> {
      const tokenRecord = await repository.consumeEmailToken("magic_link", input.token);

      if (!tokenRecord) {
        throw new IdentityServiceError("UNAUTHORIZED", "Magic link is invalid or expired", 401);
      }

      const user = await resolveUserForToken(tokenRecord);

      if (!user) {
        throw new IdentityServiceError("UNAUTHORIZED", "Magic link is invalid or expired", 401);
      }

      const membership = await resolvePrimaryMembership(user.id);

      return issueSessionForMembership({
        currentRefreshToken: input.currentRefreshToken,
        membership,
        user,
      });
    },

    async consumeVerificationToken(token: string): Promise<EmailVerificationResponse> {
      const tokenRecord = await repository.consumeEmailToken("verification", token);

      if (!tokenRecord) {
        throw new IdentityServiceError(
          "UNAUTHORIZED",
          "Verification link is invalid or expired",
          401
        );
      }

      const user = await resolveUserForToken(tokenRecord);

      if (!user) {
        throw new IdentityServiceError(
          "UNAUTHORIZED",
          "Verification link is invalid or expired",
          401
        );
      }

      const verifiedUser = await repository.updateUserAuth(user.id, {
        emailVerified: true,
      });

      return {
        user: verifiedUser,
        verified: true,
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
      const session = await registerUser(input);
      await trySendVerificationEmail(session.user);
      return session;
    },

    async requestEmailVerification(input: EmailVerificationRequest) {
      const user = await repository.findUserById(input.userId);

      if (!user) {
        throw new IdentityServiceError("NOT_FOUND", "User not found", 404);
      }

      if (user.emailVerified) {
        return {
          accepted: true,
        };
      }

      await sendVerificationEmail(user);

      return {
        accepted: true,
      };
    },

    async requestMagicLink(input: MagicLinkRequest) {
      const user = await repository.findUserByEmail(input.email.toLowerCase());

      if (!user) {
        return {
          accepted: true,
        };
      }

      const membership = await repository.findFirstActiveMembershipForUser(user.id);

      if (!membership) {
        return {
          accepted: true,
        };
      }

      const emailToken = await repository.createEmailToken({
        email: user.email,
        expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
        type: "magic_link",
        userId: user.id,
      });
      const magicLinkUrl = buildAppUrl("/magic-link", {
        token: emailToken.token,
      });

      await options.emailSender.send({
        html: `<p>Hi ${user.name ?? user.email},</p><p>Use the link below to sign in to Abacus.</p><p><a href="${magicLinkUrl}">Sign in with magic link</a></p><p>This link expires in 30 minutes.</p>`,
        subject: "Your Abacus sign-in link",
        text: `Hi ${user.name ?? user.email},\n\nUse this link to sign in to Abacus: ${magicLinkUrl}\n\nThis link expires in 30 minutes.`,
        to: user.email,
      });

      return {
        accepted: true,
      };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
