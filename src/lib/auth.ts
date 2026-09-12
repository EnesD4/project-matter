import { emptySafetyNet, parseSafetyNet, type SafetyNetConfig } from "./safetyNet";
import { readLocalItem } from "./storage";

export type { SafetyNetConfig };

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:5000";

const TOKEN_KEY = "sprout_jwt";
const USER_KEY = "sprout_user_profile";
const LEGACY_TOKEN_KEY = "matterpro_jwt";
const LEGACY_USER_KEY = "matterpro_user";

export type UserSettings = {
  hasCompletedOnboarding: boolean;
  hasActiveInvestments: boolean;
  hasActiveDebts: boolean;
  wantsCapitalGrowth: boolean;
  wantsFinancialLiteracy: boolean;
  riskTolerance?: string;
  investmentGoal?: string;
  experienceLevel?: string;
  age?: number | null;
  birthDate?: string | null;
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
    return readLocalItem(TOKEN_KEY, LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = readLocalItem(USER_KEY, LEGACY_USER_KEY);
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
  input: Partial<OnboardingChoices> & {
    hasCompletedOnboarding?: boolean;
    age?: number | null;
    birthDate?: string | null;
  }
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
  purchasedAt?: string | null;
  /** "paper" (manual) or "verified" (API brokerage). Missing values are paper. */
  accountType?: string | null;
  createdAt: string;
};

export async function fetchPortfolio(): Promise<PortfolioApiItem[]> {
  const res = await authFetch("/api/portfolio");
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PortfolioApiItem[];
}

/** Add a paper lot, or merge into the existing paper position for that ticker. */
export async function createPortfolioItem(input: {
  symbol: string;
  shares: number;
  buyPrice: number;
  purchasedAt?: string | null;
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

export type SellPortfolioResult =
  | { deleted: true; id: string; sharesSold: number; sellPrice: number }
  | { deleted: false; item: PortfolioApiItem; sharesSold: number; sellPrice: number };

/** Reduce a paper position. Remaining shares keep the current average cost; 0 shares deletes the row. */
export async function sellPortfolioItem(
  id: string,
  input: { shares: number; sellPrice: number }
): Promise<SellPortfolioResult> {
  const res = await authFetch(`/api/portfolio/${encodeURIComponent(id)}/sell`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as PortfolioApiItem & {
    deleted?: boolean;
    id?: string;
    sharesSold?: number;
    sellPrice?: number;
  };
  const sharesSold = Number(data.sharesSold);
  const sellPrice = Number(data.sellPrice);
  if (data.deleted) {
    return {
      deleted: true,
      id: data.id || id,
      sharesSold: Number.isFinite(sharesSold) ? sharesSold : input.shares,
      sellPrice: Number.isFinite(sellPrice) ? sellPrice : input.sellPrice,
    };
  }
  return {
    deleted: false,
    item: data,
    sharesSold: Number.isFinite(sharesSold) ? sharesSold : input.shares,
    sellPrice: Number.isFinite(sellPrice) ? sellPrice : input.sellPrice,
  };
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
  return `sprout_watchlists_${user?.id ?? "anon"}`;
}

function watchlistCacheLegacyKey() {
  const user = getStoredUser();
  return `matterpro_watchlists_${user?.id ?? "anon"}`;
}

export function readWatchlistCache(): WatchlistApiList[] {
  try {
    const raw = readLocalItem(watchlistCacheKey(), watchlistCacheLegacyKey());
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

export type CashFlowExpense = { id: string; label: string; amount: number };

export type CashFlowDebt = {
  id: string;
  title: string;
  originalBalance: number;
  balance: number;
  minPayment: number;
  apr: number;
};

export type CashFlowSnapshot = {
  monthlyIncome: number;
  emergencyFund: number;
  extraPayoff: number;
  expenses: CashFlowExpense[];
  debts: CashFlowDebt[];
  safetyNet: SafetyNetConfig;
  updatedAt: number;
};

export function emptyCashFlow(): CashFlowSnapshot {
  return {
    monthlyIncome: 0,
    emergencyFund: 0,
    extraPayoff: 0,
    expenses: [],
    debts: [],
    safetyNet: emptySafetyNet(),
    updatedAt: 0,
  };
}

function cashFlowCacheKey(userId?: string | null) {
  return `sprout_cashflow_${userId || getStoredUser()?.id || "anon"}`;
}

function cashFlowCacheLegacyKey(userId?: string | null) {
  return `matterpro_cashflow_${userId || getStoredUser()?.id || "anon"}`;
}

function asFiniteMoney(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseCashFlowSnapshot(raw: unknown): CashFlowSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const expenses = Array.isArray(rec.expenses)
    ? rec.expenses
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          id: String(item.id || ""),
          label: String(item.label || "").trim(),
          amount: asFiniteMoney(item.amount),
        }))
        .filter((item) => item.id && item.label)
    : [];
  const debts = Array.isArray(rec.debts)
    ? rec.debts
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          id: String(item.id || ""),
          title: String(item.title || "").trim() || "Untitled Debt",
          originalBalance: asFiniteMoney(item.originalBalance),
          balance: asFiniteMoney(item.balance),
          minPayment: asFiniteMoney(item.minPayment),
          apr: asFiniteMoney(item.apr),
        }))
        .filter((item) => item.id)
    : [];
  const updatedAtRaw = rec.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "number" && Number.isFinite(updatedAtRaw)
      ? updatedAtRaw
      : typeof updatedAtRaw === "string"
        ? Date.parse(updatedAtRaw) || 0
        : 0;
  return {
    monthlyIncome: asFiniteMoney(rec.monthlyIncome),
    emergencyFund: asFiniteMoney(rec.emergencyFund),
    extraPayoff: asFiniteMoney(rec.extraPayoff),
    expenses,
    debts,
    safetyNet: parseSafetyNet(rec.safetyNet),
    updatedAt,
  };
}

export function readCashFlowCache(userId?: string | null): CashFlowSnapshot {
  try {
    const raw = readLocalItem(cashFlowCacheKey(userId), cashFlowCacheLegacyKey(userId));
    if (!raw) return emptyCashFlow();
    return parseCashFlowSnapshot(JSON.parse(raw)) ?? emptyCashFlow();
  } catch {
    return emptyCashFlow();
  }
}

export function writeCashFlowCache(snapshot: CashFlowSnapshot, userId?: string | null) {
  try {
    localStorage.setItem(cashFlowCacheKey(userId), JSON.stringify(snapshot));
  } catch {
    // ignore quota / private-mode failures
  }
}

export function clearCashFlowCache(userId?: string | null) {
  try {
    localStorage.removeItem(cashFlowCacheKey(userId));
  } catch {
    // ignore
  }
}

export async function fetchCashFlow(): Promise<CashFlowSnapshot> {
  const res = await authFetch("/api/cash-flow");
  if (!res.ok) throw new Error(await parseError(res));
  return parseCashFlowSnapshot(await res.json()) ?? emptyCashFlow();
}

export async function saveCashFlow(snapshot: CashFlowSnapshot): Promise<CashFlowSnapshot> {
  const res = await authFetch("/api/cash-flow", {
    method: "PUT",
    body: JSON.stringify({
      monthlyIncome: snapshot.monthlyIncome,
      emergencyFund: snapshot.emergencyFund,
      extraPayoff: snapshot.extraPayoff,
      expenses: snapshot.expenses,
      debts: snapshot.debts,
      safetyNet: snapshot.safetyNet,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseCashFlowSnapshot(await res.json()) ?? snapshot;
}
