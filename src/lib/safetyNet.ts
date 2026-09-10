const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:5000";

export const TROY_OZ_GRAMS = 31.1034768;
export const SAFETY_NET_STARTER_MONTHS = 3;
export const SAFETY_NET_RECOMMENDED_MONTHS = 6;
export const GOLD_QUOTE_SYMBOLS = ["GC=F", "XAUUSD=X"] as const;
export const GOLD_PRICE_CACHE_KEY = "matterpro_gold_oz_usd";

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

export type SafetyNetConfig = {
  /** 0–100 share of live brokerage stocks/ETFs counted as liquid reserves. */
  portfolioPct: number;
  goldAmount: number;
  goldUnit: GoldUnit;
  bonds: SafetyNetBond[];
};

export type SafetyNetTotals = {
  cash: number;
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

export function emptySafetyNet(): SafetyNetConfig {
  return {
    portfolioPct: 0,
    goldAmount: 0,
    goldUnit: "oz",
    bonds: [],
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

  return {
    portfolioPct: asPct(rec.portfolioPct),
    goldAmount: asMoney(rec.goldAmount),
    goldUnit: rec.goldUnit === "g" ? "g" : "oz",
    bonds,
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
  const cash = Math.max(0, input.cash);
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
    const raw = localStorage.getItem(GOLD_PRICE_CACHE_KEY);
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
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;
  const res = await fetch(`${API_BASE_URL}/api/stocks/quote?symbol=${encodeURIComponent(ticker)}`, {
    signal,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { c?: unknown };
  const price = typeof data?.c === "number" ? data.c : Number(data?.c);
  return Number.isFinite(price) && price > 0 ? price : null;
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
