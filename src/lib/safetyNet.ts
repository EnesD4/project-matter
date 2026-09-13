import { readLocalItem } from "./storage";
import { fetchStockQuote } from "./stockService";

export const TROY_OZ_GRAMS = 31.1034768;
export const SAFETY_NET_STARTER_MONTHS = 3;
export const SAFETY_NET_RECOMMENDED_MONTHS = 6;
export const GOLD_QUOTE_SYMBOLS = ["GC=F", "XAUUSD=X"] as const;
export const GOLD_PRICE_CACHE_KEY = "sprout_gold_oz_usd";
const LEGACY_GOLD_PRICE_CACHE_KEY = "matterpro_gold_oz_usd";

const MAX_BONDS = 50;
const MAX_ID_LEN = 64;
const MAX_LABEL_LEN = 80;
const MAX_SYMBOL_LEN = 16;

export type GoldUnit = "oz" | "g";

export type SafetyNetBond = {
  id: string;
  label: string;
  kind: "amount" | "ticker";
  amount: number;
  symbol: string;
  shares: number;
};

export type SafetyNetReserveKind = "checking" | "hysa" | "money-market" | "cash";

export type SafetyNetReserveLine = {
  id: string;
  label: string;
  kind: SafetyNetReserveKind;
  balance: number;
};

export type SafetyNetConfig = {
  /** 0–100 share of live brokerage stocks/ETFs counted as liquid reserves. */
  portfolioPct: number;
  goldAmount: number;
  goldUnit: GoldUnit;
  bonds: SafetyNetBond[];
  /** FDIC-insured HYSA / T-bill / yield-account cash, separate from checking. */
  hysaCash: number;
  /** Connected checking, HYSA, money market, and cash accounts. */
  reserveLines: SafetyNetReserveLine[];
};

export type SafetyNetTotals = {
  /** Combined checking + HYSA cash (backwards-compatible total). */
  cash: number;
  liquidCash: number;
  hysaCash: number;
  stocks: number;
  gold: number;
  bonds: number;
  total: number;
  goldPricePerOz: number | null;
};

function asMoney(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function asPct(value: unknown): number {
  return Math.min(100, asMoney(value));
}

function asId(value: unknown): string {
  return String(value || "")
    .trim()
    .slice(0, MAX_ID_LEN);
}

function asLabel(value: unknown, fallback = ""): string {
  return (
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, MAX_LABEL_LEN) || fallback
  );
}

function asSymbol(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9=.-]/g, "")
    .slice(0, MAX_SYMBOL_LEN);
}

const RESERVE_KINDS = new Set<SafetyNetReserveKind>(["checking", "hysa", "money-market", "cash"]);

function parseReserveKind(value: unknown): SafetyNetReserveKind {
  return typeof value === "string" && RESERVE_KINDS.has(value as SafetyNetReserveKind)
    ? (value as SafetyNetReserveKind)
    : "cash";
}

export function emptySafetyNet(): SafetyNetConfig {
  return {
    portfolioPct: 0,
    goldAmount: 0,
    goldUnit: "oz",
    bonds: [],
    hysaCash: 0,
    reserveLines: [],
  };
}

export function parseSafetyNet(raw: unknown): SafetyNetConfig {
  let rec: Record<string, unknown> | null = null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    rec = raw as Record<string, unknown>;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        rec = parsed as Record<string, unknown>;
      }
    } catch {
      rec = null;
    }
  }
  if (!rec) return emptySafetyNet();

  const bonds: SafetyNetBond[] = [];
  const list = Array.isArray(rec.bonds) ? rec.bonds : [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = asId(item.id);
    if (!id) continue;
    const kind = item.kind === "ticker" ? "ticker" : "amount";
    bonds.push({
      id,
      label: asLabel(item.label, kind === "ticker" ? asSymbol(item.symbol) || "Bond fund" : "Treasury / bond"),
      kind,
      amount: asMoney(item.amount),
      symbol: asSymbol(item.symbol),
      shares: asMoney(item.shares),
    });
    if (bonds.length >= MAX_BONDS) break;
  }

  const reserveLines: SafetyNetReserveLine[] = [];
  const rawLines = Array.isArray(rec.reserveLines) ? rec.reserveLines : [];
  for (const row of rawLines) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = asId(item.id);
    if (!id) continue;
    reserveLines.push({
      id,
      label: asLabel(item.label, "Cash account"),
      kind: parseReserveKind(item.kind),
      balance: asMoney(item.balance),
    });
    if (reserveLines.length >= MAX_BONDS) break;
  }

  return {
    portfolioPct: asPct(rec.portfolioPct),
    goldAmount: asMoney(rec.goldAmount),
    goldUnit: rec.goldUnit === "g" ? "g" : "oz",
    bonds,
    hysaCash: asMoney(rec.hysaCash),
    reserveLines,
  };
}

export function goldOunces(amount: number, unit: GoldUnit): number {
  const qty = Math.max(0, amount);
  return unit === "g" ? qty / TROY_OZ_GRAMS : qty;
}

export function convertGoldAmount(amount: number, from: GoldUnit, to: GoldUnit): number {
  if (from === to) return amount;
  if (from === "oz" && to === "g") return amount * TROY_OZ_GRAMS;
  return amount / TROY_OZ_GRAMS;
}

export function computeSafetyNetTotals(input: {
  cash: number;
  portfolioValue: number;
  config: SafetyNetConfig;
  goldPricePerOz: number | null;
  bondPrices: Record<string, number>;
}): SafetyNetTotals {
  const liquidCash = Math.max(0, input.cash);
  const hysaCash = Math.max(0, input.config.hysaCash ?? 0);
  const cash = liquidCash + hysaCash;
  const stocks = Math.max(0, input.portfolioValue) * (Math.min(100, Math.max(0, input.config.portfolioPct)) / 100);
  const ounces = goldOunces(input.config.goldAmount, input.config.goldUnit);
  const gold = input.goldPricePerOz && input.goldPricePerOz > 0 ? ounces * input.goldPricePerOz : 0;
  const bonds = input.config.bonds.reduce((sum, bond) => {
    if (bond.kind === "ticker") {
      const price = input.bondPrices[bond.symbol] ?? 0;
      return sum + Math.max(0, bond.shares) * Math.max(0, price);
    }
    return sum + Math.max(0, bond.amount);
  }, 0);

  return {
    cash,
    liquidCash,
    hysaCash,
    stocks,
    gold,
    bonds,
    total: cash + stocks + gold + bonds,
    goldPricePerOz: input.goldPricePerOz,
  };
}

export function monthsOfCoverage(total: number, monthlyExpenses: number): number {
  if (monthlyExpenses <= 0) return 0;
  return total / monthlyExpenses;
}

export function coverageProgressPct(
  monthsCovered: number,
  targetMonths = SAFETY_NET_STARTER_MONTHS
): number {
  if (monthsCovered <= 0 || targetMonths <= 0) return 0;
  return Math.min(100, Math.round((monthsCovered / targetMonths) * 100));
}

export function readCachedGoldPrice(): number | null {
  try {
    const raw = readLocalItem(GOLD_PRICE_CACHE_KEY, LEGACY_GOLD_PRICE_CACHE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeCachedGoldPrice(price: number) {
  try {
    localStorage.setItem(GOLD_PRICE_CACHE_KEY, String(price));
  } catch {
    // ignore quota / private-mode failures
  }
}

export async function fetchQuotePrice(symbol: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const quote = await fetchStockQuote(symbol, signal);
    return quote && quote.c > 0 ? quote.c : null;
  } catch {
    return null;
  }
}

export async function fetchGoldPricePerOz(signal?: AbortSignal): Promise<number | null> {
  for (const symbol of GOLD_QUOTE_SYMBOLS) {
    const price = await fetchQuotePrice(symbol, signal);
    if (price) {
      writeCachedGoldPrice(price);
      return price;
    }
  }
  return readCachedGoldPrice();
}

export function nextBondId() {
  return `bond-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
