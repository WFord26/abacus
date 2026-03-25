import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import Redis from "ioredis";

import type { Role } from "@wford26/shared-types";

export const ACCESS_TOKEN_EXPIRES_IN = "15m";
export const REFRESH_TOKEN_COOKIE_NAME = "abacus_refresh_token";
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AuthSession = {
  email: string;
  organizationId: string;
  role: Role;
  userId: string;
};

export type PasswordHasher = {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
};

export type RefreshTokenRecord = AuthSession & {
  token: string;
  tokenId: string;
};

export type RefreshTokenStore = {
  issue(session: AuthSession, ttlSeconds: number): Promise<RefreshTokenRecord>;
  read(token: string): Promise<RefreshTokenRecord | null>;
  revoke(token: string): Promise<void>;
};

type StoredRefreshToken = AuthSession & {
  expiresAt: number;
  tokenId: string;
};

function buildRefreshToken(userId: string, tokenId: string) {
  return `${userId}:${tokenId}`;
}

function parseRefreshToken(token: string) {
  const [userId, tokenId, ...rest] = token.split(":");

  if (!userId || !tokenId || rest.length > 0) {
    return null;
  }

  return {
    tokenId,
    userId,
  };
}

function getRedisKey(userId: string, tokenId: string) {
  return `rt:${userId}:${tokenId}`;
}

export function createBcryptPasswordHasher(rounds = 12): PasswordHasher {
  return {
    async hash(password) {
      return bcrypt.hash(password, rounds);
    },
    async verify(password, passwordHash) {
      return bcrypt.compare(password, passwordHash);
    },
  };
}

export function createInMemoryRefreshTokenStore(): RefreshTokenStore {
  const tokens = new Map<string, StoredRefreshToken>();

  return {
    async issue(session, ttlSeconds) {
      const tokenId = randomUUID();
      const token = buildRefreshToken(session.userId, tokenId);
      tokens.set(token, {
        ...session,
        expiresAt: Date.now() + ttlSeconds * 1000,
        tokenId,
      });

      return {
        ...session,
        token,
        tokenId,
      };
    },

    async read(token) {
      const storedToken = tokens.get(token);

      if (!storedToken) {
        return null;
      }

      if (storedToken.expiresAt <= Date.now()) {
        tokens.delete(token);
        return null;
      }

      return {
        email: storedToken.email,
        organizationId: storedToken.organizationId,
        role: storedToken.role,
        token,
        tokenId: storedToken.tokenId,
        userId: storedToken.userId,
      };
    },

    async revoke(token) {
      tokens.delete(token);
    },
  };
}

export function createRedisRefreshTokenStore(redisUrl: string): RefreshTokenStore {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
  });

  async function ensureConnection() {
    if (redis.status === "wait") {
      await redis.connect();
    }
  }

  return {
    async issue(session, ttlSeconds) {
      await ensureConnection();

      const tokenId = randomUUID();
      const token = buildRefreshToken(session.userId, tokenId);

      await redis.set(
        getRedisKey(session.userId, tokenId),
        JSON.stringify({
          ...session,
          tokenId,
        }),
        "EX",
        ttlSeconds
      );

      return {
        ...session,
        token,
        tokenId,
      };
    },

    async read(token) {
      await ensureConnection();

      const parsedToken = parseRefreshToken(token);

      if (!parsedToken) {
        return null;
      }

      const value = await redis.get(getRedisKey(parsedToken.userId, parsedToken.tokenId));

      if (!value) {
        return null;
      }

      const session = JSON.parse(value) as AuthSession & {
        tokenId: string;
      };

      return {
        ...session,
        token,
      };
    },

    async revoke(token) {
      await ensureConnection();

      const parsedToken = parseRefreshToken(token);

      if (!parsedToken) {
        return;
      }

      await redis.del(getRedisKey(parsedToken.userId, parsedToken.tokenId));
    },
  };
}
