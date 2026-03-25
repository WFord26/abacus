import type { Organization, User } from "@wford26/shared-types";

const ACCESS_TOKEN_KEY = "abacus.access-token";
const AUTH_SESSION_KEY = "abacus.auth-session";

export type StoredAuthSession = {
  accessToken: string;
  organization: Organization | null;
  user: User | null;
};

function canUseStorage() {
  return typeof window !== "undefined";
}

export function getStoredAccessToken() {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setStoredAccessToken(accessToken: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function clearStoredAccessToken() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getStoredAuthSession(): StoredAuthSession | null {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredAuthSession;
  } catch {
    clearStoredAuthSession();
    return null;
  }
}

export function setStoredAuthSession(session: StoredAuthSession) {
  if (!canUseStorage()) {
    return;
  }

  setStoredAccessToken(session.accessToken);
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredAuthSession() {
  if (!canUseStorage()) {
    return;
  }

  clearStoredAccessToken();
  window.localStorage.removeItem(AUTH_SESSION_KEY);
}
