"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ApiClientError, apiClient } from "../lib/api-client";
import {
  clearStoredAuthSession,
  getStoredAccessToken,
  getStoredAuthSession,
  setStoredAuthSession,
  type StoredAuthSession,
} from "../lib/auth-storage";

import type {
  AuthTokens,
  MembershipWithOrganization,
  Organization,
  User,
} from "@wford26/shared-types";

type AuthSessionResponse = {
  organization: Organization;
  tokens: AuthTokens;
  user: User;
};

type BootstrapStatusResponse = {
  available: boolean;
};

type CreateOrganizationResponse = {
  membership: {
    organizationId: string;
  };
  organization: Organization;
};

type AuthContextValue = {
  bootstrapAdmin: (name: string, email: string, password: string) => Promise<void>;
  bootstrapAvailable: boolean;
  clearError: () => void;
  createOrganization: (name: string, businessType?: string) => Promise<Organization>;
  error: string | null;
  hasResolvedOrganizations: boolean;
  isBootstrapStatusLoading: boolean;
  isLoading: boolean;
  isOrganizationsLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  organization: Organization | null;
  organizations: MembershipWithOrganization[];
  refreshOrganizations: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<Organization>;
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
  const [organizations, setOrganizations] = useState<MembershipWithOrganization[]>([]);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [isBootstrapStatusLoading, setIsBootstrapStatusLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isOrganizationsLoading, setIsOrganizationsLoading] = useState(false);
  const [hasResolvedOrganizations, setHasResolvedOrganizations] = useState(false);
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

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshBootstrapStatus = useCallback(async () => {
    if (getStoredAccessToken()) {
      setBootstrapAvailable(false);
      setIsBootstrapStatusLoading(false);
      return;
    }

    setIsBootstrapStatusLoading(true);

    try {
      const status = await apiClient<BootstrapStatusResponse>("/auth/bootstrap-status", {
        method: "GET",
        retryOnAuthFailure: false,
      });

      setBootstrapAvailable(status.available);
    } catch {
      setBootstrapAvailable(false);
    } finally {
      setIsBootstrapStatusLoading(false);
    }
  }, []);

  const refreshOrganizations = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setOrganizations([]);
      setHasResolvedOrganizations(true);
      return;
    }

    setIsOrganizationsLoading(true);
    setHasResolvedOrganizations(false);

    try {
      const memberships = await apiClient<MembershipWithOrganization[]>("/organizations", {
        method: "GET",
      });

      setOrganizations(memberships);
    } catch {
      setOrganizations([]);
    } finally {
      setIsOrganizationsLoading(false);
      setHasResolvedOrganizations(true);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setOrganizations([]);
      setIsOrganizationsLoading(false);
      setHasResolvedOrganizations(true);
      void refreshBootstrapStatus();
      return;
    }

    setBootstrapAvailable(false);
    setIsBootstrapStatusLoading(false);
    void refreshOrganizations();
  }, [refreshBootstrapStatus, refreshOrganizations, user]);

  async function login(email: string, password: string) {
    setIsLoading(true);
    setError(null);

    try {
      const session = await apiClient<AuthSessionResponse>("/auth/login", {
        body: { email, password },
        method: "POST",
        retryOnAuthFailure: false,
      });

      await applySession(session);
      setHasResolvedOrganizations(false);
      setBootstrapAvailable(false);
      await refreshOrganizations();
    } catch (caughtError) {
      setError(caughtError instanceof ApiClientError ? caughtError.message : "Unable to sign in");
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  async function register(name: string, email: string, password: string) {
    setIsLoading(true);
    setError(null);

    try {
      const session = await apiClient<AuthSessionResponse>("/auth/register", {
        body: { email, name, password },
        method: "POST",
        retryOnAuthFailure: false,
      });

      await applySession(session);
      setHasResolvedOrganizations(false);
      setBootstrapAvailable(false);
      await refreshOrganizations();
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError ? caughtError.message : "Unable to create account"
      );
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  async function bootstrapAdmin(name: string, email: string, password: string) {
    setIsLoading(true);
    setError(null);

    try {
      const session = await apiClient<AuthSessionResponse>("/auth/bootstrap-admin", {
        body: { email, name, password },
        method: "POST",
        retryOnAuthFailure: false,
      });

      await applySession(session);
      setHasResolvedOrganizations(false);
      setBootstrapAvailable(false);
      setIsBootstrapStatusLoading(false);
      await refreshOrganizations();
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : "Unable to create the first admin account"
      );
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  async function switchOrganization(organizationId: string) {
    setIsLoading(true);
    setError(null);

    try {
      const session = await apiClient<AuthSessionResponse>("/auth/switch-organization", {
        body: { organizationId },
        method: "POST",
      });

      await applySession(session);
      setHasResolvedOrganizations(false);
      await refreshOrganizations();
      return session.organization;
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : "Unable to switch organizations"
      );
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  async function createOrganization(name: string, businessType?: string) {
    setIsLoading(true);
    setError(null);

    try {
      const result = await apiClient<CreateOrganizationResponse>("/organizations", {
        body: {
          ...(businessType ? { businessType } : {}),
          name,
        },
        method: "POST",
      });

      await refreshOrganizations();
      return await switchOrganization(result.organization.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : "Unable to create organization"
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
        setOrganizations([]);
        setBootstrapAvailable(false);
        setHasResolvedOrganizations(false);
        setIsBootstrapStatusLoading(true);
        setError(null);
        setIsLoading(false);
      });
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      bootstrapAdmin,
      bootstrapAvailable,
      clearError,
      createOrganization,
      error,
      hasResolvedOrganizations,
      isBootstrapStatusLoading,
      isLoading,
      isOrganizationsLoading,
      login,
      logout,
      organization,
      organizations,
      refreshOrganizations,
      register,
      switchOrganization,
      user,
    }),
    [
      bootstrapAdmin,
      bootstrapAvailable,
      clearError,
      createOrganization,
      error,
      hasResolvedOrganizations,
      isBootstrapStatusLoading,
      isLoading,
      isOrganizationsLoading,
      login,
      logout,
      organization,
      organizations,
      refreshOrganizations,
      register,
      switchOrganization,
      user,
    ]
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
