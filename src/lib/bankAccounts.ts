import type { CashFlowDebt } from "./auth";
import type { SafetyNetReserveLine } from "./safetyNet";
import { canReachSupabase, getSupabase, type BankAccountRow } from "./supabase";
import { getSupabaseUserId } from "./supabaseSync";

export type LinkedBankAccount = {
  id?: string;
  name?: string;
  officialName?: string;
  type?: string;
  subtype?: string;
  institution?: string;
  mask?: string;
  balance?: number;
  minPayment?: number;
  apr?: number;
};

export type LinkedCashReserves = {
  liquidCash: number;
  yieldCash: number;
  lines: SafetyNetReserveLine[];
};

const CREDIT_RE = /\b(credit|card|visa|mastercard|amex|discover|charge)\b/i;
const LOAN_RE = /\b(loan|mortgage|auto|student|liabilit|heloc|line of credit)\b/i;
const YIELD_RE = /\b(hysa|high[-\s]?yield|savings|money[-\s]?market|mma|cash[-\s]?management|yield|cd\b|certificate of deposit)\b/i;
const MONEY_MARKET_RE = /\b(money[-\s]?market|mma|spaxx|cash[-\s]?management)\b/i;
const HYSA_RE = /\b(hysa|high[-\s]?yield|marcus|ally|wealthfront|sofi savings)\b/i;
const CHECKING_RE = /\b(checking|debit|spend|everyday)\b/i;
const CASH_RE = /\b(cash|currency|vault)\b/i;
const INVESTMENT_RE = /\b(brokerage|investment|401\s*\(?k\)?|ira|roth|hsa)\b/i;

function blob(account: LinkedBankAccount): string {
  return [account.type, account.subtype, account.name, account.officialName, account.institution]
    .filter(Boolean)
    .join(" ");
}

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isLiabilityAccount(account: LinkedBankAccount): boolean {
  const type = (account.type ?? "").toLowerCase();
  const subtype = (account.subtype ?? "").toLowerCase();
  if (type === "credit" || type === "loan") return true;
  if (subtype.includes("credit") || subtype.includes("loan")) return true;
  const text = blob(account);
  return CREDIT_RE.test(text) || LOAN_RE.test(text);
}

export function isInvestmentAccount(account: LinkedBankAccount): boolean {
  const type = (account.type ?? "").toLowerCase();
  if (type === "investment") return true;
  return INVESTMENT_RE.test(blob(account)) && !isLiabilityAccount(account);
}

export function isYieldReserveAccount(account: LinkedBankAccount): boolean {
  if (isLiabilityAccount(account) || isInvestmentAccount(account)) return false;
  const subtype = (account.subtype ?? "").toLowerCase();
  if (subtype.includes("saving") || subtype.includes("money market") || subtype.includes("cd")) return true;
  return YIELD_RE.test(blob(account));
}

export function isLiquidCashAccount(account: LinkedBankAccount): boolean {
  if (isLiabilityAccount(account) || isInvestmentAccount(account) || isYieldReserveAccount(account)) {
    return false;
  }
  const subtype = (account.subtype ?? "").toLowerCase();
  if (subtype.includes("checking") || subtype === "cash") return true;
  const text = blob(account);
  return CHECKING_RE.test(text) || CASH_RE.test(text);
}

function reserveKind(account: LinkedBankAccount): SafetyNetReserveLine["kind"] {
  const text = blob(account);
  if (MONEY_MARKET_RE.test(text) || (account.subtype ?? "").toLowerCase().includes("money market")) {
    return "money-market";
  }
  if (HYSA_RE.test(text) || (account.subtype ?? "").toLowerCase().includes("saving")) return "hysa";
  if (CHECKING_RE.test(text) || (account.subtype ?? "").toLowerCase().includes("checking")) return "checking";
  return "cash";
}

function accountLabel(account: LinkedBankAccount, fallback: string): string {
  const name = String(account.name || account.officialName || "").trim();
  if (name) return name;
  if (account.institution) return `${account.institution} ${fallback}`;
  return fallback;
}

function defaultApr(account: LinkedBankAccount): number {
  const text = blob(account);
  if (/mortgage|heloc/i.test(text)) return 6.5;
  if (/auto|car/i.test(text)) return 7.2;
  if (/student/i.test(text)) return 6.8;
  return 21.99;
}

function defaultMinPayment(balance: number, apr: number): number {
  const interestFloor = Math.round(((balance * apr) / 100 / 12) * 100) / 100;
  return Math.max(25, Math.round(Math.max(balance * 0.03, interestFloor + 15)));
}

export function debtsFromAccounts(accounts: LinkedBankAccount[] = []): CashFlowDebt[] {
  return accounts
    .filter(isLiabilityAccount)
    .map((account, index) => {
      const balance = money(account.balance);
      const apr = money(account.apr) || defaultApr(account);
      const minPayment = money(account.minPayment) || defaultMinPayment(balance, apr);
      return {
        id: String(account.id || `bank-debt-${index}`),
        title: accountLabel(account, "Credit card"),
        originalBalance: balance,
        balance,
        minPayment,
        apr,
      };
    })
    .filter((debt) => debt.balance > 0);
}

export function cashReservesFromAccounts(accounts: LinkedBankAccount[] = []): LinkedCashReserves {
  const lines: SafetyNetReserveLine[] = [];
  let liquidCash = 0;
  let yieldCash = 0;

  accounts.forEach((account, index) => {
    const balance = money(account.balance);
    if (balance <= 0) return;
    if (isYieldReserveAccount(account)) {
      const kind = reserveKind(account);
      yieldCash += balance;
      lines.push({
        id: String(account.id || `yield-${index}`),
        label: accountLabel(account, kind === "money-market" ? "Money market" : "High-yield savings"),
        kind: kind === "checking" || kind === "cash" ? "hysa" : kind,
        balance,
      });
      return;
    }
    if (isLiquidCashAccount(account)) {
      liquidCash += balance;
      lines.push({
        id: String(account.id || `cash-${index}`),
        label: accountLabel(account, "Checking"),
        kind: reserveKind(account) === "checking" ? "checking" : "cash",
        balance,
      });
    }
  });

  return { liquidCash, yieldCash, lines };
}

export function reserveLinesFromBalances(input: {
  cash?: number;
  hysa?: number;
  moneyMarket?: number;
}): SafetyNetReserveLine[] {
  const lines: SafetyNetReserveLine[] = [];
  const cash = money(input.cash);
  const hysa = money(input.hysa);
  const moneyMarket = money(input.moneyMarket);
  if (cash > 0) {
    lines.push({ id: "linked-checking", label: "Checking", kind: "checking", balance: cash });
  }
  if (hysa > 0) {
    lines.push({
      id: "linked-hysa",
      label: "High-yield savings",
      kind: "hysa",
      balance: hysa,
    });
  }
  if (moneyMarket > 0) {
    lines.push({
      id: "linked-mma",
      label: "Money market",
      kind: "money-market",
      balance: moneyMarket,
    });
  }
  return lines;
}

export function bankAccountFromRow(row: BankAccountRow): LinkedBankAccount {
  return {
    id: row.plaid_account_id || row.id,
    name: row.name,
    officialName: row.official_name || row.name,
    type: row.type,
    subtype: row.subtype || undefined,
    institution: row.institution || undefined,
    mask: row.mask || undefined,
    balance: Number(row.balance) || 0,
    minPayment: row.min_payment != null ? Number(row.min_payment) : undefined,
    apr: row.apr != null ? Number(row.apr) : undefined,
  };
}

export async function fetchBankAccounts(): Promise<LinkedBankAccount[]> {
  const client = getSupabase();
  if (!client || !canReachSupabase()) return [];
  try {
    const userId = await getSupabaseUserId();
    if (!userId) return [];
    const { data, error } = await client.from("bank_accounts").select("*").eq("user_id", userId);
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => bankAccountFromRow(row as BankAccountRow));
  } catch {
    return [];
  }
}

export async function persistBankAccounts(accounts: LinkedBankAccount[]): Promise<boolean> {
  const client = getSupabase();
  if (!client || !canReachSupabase() || accounts.length === 0) return false;
  try {
    const userId = await getSupabaseUserId();
    if (!userId) return false;
    const now = new Date().toISOString();
    const rows = accounts.map((account) => ({
      user_id: userId,
      plaid_account_id: String(account.id || "").trim() || `acct-${Math.random().toString(36).slice(2, 10)}`,
      name: String(account.name || account.officialName || "Linked account"),
      official_name: account.officialName || account.name || null,
      type: String(account.type || "depository"),
      subtype: account.subtype || null,
      mask: account.mask || null,
      institution: account.institution || null,
      balance: money(account.balance),
      available_balance: money(account.balance),
      iso_currency: "USD",
      min_payment: account.minPayment ?? null,
      apr: account.apr ?? null,
      updated_at: now,
    }));
    const { error } = await client.from("bank_accounts").upsert(rows, { onConflict: "user_id,plaid_account_id" });
    return !error;
  } catch {
    return false;
  }
}
