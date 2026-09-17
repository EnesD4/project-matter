import { getPlaidClientId, getPlaidSecret } from "./env.js";

/** Official Plaid host map — same keys as `PlaidEnvironments` from the Plaid Node SDK. */
export const PlaidEnvironments = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
} as const;

export type PlaidEnvironmentName = keyof typeof PlaidEnvironments;

export function resolvePlaidEnvironment(): string {
  const env = String(process.env.PLAID_ENV || "").trim().toLowerCase() as PlaidEnvironmentName;
  return PlaidEnvironments[env] || PlaidEnvironments.sandbox;
}

export type PlaidAccount = {
  id: string;
  name: string;
  officialName: string;
  type: "depository" | "investment" | "credit" | "loan";
  subtype: string;
  mask: string;
  institution: string;
  balance: number;
  availableBalance?: number;
  isoCurrency?: string;
  minPayment?: number;
  apr?: number;
};

export type PlaidHolding = {
  id: string;
  userId: string;
  symbol: string;
  shares: number;
  buyPrice: number;
  purchasedAt: string | null;
  accountType: "verified";
  createdAt: string;
  name?: string;
  accountId?: string;
  securityType?: string;
  isCashEquivalent?: boolean;
};

export type PlaidInvestmentsMap = {
  holdings: PlaidHolding[];
  /** Sweep / settlement / money-market cash sitting uninvested in brokerage accounts. */
  brokerageCash: number;
};

export type PlaidTransaction = {
  id: string;
  date: string;
  name: string;
  amount: number;
  category: string;
};

export type PlaidSnapshot = {
  institution: string;
  itemId: string;
  accounts: PlaidAccount[];
  holdings: PlaidHolding[];
  /** Uninvested cash inside investment/brokerage accounts. */
  brokerageCash: number;
  transactions: PlaidTransaction[];
};

type PlaidJson = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function plaidRequest(path: string, body: Record<string, unknown> = {}): Promise<PlaidJson> {
  const client_id = String(process.env.PLAID_CLIENT_ID || "").trim() || getPlaidClientId();
  const secret = String(process.env.PLAID_SECRET || "").trim() || getPlaidSecret();
  const host = resolvePlaidEnvironment();
  const response = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id,
      secret,
      ...body,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as PlaidJson;
  if (!response.ok) {
    const code = typeof json.error_code === "string" ? json.error_code : "";
    const message =
      (typeof json.error_message === "string" && json.error_message) ||
      code ||
      `Plaid ${path} failed`;
    const error = new Error(code && message !== code ? `${code}: ${message}` : message) as Error & {
      response?: { data: PlaidJson; status: number };
    };
    error.response = { data: json, status: response.status };
    throw error;
  }
  return json;
}

export function plaidErrorResponseData(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined;
  const rec = error as { response?: { data?: unknown }; data?: unknown };
  return rec.response?.data ?? rec.data;
}

export function logPlaidError(context: string, error: unknown): void {
  const rec = error && typeof error === "object" ? (error as { response?: { data?: unknown }; message?: string }) : null;
  const message = rec?.response?.data || rec?.message || (error instanceof Error ? error.message : error);
  console.error(context, message);
}

export function isPlaidCredentialError(error: unknown): boolean {
  const data = plaidErrorResponseData(error);
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const code = String(rec.error_code || "");
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /INVALID_API_KEYS|INVALID_CLIENT_ID|INVALID_SECRET|UNAUTHORIZED/.test(`${code} ${message}`);
}

function hashClientUserId(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 33 + value.charCodeAt(i)) >>> 0;
  return `user-${hash.toString(16)}`;
}

/** Plaid rejects emails, JWTs, and other PII in `user.client_user_id`. */
export function sanitizePlaidClientUserId(raw: string): string {
  const value = raw.trim();
  if (!value) return "user_default";
  const looksLikeEmail = /@/.test(value);
  const looksLikeJwt = value.split(".").length === 3 && value.length > 80;
  const looksLikeToken = value.length > 64 && /[-_]/.test(value);
  if (looksLikeEmail || looksLikeJwt || looksLikeToken || value.length > 256) {
    return hashClientUserId(value);
  }
  return value.slice(0, 256);
}

/** Link intent: bank cash flows vs brokerage investments (holdings + uninvested cash). */
export type PlaidLinkMode = "bank" | "brokerage";

export function resolvePlaidLinkMode(raw: unknown): PlaidLinkMode {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "brokerage" || value === "investments" || value === "investment" || value === "broker") {
    return "brokerage";
  }
  return "bank";
}

/**
 * Official Plaid /link/token/create payload used by create-link-token.
 * - bank: Transactions required; Investments optional (checking/savings + holdings when supported).
 * - brokerage: Investments required so Link is limited to US investment institutions
 *   (Robinhood, Fidelity, Schwab, E*TRADE, Webull, …); Transactions optional for cash-flow history.
 */
export async function linkTokenCreate(
  user_id?: string,
  options?: { mode?: PlaidLinkMode }
): Promise<string> {
  const client_id = String(process.env.PLAID_CLIENT_ID || "").trim() || getPlaidClientId();
  const secret = String(process.env.PLAID_SECRET || "").trim() || getPlaidSecret();
  if (!client_id || !secret) {
    throw new Error("PLAID_CLIENT_ID or PLAID_SECRET is missing or invalid.");
  }

  const mode = options?.mode || "bank";
  const payload: Record<string, unknown> = {
    user: { client_user_id: sanitizePlaidClientUserId(user_id || "user_default") || "user_default" },
    client_name: "Sprout",
    country_codes: ["US"],
    language: "en",
  };

  if (mode === "brokerage") {
    // Investments-required Link: US brokerage / IRA / 401(k) institutions only
    // (Robinhood, Fidelity, Schwab, E*TRADE, Webull, …) — not checking/savings banks.
    payload.products = ["investments"];
    payload.optional_products = ["transactions"];
    payload.account_filters = {
      investment: {
        account_subtypes: ["all"],
      },
    };
  } else {
    // Transactions for checking/savings cash flow; investments when the institution supports it.
    payload.products = ["transactions"];
    payload.optional_products = ["investments"];
  }

  const redirect = process.env.PLAID_REDIRECT_URI?.trim();
  if (redirect) payload.redirect_uri = redirect;

  try {
    const json = await plaidRequest("/link/token/create", payload);
    const token = String(json.link_token || "");
    if (!token) throw new Error("Plaid did not return a link token");
    return token;
  } catch (err) {
    const rec = err && typeof err === "object" ? (err as { response?: { data?: unknown }; message?: string }) : null;
    console.error(rec?.response?.data || rec?.message || (err instanceof Error ? err.message : err));
    throw err;
  }
}

export const createLinkToken = linkTokenCreate;

export async function exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
  const json = await plaidRequest("/item/public_token/exchange", { public_token: publicToken });
  const accessToken = String(json.access_token || "");
  const itemId = String(json.item_id || "");
  if (!accessToken) throw new Error("Plaid token exchange failed");
  return { accessToken, itemId };
}

export function mapPlaidAccounts(raw: unknown, institution: string): PlaidAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const balances = asRecord(item.balances);
      const type = String(item.type || "depository");
      const subtype = String(item.subtype || "checking");
      return {
        id: String(item.account_id || item.id || `plaid-${Math.random().toString(36).slice(2, 8)}`),
        name: String(item.name || "Linked account"),
        officialName: String(item.official_name || item.name || "Linked account"),
        type: (["depository", "investment", "credit", "loan"].includes(type)
          ? type
          : "depository") as PlaidAccount["type"],
        subtype,
        mask: String(item.mask || ""),
        institution,
        balance: Number(balances.current ?? balances.available ?? 0) || 0,
        availableBalance: Number(balances.available ?? balances.current ?? 0) || 0,
        isoCurrency: String(balances.iso_currency_code || "USD"),
      };
    });
}

export function mapPlaidTransactions(raw: unknown): PlaidTransaction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const categories = Array.isArray(item.category) ? item.category.map(String) : [];
      const pfc = asRecord(item.personal_finance_category);
      const category =
        (typeof pfc.primary === "string" && pfc.primary) ||
        categories[0] ||
        "Other";
      const plaidAmount = Number(item.amount) || 0;
      return {
        id: String(item.transaction_id || item.id || `txn-${Math.random().toString(36).slice(2, 8)}`),
        date: String(item.date || "").slice(0, 10),
        name: String(item.name || item.merchant_name || "Transaction"),
        amount: -plaidAmount,
        category,
      };
    });
}

const CASH_TICKER_RE = /^(CUR:)?USD$|^USD[A-Z]{0,3}$|^SPAXX$|^VMFXX$|^FDRXX$|^SPRXX$|^SNSXX$|^QCASH$|^CASH$/i;
const CASH_NAME_RE = /\b(cash|sweep|settlement|money\s*market|uninvested|pending\s*cash)\b/i;

function isCashLikeSecurity(security: Record<string, unknown>, symbol: string, name: string): boolean {
  const type = String(security.type || "").toLowerCase();
  if (type === "cash" || type === "currency") return true;
  if (security.is_cash_equivalent === true) return true;
  if (CASH_TICKER_RE.test(symbol)) return true;
  if (CASH_NAME_RE.test(name)) return true;
  return false;
}

function isInvestmentAccount(account: PlaidAccount): boolean {
  if (account.type === "investment") return true;
  return /\b(brokerage|investment|401\s*\(?k\)?|ira|roth|hsa)\b/i.test(
    `${account.subtype} ${account.name} ${account.officialName}`
  );
}

/**
 * Maps Plaid Investments holdings. Equity/ETF lots become portfolio rows;
 * cash / currency / sweep securities contribute to uninvested brokerage cash.
 */
export function mapPlaidInvestments(
  raw: unknown,
  securities: unknown,
  accounts: PlaidAccount[] = [],
  now = new Date().toISOString()
): PlaidInvestmentsMap {
  const securityById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(securities)) {
    for (const item of securities) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        securityById.set(String(rec.security_id || ""), rec);
      }
    }
  }

  const holdings: PlaidHolding[] = [];
  let cashFromSecurities = 0;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const security = securityById.get(String(rec.security_id || "")) || {};
      const symbol = String(security.ticker_symbol || rec.ticker_symbol || "").trim().toUpperCase();
      const name = typeof security.name === "string" ? security.name : "";
      const shares = Number(rec.quantity ?? rec.shares) || 0;
      const institutionValue = Number(rec.institution_value);
      const institutionPrice = Number(rec.institution_price || rec.buyPrice) || 0;
      const value =
        Number.isFinite(institutionValue) && institutionValue > 0
          ? institutionValue
          : shares > 0 && institutionPrice > 0
            ? shares * institutionPrice
            : 0;

      if (isCashLikeSecurity(security, symbol, name)) {
        cashFromSecurities += Math.max(0, value);
        continue;
      }

      const buyPrice =
        (shares > 0 && Number.isFinite(institutionValue) && institutionValue > 0
          ? institutionValue / shares
          : institutionPrice) || 0;
      if (!symbol || shares <= 0 || buyPrice <= 0) continue;

      holdings.push({
        id: String(rec.security_id || `plaid-${symbol.toLowerCase()}`),
        userId: "local",
        symbol,
        shares,
        buyPrice,
        purchasedAt: null,
        accountType: "verified",
        createdAt: now,
        name: name || undefined,
        accountId: typeof rec.account_id === "string" ? rec.account_id : undefined,
        securityType: typeof security.type === "string" ? security.type : undefined,
        isCashEquivalent: false,
      });
    }
  }

  const equityValue = holdings.reduce((sum, lot) => sum + lot.shares * lot.buyPrice, 0);
  const investmentBalance = accounts
    .filter(isInvestmentAccount)
    .reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  // Prefer explicit cash securities; otherwise infer sweep cash as account balance − equity.
  const inferredCash = Math.max(0, investmentBalance - equityValue);
  const brokerageCash = cashFromSecurities > 0 ? cashFromSecurities : inferredCash;

  return { holdings, brokerageCash };
}

/** @deprecated Prefer mapPlaidInvestments — kept for callers that only need equity lots. */
export function mapPlaidHoldings(raw: unknown, securities: unknown, now = new Date().toISOString()): PlaidHolding[] {
  return mapPlaidInvestments(raw, securities, [], now).holdings;
}

export async function fetchPlaidSnapshot(accessToken: string, institution: string, itemId = ""): Promise<PlaidSnapshot> {
  const accountsRes = await plaidRequest("/accounts/get", { access_token: accessToken });
  const accounts = mapPlaidAccounts(accountsRes.accounts, institution);
  const now = new Date().toISOString();

  let transactions: PlaidTransaction[] = [];
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 90);
    const tx = await plaidRequest("/transactions/get", {
      access_token: accessToken,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    });
    transactions = mapPlaidTransactions(tx.transactions);
  } catch {
    transactions = [];
  }

  let holdings: PlaidHolding[] = [];
  let brokerageCash = 0;
  try {
    const investments = await plaidRequest("/investments/holdings/get", { access_token: accessToken });
    const mapped = mapPlaidInvestments(investments.holdings, investments.securities, accounts, now);
    holdings = mapped.holdings;
    brokerageCash = mapped.brokerageCash;
  } catch {
    // Item may only have Transactions product — still surface investment account balances as cash.
    const investmentBalance = accounts
      .filter(isInvestmentAccount)
      .reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
    brokerageCash = investmentBalance;
    holdings = [];
  }

  return { institution, itemId, accounts, holdings, brokerageCash, transactions };
}

export function pickBalance(accounts: PlaidAccount[], match: (account: PlaidAccount) => boolean): number {
  return accounts.filter(match).reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
}
