"use client";

import { createContext, startTransition, useContext, useEffect, useMemo, useState } from "react";

import { ApiClientError, apiClient } from "../lib/api-client";
import {
  clearStoredAuthSession,
  getStoredAuthSession,
  setStoredAuthSession,
  type StoredAuthSession,
} from "../lib/auth-storage";

import type { AuthTokens, Organization, User } from "@wford26/shared-types";

type AuthSessionResponse = {
  organization: Organization;
  tokens: AuthTokens;
  user: User;
};

type AuthContextValue = {
  error: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  organization: Organization | null;
  register: (name: string, email: string, password: string) => Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toStoredSession(session: AuthSessionResponse): StoredAuthSession {
  return {
    accessToken: session.tokens.accessToken,
    organization: session.organization,
    user: session.user,
  };
}

export function AuthProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredAuthSession();

    if (session) {
      setUser(session.user);
      setOrganization(session.organization);
    }

    setIsLoading(false);
  }, []);

  async function applySession(session: AuthSessionResponse) {
    const storedSession = toStoredSession(session);

    setStoredAuthSession(storedSession);
    setUser(storedSession.user);
    setOrganization(storedSession.organization);
    setError(null);
  }

  async function login(email: string, password: string) {
    setIsLoading(true);

    try {
      const session = await apiClient<AuthSessionResponse>("/auth/login", {
        body: { email, password },
        method: "POST",
        retryOnAuthFailure: false,
      });

      await applySession(session);
    } catch (caughtError) {
      setError(caughtError instanceof ApiClientError ? caughtError.message : "Unable to sign in");
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  async function register(name: string, email: string, password: string) {
    setIsLoading(true);

    try {
      const session = await apiClient<AuthSessionResponse>("/auth/register", {
        body: { email, name, password },
        method: "POST",
        retryOnAuthFailure: false,
      });

      await applySession(session);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError ? caughtError.message : "Unable to create account"
      );
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    setIsLoading(true);

    try {
      await apiClient("/auth/logout", {
        method: "POST",
        retryOnAuthFailure: false,
      });
    } catch {
      // Clear local auth state even if the backend logout request fails.
    } finally {
      clearStoredAuthSession();

      startTransition(() => {
        setUser(null);
        setOrganization(null);
        setError(null);
        setIsLoading(false);
      });
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      isLoading,
      login,
      logout,
      organization,
      register,
      user,
    }),
    [error, isLoading, organization, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
