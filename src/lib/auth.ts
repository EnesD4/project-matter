const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:5000";

const TOKEN_KEY = "matterpro_jwt";
const USER_KEY = "matterpro_user";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function authFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  return res;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return `Request failed (${res.status})`;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AuthResponse;
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AuthResponse;
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await authFetch("/api/auth/me");
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

export type PortfolioApiItem = {
  id: string;
  userId: string;
  symbol: string;
  shares: number;
  buyPrice: number;
  createdAt: string;
};

export async function fetchPortfolio(): Promise<PortfolioApiItem[]> {
  const res = await authFetch("/api/portfolio");
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PortfolioApiItem[];
}

export async function createPortfolioItem(input: {
  symbol: string;
  shares: number;
  buyPrice: number;
}): Promise<PortfolioApiItem> {
  const res = await authFetch("/api/portfolio", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PortfolioApiItem;
}

export async function deletePortfolioItem(id: string): Promise<void> {
  const res = await authFetch(`/api/portfolio/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await parseError(res));
}
