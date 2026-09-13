import { getPlaidClientId, getPlaidEnv, getPlaidSecret } from "./env";

const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
} as const;

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
  transactions: PlaidTransaction[];
};

type PlaidJson = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function plaidRequest(path: string, body: Record<string, unknown> = {}): Promise<PlaidJson> {
  const host = PLAID_HOSTS[getPlaidEnv()];
  const response = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: getPlaidClientId(),
      secret: getPlaidSecret(),
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
  const data = plaidErrorResponseData(error);
  console.error(`${context}:`, data ?? error);
  if (data != null) {
    console.error(`${context} complete error:`, error);
  }
}

export function isPlaidCredentialError(error: unknown): boolean {
  const data = plaidErrorResponseData(error);
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const code = String(rec.error_code || "");
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /INVALID_API_KEYS|INVALID_CLIENT_ID|INVALID_SECRET|UNAUTHORIZED/.test(`${code} ${message}`);
}

/** Plaid rejects JWTs / oversized ids. Keep a stable, non-PII client_user_id. */
export function sanitizePlaidClientUserId(raw: string): string {
  const value = raw.trim();
  if (!value) return `guest-${Date.now()}`;
  const looksLikeJwt = value.split(".").length === 3 && value.length > 80;
  if (!looksLikeJwt && value.length <= 256) return value.slice(0, 256);
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 33 + value.charCodeAt(i)) >>> 0;
  return `user-${hash.toString(16)}`;
}

export async function createLinkToken(clientUserId: string): Promise<string> {
  const payload: Record<string, unknown> = {
    client_name: "Sprout",
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: sanitizePlaidClientUserId(clientUserId) },
    products: ["transactions"],
  };
  const redirect = process.env.PLAID_REDIRECT_URI?.trim();
  if (redirect) payload.redirect_uri = redirect;

  const json = await plaidRequest("/link/token/create", payload);
  const token = String(json.link_token || "");
  if (!token) throw new Error("Plaid did not return a link token");
  return token;
}

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

export function mapPlaidHoldings(raw: unknown, securities: unknown, now = new Date().toISOString()): PlaidHolding[] {
  const securityById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(securities)) {
    for (const item of securities) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        securityById.set(String(rec.security_id || ""), rec);
      }
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const security = securityById.get(String(item.security_id || "")) || {};
      const symbol = String(security.ticker_symbol || item.ticker_symbol || "").trim().toUpperCase();
      const shares = Number(item.quantity ?? item.shares);
      const value = Number(item.institution_value);
      const buyPrice =
        shares > 0 && Number.isFinite(value) ? value / shares : Number(item.institution_price || item.buyPrice);
      return {
        id: String(item.security_id || `plaid-${symbol.toLowerCase()}`),
        userId: "local",
        symbol,
        shares,
        buyPrice,
        purchasedAt: null,
        accountType: "verified" as const,
        createdAt: now,
        name: typeof security.name === "string" ? security.name : undefined,
      };
    })
    .filter((item) => item.symbol && item.shares > 0 && item.buyPrice > 0);
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
  try {
    const investments = await plaidRequest("/investments/holdings/get", { access_token: accessToken });
    holdings = mapPlaidHoldings(investments.holdings, investments.securities, now);
  } catch {
    holdings = [];
  }

  return { institution, itemId, accounts, holdings, transactions };
}

export function pickBalance(accounts: PlaidAccount[], match: (account: PlaidAccount) => boolean): number {
  return accounts.filter(match).reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
}
