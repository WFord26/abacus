"use client";

import { clearStoredAccessToken, getStoredAccessToken, setStoredAccessToken } from "./auth-storage";

import type { ApiError, ApiResponse } from "@wford26/shared-types";

export class ApiClientError extends Error {
  code: string;
  details?: ApiError["details"];
  statusCode: number;

  constructor(error: ApiError) {
    super(error.message);
    this.code = error.code;
    this.details = error.details;
    this.statusCode = error.statusCode;
  }
}

type ApiClientInit = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | null;
  retryOnAuthFailure?: boolean;
};

type RefreshResponse = {
  accessToken?: string;
  tokens?: {
    accessToken?: string;
  };
  data?: {
    accessToken?: string;
    tokens?: {
      accessToken?: string;
    };
  };
};

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";
}

function resolveUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

function redirectToLogin() {
  if (typeof window === "undefined") {
    return;
  }

  const nextPath = `${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams();

  if (nextPath && nextPath !== "/login") {
    params.set("next", nextPath);
  }

  const target = params.size > 0 ? `/login?${params.toString()}` : "/login";
  window.location.href = target;
}

function normalizeBody(body: ApiClientInit["body"]) {
  if (
    !body ||
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  ) {
    return body;
  }

  return JSON.stringify(body);
}

function buildHeaders(init?: ApiClientInit) {
  const headers = new Headers(init?.headers);
  const accessToken = getStoredAccessToken();

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (init?.body && !(init.body instanceof FormData) && !(init.body instanceof URLSearchParams)) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

function extractAccessToken(payload: RefreshResponse | null) {
  if (!payload) {
    return null;
  }

  return (
    payload.accessToken ??
    payload.tokens?.accessToken ??
    payload.data?.accessToken ??
    payload.data?.tokens?.accessToken ??
    null
  );
}

function extractApiError(payload: unknown): ApiError | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if ("error" in payload && typeof payload.error === "object" && payload.error) {
    const error = payload.error as ApiError;

    if (typeof error.code === "string" && typeof error.message === "string") {
      return {
        ...error,
        statusCode: error.statusCode ?? 500,
      };
    }
  }

  if ("success" in payload && payload.success === false && "error" in payload) {
    return (payload as ApiResponse<never>).error ?? null;
  }

  return null;
}

function extractData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "success" in payload && payload.success === true) {
    return (payload as ApiResponse<T>).data as T;
  }

  return payload as T;
}

async function refreshAccessToken() {
  const response = await fetch(resolveUrl("/auth/refresh"), {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    clearStoredAccessToken();
    return false;
  }

  const payload = (await response.json()) as RefreshResponse;
  const accessToken = extractAccessToken(payload);

  if (!accessToken) {
    clearStoredAccessToken();
    return false;
  }

  setStoredAccessToken(accessToken);
  return true;
}

export async function apiClient<T>(path: string, init: ApiClientInit = {}): Promise<T> {
  const { body: initialBody, retryOnAuthFailure: _retryOnAuthFailure, ...requestOptions } = init;
  const requestInit: RequestInit = {
    ...requestOptions,
    credentials: "include",
    headers: buildHeaders(init),
  };
  const body = normalizeBody(initialBody);

  if (body !== undefined) {
    requestInit.body = body;
  }

  const response = await fetch(resolveUrl(path), requestInit);

  if (response.status === 401 && init.retryOnAuthFailure !== false) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      return apiClient<T>(path, {
        ...init,
        retryOnAuthFailure: false,
      });
    }

    redirectToLogin();
  }

  const contentType = response.headers.get("content-type");
  const payload = contentType?.includes("application/json")
    ? await response.json()
    : await response.text();
  const apiError = extractApiError(payload);

  if (!response.ok) {
    throw new ApiClientError(
      apiError ?? {
        code: "REQUEST_FAILED",
        message: response.statusText || "Request failed",
        statusCode: response.status,
      }
    );
  }

  return extractData<T>(payload);
}
