const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const TOKEN_KEY = "task_management_token";

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAuthToken();

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export async function apiBlobRequest(path: string): Promise<Blob> {
  const token = getAuthToken();
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data?.message || `Request failed with status ${response.status}`,
    );
  }

  return response.blob();
}

export const api = {
  login: (email: string, password: string) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  loginWithGoogle: (credential: string) =>
    apiRequest("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),

  requestPasswordReset: (email: string) =>
    apiRequest("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyPasswordReset: (email: string, code: string) =>
    apiRequest("/auth/verify-reset-code", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),

  resetPassword: (reset_token: string, new_password: string) =>
    apiRequest("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ reset_token, new_password }),
    }),

  me: () => apiRequest("/auth/me"),
  teams: () => apiRequest("/teams"),
  users: () => apiRequest("/users"),
  boards: () => apiRequest("/boards"),
  tasks: () => apiRequest("/tasks"),
  workflow: () => apiRequest("/workflow"),
  labels: () => apiRequest("/labels"),
  activity: () => apiRequest("/activity"),
};