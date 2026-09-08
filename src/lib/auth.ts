const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:5000";

const TOKEN_KEY = "matterpro_jwt";
const USER_KEY = "matterpro_user";

export type UserSettings = {
  hasCompletedOnboarding: boolean;
  hasActiveInvestments: boolean;
  hasActiveDebts: boolean;
  wantsCapitalGrowth: boolean;
  wantsFinancialLiteracy: boolean;
  riskTolerance?: string;
  investmentGoal?: string;
  experienceLevel?: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  hasCompletedOnboarding?: boolean;
  createdAt?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
  settings?: UserSettings | null;
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

export async function loginWithGoogle(credential: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AuthResponse;
}

export type OnboardingChoices = {
  hasActiveInvestments: boolean;
  hasActiveDebts: boolean;
  wantsCapitalGrowth: boolean;
  wantsFinancialLiteracy: boolean;
};

export async function fetchMe(): Promise<{ user: AuthUser; settings: UserSettings | null }> {
  const res = await authFetch("/api/auth/me");
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { user: AuthUser; settings: UserSettings | null };
}

export async function saveUserSettings(
  input: OnboardingChoices & { hasCompletedOnboarding: boolean }
): Promise<UserSettings> {
  const res = await authFetch("/api/user/settings", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { settings: UserSettings };
  return data.settings;
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

export type WatchlistApiItem = {
  id: string;
  watchlistId: string;
  symbol: string;
  name: string;
  createdAt: string;
};

export type WatchlistApiList = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  items: WatchlistApiItem[];
};

function watchlistCacheKey() {
  const user = getStoredUser();
  return `matterpro_watchlists_${user?.id ?? "anon"}`;
}

export function readWatchlistCache(): WatchlistApiList[] {
  try {
    const raw = localStorage.getItem(watchlistCacheKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistApiList[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeWatchlistCache(lists: WatchlistApiList[]) {
  try {
    localStorage.setItem(watchlistCacheKey(), JSON.stringify(lists));
  } catch {
    // ignore quota / private-mode failures
  }
}

export async function fetchWatchlists(): Promise<WatchlistApiList[]> {
  const res = await authFetch("/api/watchlists");
  if (!res.ok) throw new Error(await parseError(res));
  const lists = (await res.json()) as WatchlistApiList[];
  writeWatchlistCache(lists);
  return lists;
}

export async function createWatchlist(name: string): Promise<WatchlistApiList> {
  const res = await authFetch("/api/watchlists", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as WatchlistApiList;
}

export async function deleteWatchlist(id: string): Promise<void> {
  const res = await authFetch(`/api/watchlists/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function addWatchlistItem(input: {
  watchlistId: string;
  symbol: string;
  name?: string;
}): Promise<WatchlistApiItem> {
  const res = await authFetch(`/api/watchlists/${encodeURIComponent(input.watchlistId)}/items`, {
    method: "POST",
    body: JSON.stringify({ symbol: input.symbol, name: input.name }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as WatchlistApiItem;
}

export async function deleteWatchlistItem(watchlistId: string, itemId: string): Promise<void> {
  const res = await authFetch(
    `/api/watchlists/${encodeURIComponent(watchlistId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await parseError(res));
}
