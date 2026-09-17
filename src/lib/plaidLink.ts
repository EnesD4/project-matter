import { getStoredUser, getToken, type CashFlowDebt, type PortfolioApiItem, writePortfolioCache } from "./auth";
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
import { clearActiveDemoScenario, buildDemoApplyDetail } from "./demoScenarios";
import { allowClientMockFallback, markClientMockMode } from "./apiBase";
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
  /** Uninvested cash inside linked brokerage / investment accounts. */
  brokerageCash: number;
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
    minPayment: item.minPayment != null ? Number(item.minPayment) || 0 : 0,
    apr: item.apr != null ? Number(item.apr) || 0 : 0,
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
    brokerageCash?: number;
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
  const holdings = extras.holdings || [];
  const equityValue = holdings.reduce(
    (sum, lot) => sum + (Number(lot.shares) || 0) * (Number(lot.buyPrice) || 0),
    0
  );
  const investmentBalances = accounts
    .filter((account) => {
      if (account.type === "investment") return true;
      return /\b(brokerage|investment|401\s*\(?k\)?|ira|roth|hsa)\b/i.test(
        `${account.subtype} ${account.name} ${account.officialName}`
      );
    })
    .reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const inferredCash = Math.max(0, investmentBalances - equityValue);
  const brokerageCash = Math.max(0, Number(extras.brokerageCash) || inferredCash);
  return {
    institution: extras.institution || accounts[0]?.institution || "Linked bank",
    chaseChecking: reserves.liquidCash || chaseChecking,
    marcusHysa: marcusHysa || reserves.yieldCash - moneyMarket,
    moneyMarket,
    brokerageCash,
    monthlyIncome: activity.monthlyIncome,
    accounts,
    holdings,
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
          shares: Number(item.shares) || 0,
          buyPrice: Number(item.buyPrice) || 0,
          purchasedAt: typeof item.purchasedAt === "string" ? item.purchasedAt : null,
          accountType: "verified" as const,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
          name: typeof item.name === "string" ? item.name : undefined,
        }))
        .filter((item) => item.symbol && item.shares > 0 && item.buyPrice > 0)
    : [];
  const transactions = Array.isArray(rec.transactions) ? (rec.transactions as BankTransaction[]) : [];
  const nestedCash = rec.cash && typeof rec.cash === "object" ? (rec.cash as Record<string, unknown>) : null;
  const brokerageCash =
    Number(rec.brokerageCash) ||
    Number(nestedCash?.brokerageCash) ||
    0;
  if (accounts.length === 0 && holdings.length === 0 && transactions.length === 0 && brokerageCash <= 0) {
    return null;
  }
  return resultFromAccounts(accounts, {
    institution: typeof rec.institution === "string" ? rec.institution : undefined,
    holdings,
    transactions,
    brokerageCash,
  });
}

export const parsePlaidSandboxResult = parsePlaidLinkResult;

export function dispatchPlaidConnected(result: PlaidLinkResult) {
  clearActiveDemoScenario();
  window.dispatchEvent(new CustomEvent<PlaidLinkResult>(PLAID_CONNECTED_EVENT, { detail: result }));
}

export const dispatchPlaidSandboxConnected = dispatchPlaidConnected;

/** Detect missing / invalid Plaid (or SnapTrade-style) API credentials from an error message. */
export function isExternalBrokerageCredentialsError(message: string): boolean {
  return /PLAID_CLIENT_ID|PLAID_SECRET|Plaid is not configured|missing or invalid|SnapTrade|credentials/i.test(
    String(message || "")
  );
}

/**
 * Local interactive mock for Verified Brokerage when live Plaid/SnapTrade credentials are absent.
 * Uses the balanced demo holdings so every portfolio tab stays fully usable offline.
 */
export function buildLocalMockBrokerageResult(
  institutionHint = "Local Demo Brokerage"
): PlaidLinkResult {
  const detail = buildDemoApplyDetail("balanced");
  const brokerName = String(institutionHint || detail.brokerName || "Local Demo Brokerage").trim();
  const brokerageCash = Math.max(0, Number(detail.brokerageCash) || 2500);
  const holdings: PlaidLinkHolding[] = (detail.holdings || []).map((lot) => ({
    ...lot,
    accountType: "verified" as const,
    name: lot.symbol,
  }));
  const accounts: PlaidLinkAccount[] = [
    {
      id: localId("mock-broker"),
      name: `${brokerName} Brokerage`,
      officialName: `${brokerName} Investment Account`,
      type: "investment",
      subtype: "brokerage",
      mask: "0000",
      institution: brokerName,
      balance:
        brokerageCash +
        holdings.reduce((sum, lot) => sum + (Number(lot.shares) || 0) * (Number(lot.buyPrice) || 0), 0),
    },
    {
      id: localId("mock-check"),
      name: "Everyday Checking",
      officialName: "Everyday Checking",
      type: "depository",
      subtype: "checking",
      mask: "1111",
      institution: brokerName,
      balance: Math.max(0, Number(detail.cash) || 0),
    },
    {
      id: localId("mock-save"),
      name: "High-Yield Savings",
      officialName: "High-Yield Savings",
      type: "depository",
      subtype: "savings",
      mask: "2222",
      institution: brokerName,
      balance: Math.max(0, Number(detail.hysa) || 0),
    },
  ];
  return resultFromAccounts(accounts, {
    institution: brokerName,
    holdings,
    transactions: detail.transactions || [],
    brokerageCash,
  });
}

/**
 * When live brokerage APIs are unavailable locally, seed Verified Brokerage with mock state
 * and keep Paper Trading / portfolio tabs fully interactive.
 */
export function connectLocalMockBrokerage(institutionHint?: string): PlaidLinkResult {
  markClientMockMode();
  const result = buildLocalMockBrokerageResult(institutionHint);
  try {
    void persistBankAccounts(result.accounts);
  } catch {
    // local-only — ignore persistence failures
  }
  try {
    writePortfolioCache(result.holdings);
  } catch {
    // ignore quota
  }
  dispatchPlaidConnected(result);
  return result;
}

function plaidClientUserId(raw: string): string {
  const value = raw.trim();
  if (!value) return "user_default";
  const looksLikeEmail = /@/.test(value);
  const looksLikeJwt = value.split(".").length === 3 && value.length > 80;
  const looksLikeToken = value.length > 64 && /[-_]/.test(value);
  if (!looksLikeEmail && !looksLikeJwt && !looksLikeToken && value.length <= 256) {
    return value.slice(0, 256);
  }
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 33 + value.charCodeAt(i)) >>> 0;
  return `user-${hash.toString(16)}`;
}

export async function createPlaidLinkToken(mode: "bank" | "brokerage" = "bank"): Promise<string> {
  const clientUserId = plaidClientUserId(
    (await getSupabaseUserId()) || getStoredUser()?.id || getToken() || `guest-${Date.now()}`
  );
  const response = await plaidApiFetch("/api/plaid/create-link-token", {
    method: "POST",
    body: JSON.stringify({ user_id: clientUserId, client_user_id: clientUserId, mode }),
  });
  const text = await response.text();
  let json: { link_token?: string; error?: unknown; error_message?: string } = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    json = {};
  }
  if (!response.ok || !json.link_token) {
    const htmlFallback = /^\s*</.test(text) ? "Plaid API route was not found" : "";
    const errorText =
      typeof json.error === "string"
        ? json.error
        : json.error && typeof json.error === "object"
          ? String((json.error as { error_message?: string }).error_message || JSON.stringify(json.error))
          : "";
    throw new Error(errorText || json.error_message || htmlFallback || "Could not start Plaid Link");
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
  try {
    await persistBankAccounts(parsed.accounts);
  } catch {
    // Missing bank_accounts table must not fail the Plaid connection.
  }
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
  let stored: LinkedBankAccount[] = [];
  try {
    stored = await fetchBankAccounts();
  } catch {
    stored = [];
  }
  if (stored.length > 0) onResult(resultFromAccounts(stored));
  try {
    const live = await refreshPlaidAccounts();
    if (live && live.accounts.length > 0) {
      try {
        await persistBankAccounts(live.accounts);
      } catch {
        // Ignore missing bank_accounts / write errors.
      }
      onResult(live);
      return live;
    }
  } catch {
    // Keep stored Supabase balances when the live Plaid refresh is unavailable.
  }
  return stored.length > 0 ? resultFromAccounts(stored) : null;
}
