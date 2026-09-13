import { getStoredUser, getToken, type CashFlowDebt, type PortfolioApiItem } from "./auth";
import { serverlessFetch } from "./serverless";
import {
  cashReservesFromAccounts,
  debtsFromAccounts,
  fetchBankAccounts,
  persistBankAccounts,
  type LinkedBankAccount,
} from "./bankAccounts";
import {
  detectRetirementAssets,
  summarizeBankActivity,
  type BankTransaction,
  type DetectedRetirement,
} from "./bankActivity";
import { clearActiveDemoScenario } from "./demoScenarios";
import type { SafetyNetReserveLine } from "./safetyNet";
import { getSupabaseAccessToken, getSupabaseUserId } from "./supabaseSync";

export const PLAID_CONNECTED_EVENT = "matterpro:plaid-connected";
export const PLAID_SANDBOX_CONNECTED_EVENT = PLAID_CONNECTED_EVENT;

export type PlaidLinkHolding = PortfolioApiItem & {
  name?: string;
};

export type PlaidLinkAccount = LinkedBankAccount & {
  id: string;
  name: string;
  officialName: string;
  type: "depository" | "investment" | "credit" | "loan";
  subtype: string;
  mask: string;
  institution: string;
  balance: number;
};

export type PlaidLinkResult = {
  institution: string;
  chaseChecking: number;
  marcusHysa: number;
  moneyMarket: number;
  monthlyIncome: number;
  accounts: PlaidLinkAccount[];
  holdings: PlaidLinkHolding[];
  transactions: BankTransaction[];
  expenses: ReturnType<typeof summarizeBankActivity>["expenses"];
  retirement: DetectedRetirement | null;
  debts: CashFlowDebt[];
  reserveLines: SafetyNetReserveLine[];
};

export type PlaidSandboxAccount = PlaidLinkAccount;
export type PlaidSandboxHolding = PlaidLinkHolding;
export type PlaidSandboxResult = PlaidLinkResult;

function localId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

async function plaidApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const supabaseToken = await getSupabaseAccessToken();
  const sproutToken = getToken();
  if (supabaseToken) headers.set("Authorization", `Bearer ${supabaseToken}`);
  else if (sproutToken) headers.set("Authorization", `Bearer ${sproutToken}`);
  if (sproutToken) headers.set("X-Sprout-Authorization", `Bearer ${sproutToken}`);
  return serverlessFetch(path, { ...init, headers });
}

function asAccount(raw: unknown): PlaidLinkAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const type = String(item.type || "depository");
  return {
    id: String(item.id || localId("acct")),
    name: String(item.name || item.officialName || "Linked account"),
    officialName: String(item.officialName || item.name || "Linked account"),
    type: (["depository", "investment", "credit", "loan"].includes(type)
      ? type
      : "depository") as PlaidLinkAccount["type"],
    subtype: String(item.subtype || ""),
    mask: String(item.mask || ""),
    institution: String(item.institution || "Linked bank"),
    balance: Number(item.balance) || 0,
    minPayment: item.minPayment != null ? Number(item.minPayment) || undefined : undefined,
    apr: item.apr != null ? Number(item.apr) || undefined : undefined,
  };
}

function pickBalance(accounts: PlaidLinkAccount[], match: (account: PlaidLinkAccount) => boolean): number {
  return accounts.filter(match).reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
}

export function resultFromAccounts(
  accountsInput: LinkedBankAccount[],
  extras: {
    institution?: string;
    holdings?: PlaidLinkHolding[];
    transactions?: BankTransaction[];
  } = {}
): PlaidLinkResult {
  const accounts = accountsInput
    .map(asAccount)
    .filter((account): account is PlaidLinkAccount => Boolean(account));
  const transactions = extras.transactions || [];
  const activity = summarizeBankActivity(transactions);
  const retirement = detectRetirementAssets(accounts);
  const reserves = cashReservesFromAccounts(accounts);
  const chaseChecking = pickBalance(
    accounts,
    (account) => account.type === "depository" && /check/i.test(`${account.subtype} ${account.name}`)
  );
  const marcusHysa = pickBalance(
    accounts,
    (account) => account.type === "depository" && /sav/i.test(`${account.subtype} ${account.name}`)
  );
  const moneyMarket = pickBalance(accounts, (account) =>
    /money/.test(`${account.subtype} ${account.name}`.toLowerCase())
  );
  return {
    institution: extras.institution || accounts[0]?.institution || "Linked bank",
    chaseChecking: reserves.liquidCash || chaseChecking,
    marcusHysa: marcusHysa || reserves.yieldCash - moneyMarket,
    moneyMarket,
    monthlyIncome: activity.monthlyIncome,
    accounts,
    holdings: extras.holdings || [],
    transactions,
    expenses: activity.expenses,
    retirement: retirement.present ? retirement : null,
    debts: debtsFromAccounts(accounts),
    reserveLines: reserves.lines,
  };
}

export function parsePlaidLinkResult(raw: unknown): PlaidLinkResult | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const accounts = Array.isArray(rec.accounts)
    ? rec.accounts.map(asAccount).filter((account): account is PlaidLinkAccount => Boolean(account))
    : [];
  const holdings = Array.isArray(rec.holdings)
    ? rec.holdings
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          id: String(item.id || localId("plaid")),
          userId: String(item.userId || "local"),
          symbol: String(item.symbol || "").trim().toUpperCase(),
          shares: Number(item.shares),
          buyPrice: Number(item.buyPrice),
          purchasedAt: typeof item.purchasedAt === "string" ? item.purchasedAt : null,
          accountType: "verified" as const,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
          name: typeof item.name === "string" ? item.name : undefined,
        }))
        .filter((item) => item.symbol && item.shares > 0 && item.buyPrice > 0)
    : [];
  const transactions = Array.isArray(rec.transactions) ? (rec.transactions as BankTransaction[]) : [];
  if (accounts.length === 0 && holdings.length === 0 && transactions.length === 0) return null;
  return resultFromAccounts(accounts, {
    institution: typeof rec.institution === "string" ? rec.institution : undefined,
    holdings,
    transactions,
  });
}

export const parsePlaidSandboxResult = parsePlaidLinkResult;

export function dispatchPlaidConnected(result: PlaidLinkResult) {
  clearActiveDemoScenario();
  window.dispatchEvent(new CustomEvent<PlaidLinkResult>(PLAID_CONNECTED_EVENT, { detail: result }));
}

export const dispatchPlaidSandboxConnected = dispatchPlaidConnected;

function plaidClientUserId(raw: string): string {
  const value = raw.trim();
  if (!value) return `guest-${Date.now()}`;
  const looksLikeJwt = value.split(".").length === 3 && value.length > 80;
  if (!looksLikeJwt && value.length <= 256) return value.slice(0, 256);
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 33 + value.charCodeAt(i)) >>> 0;
  return `user-${hash.toString(16)}`;
}

export async function createPlaidLinkToken(): Promise<string> {
  const clientUserId = plaidClientUserId(
    (await getSupabaseUserId()) || getStoredUser()?.id || getToken() || `guest-${Date.now()}`
  );
  const response = await plaidApiFetch("/api/plaid/create-link-token", {
    method: "POST",
    body: JSON.stringify({ client_user_id: clientUserId }),
  });
  const text = await response.text();
  let json: { link_token?: string; error?: string; error_message?: string } = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    json = {};
  }
  if (!response.ok || !json.link_token) {
    const htmlFallback = /^\s*</.test(text) ? "Plaid API route was not found" : "";
    throw new Error(json.error || json.error_message || htmlFallback || "Could not start Plaid Link");
  }
  return json.link_token;
}

export async function exchangePlaidPublicToken(
  publicToken: string,
  institution?: { name?: string; institution_id?: string }
): Promise<PlaidLinkResult> {
  const response = await plaidApiFetch("/api/plaid/exchange-token", {
    method: "POST",
    body: JSON.stringify({
      public_token: publicToken,
      institution: institution || {},
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (json as { error?: string }).error || "Could not connect this bank";
    throw new Error(error);
  }
  const parsed = parsePlaidLinkResult(json);
  if (!parsed) throw new Error("Plaid did not return any accounts");
  await persistBankAccounts(parsed.accounts);
  return parsed;
}

export async function refreshPlaidAccounts(): Promise<PlaidLinkResult | null> {
  const response = await plaidApiFetch("/api/plaid/accounts", { method: "POST", body: JSON.stringify({}) });
  if (!response.ok) return null;
  return parsePlaidLinkResult(await response.json().catch(() => null));
}

export async function hydrateLinkedBank(
  onResult: (result: PlaidLinkResult) => void
): Promise<PlaidLinkResult | null> {
  const stored = await fetchBankAccounts();
  if (stored.length > 0) onResult(resultFromAccounts(stored));
  try {
    const live = await refreshPlaidAccounts();
    if (live && live.accounts.length > 0) {
      await persistBankAccounts(live.accounts);
      onResult(live);
      return live;
    }
  } catch {
    // Keep stored Supabase balances when the live Plaid refresh is unavailable.
  }
  return stored.length > 0 ? resultFromAccounts(stored) : null;
}
