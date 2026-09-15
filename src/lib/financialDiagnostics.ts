import { toFiniteNumber } from "./money";
import type { BankTransaction } from "./bankActivity";

/** Recurring / category spend line from Plaid activity or the user cash-flow profile. */
export type DiagnosticExpense = {
  id?: string;
  label: string;
  amount: number;
};

export type SpendFlexibility = "essential" | "flexible" | "discretionary";

export type RankedDiscretionaryCategory = {
  id: string;
  label: string;
  amount: number;
  flexibility: Exclude<SpendFlexibility, "essential">;
  /** Share of total discretionary / flexible spend (0–1). */
  shareOfFlexible: number;
  /** Relative impact score for ranking (higher = more room to cut). */
  impactScore: number;
};

export type FinancialProfileSnapshot = {
  income?: number;
  monthlyIncome?: number;
  monthlyEssentialExpenses?: number;
  expenses?: DiagnosticExpense[];
  creditDebt?: number;
  debt?: number;
  totalDebt?: number;
};

export type FinancialDiagnosticsInput = {
  /** Live Plaid / bank-derived monthly income when available. */
  income?: number;
  /** Category expenses (Plaid summary or edited cash-flow rows). */
  expenses?: DiagnosticExpense[];
  /** Flexible / discretionary category totals when already classified. */
  flexibleSpending?: DiagnosticExpense[];
  /** Credit / revolving debt balance from Plaid credit accounts or profile. */
  creditDebt?: number;
  /** Optional raw Plaid transactions for trend hints. */
  transactions?: BankTransaction[];
  /** User Financial Profile fallbacks when Plaid numbers are thin. */
  profile?: FinancialProfileSnapshot | null;
  /** Prefer bank-linked numbers when both profile and Plaid exist. */
  preferPlaid?: boolean;
};

export type FinancialDiagnostics = {
  income: number;
  recurringExpenses: number;
  essentialSpend: number;
  discretionarySpend: number;
  flexibleSpend: number;
  creditDebt: number;
  netCashFlow: number;
  isSurplus: boolean;
  categories: Array<DiagnosticExpense & { flexibility: SpendFlexibility }>;
  /** Top 3 high-impact discretionary / flexible categories. */
  topDiscretionary: RankedDiscretionaryCategory[];
  /** Best interactive cutback target (largest high-impact discretionary). */
  recommendationTarget: RankedDiscretionaryCategory | null;
  source: "plaid" | "profile" | "mixed" | "empty";
  transactionCount: number;
};

const ESSENTIAL_RE =
  /rent|mortgage|housing|landlord|utilities?|electric|water|gas bill|internet|wifi|phone|insurance|health|medical|pharmacy|grocery|groceries|child\s*care|daycare|tuition|student\s*loan|loan payment|debt payment|minimum|transit pass|commuter/i;

const DISCRETIONARY_RE =
  /dining|restaurant|coffee|cafe|bar|nightlife|entertainment|streaming|netflix|spotify|hulu|disney|subscription|subscriptions|shopping|amazon|retail|clothes|apparel|travel|vacation|hotel|uber eats|doordash|delivery|gaming|hobby|hobbies|personal care|salon|gym|fitness(?!\s*insurance)/i;

const FLEXIBLE_RE =
  /transport|uber|lyft|fuel|gasoline|parking|rideshare|taxi|food|meals?|takeout|misc|other|gifts?/i;

export function classifySpendFlexibility(label: string): SpendFlexibility {
  const text = String(label || "").trim();
  if (!text) return "flexible";
  if (DISCRETIONARY_RE.test(text)) return "discretionary";
  if (ESSENTIAL_RE.test(text)) return "essential";
  if (FLEXIBLE_RE.test(text)) return "flexible";
  // Unknown labels default to flexible so they can surface as cutback candidates.
  return "flexible";
}

function roundMoney(value: number): number {
  return Math.round(toFiniteNumber(value, 0) * 100) / 100;
}

function expenseId(label: string, index: number, id?: string): string {
  if (id && String(id).trim()) return String(id);
  return `diag-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "cat"}-${index}`;
}

function normalizeExpenses(rows: DiagnosticExpense[] | undefined): DiagnosticExpense[] {
  const merged = new Map<string, DiagnosticExpense>();
  for (const row of rows || []) {
    const label = String(row?.label || "").trim() || "Other";
    const amount = roundMoney(row?.amount);
    if (!(amount > 0)) continue;
    const key = label.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.amount = roundMoney(existing.amount + amount);
    } else {
      merged.set(key, { id: row.id, label, amount });
    }
  }
  return [...merged.values()].sort((a, b) => b.amount - a.amount);
}

/**
 * Future value of investing a fixed monthly amount for `years` at a constant annual return,
 * compounded monthly (ordinary annuity). Educational math only — not a forecast.
 */
export function futureValueOfMonthlyInvestment(
  monthlyContribution: number,
  years = 10,
  annualRate = 0.09
): number {
  const pmt = Math.max(0, toFiniteNumber(monthlyContribution, 0));
  const nYears = Math.max(0, toFiniteNumber(years, 0));
  const rate = Math.max(0, toFiniteNumber(annualRate, 0));
  const n = Math.round(nYears * 12);
  if (pmt <= 0 || n <= 0) return 0;
  if (rate === 0) return roundMoney(pmt * n);
  const r = rate / 12;
  return roundMoney(pmt * ((Math.pow(1 + r, n) - 1) / r));
}

/** 10-year wealth band at ~8% and ~10% annual returns for a monthly savings cutback. */
export function tenYearWealthProjection(monthlySavings: number): {
  monthlySavings: number;
  at8: number;
  at9: number;
  at10: number;
  totalContributed: number;
} {
  const monthly = Math.max(0, roundMoney(monthlySavings));
  return {
    monthlySavings: monthly,
    at8: futureValueOfMonthlyInvestment(monthly, 10, 0.08),
    at9: futureValueOfMonthlyInvestment(monthly, 10, 0.09),
    at10: futureValueOfMonthlyInvestment(monthly, 10, 0.1),
    totalContributed: roundMoney(monthly * 120),
  };
}

/**
 * Build live financial diagnostics from Plaid-derived cash flow and/or the user profile.
 * Prefer connected-bank numbers when `preferPlaid` is true (default) and income/expenses exist.
 */
export function buildFinancialDiagnostics(input: FinancialDiagnosticsInput = {}): FinancialDiagnostics {
  const preferPlaid = input.preferPlaid !== false;
  const profileIncome = toFiniteNumber(
    input.profile?.income ?? input.profile?.monthlyIncome,
    0
  );
  const profileEssential = toFiniteNumber(input.profile?.monthlyEssentialExpenses, 0);
  const profileExpenses = normalizeExpenses(input.profile?.expenses);
  const plaidExpenses = normalizeExpenses(input.expenses);
  const flexibleOverride = normalizeExpenses(input.flexibleSpending);

  const plaidIncome = toFiniteNumber(input.income, 0);
  const hasPlaidIncome = plaidIncome > 0;
  const hasPlaidExpenses = plaidExpenses.length > 0;
  const hasProfile = profileIncome > 0 || profileEssential > 0 || profileExpenses.length > 0;

  let income = 0;
  let categories: DiagnosticExpense[] = [];
  let source: FinancialDiagnostics["source"] = "empty";

  if (preferPlaid && (hasPlaidIncome || hasPlaidExpenses)) {
    income = hasPlaidIncome ? plaidIncome : profileIncome;
    categories = hasPlaidExpenses
      ? plaidExpenses
      : profileExpenses.length > 0
        ? profileExpenses
        : profileEssential > 0
          ? [{ label: "Essential expenses", amount: profileEssential }]
          : [];
    source = hasProfile && (!hasPlaidIncome || !hasPlaidExpenses) ? "mixed" : "plaid";
  } else if (hasProfile) {
    income = profileIncome > 0 ? profileIncome : plaidIncome;
    categories =
      profileExpenses.length > 0
        ? profileExpenses
        : profileEssential > 0
          ? [{ label: "Essential expenses", amount: profileEssential }]
          : plaidExpenses;
    source = hasPlaidIncome || hasPlaidExpenses ? "mixed" : "profile";
  } else if (hasPlaidIncome || hasPlaidExpenses) {
    income = plaidIncome;
    categories = plaidExpenses;
    source = "plaid";
  }

  const classified = categories.map((row, index) => ({
    ...row,
    id: expenseId(row.label, index, row.id),
    amount: roundMoney(row.amount),
    flexibility: classifySpendFlexibility(row.label),
  }));

  // Merge explicit flexible spending overrides (e.g. user-tagged discretionary buckets).
  if (flexibleOverride.length > 0) {
    for (const row of flexibleOverride) {
      const key = row.label.toLowerCase();
      const existing = classified.find((item) => item.label.toLowerCase() === key);
      if (existing) {
        existing.amount = roundMoney(Math.max(existing.amount, row.amount));
        existing.flexibility =
          existing.flexibility === "essential" ? "flexible" : existing.flexibility;
      } else {
        classified.push({
          ...row,
          id: expenseId(row.label, classified.length, row.id),
          amount: roundMoney(row.amount),
          flexibility: "discretionary",
        });
      }
    }
  }

  const essentialSpend = roundMoney(
    classified.filter((item) => item.flexibility === "essential").reduce((sum, item) => sum + item.amount, 0)
  );
  const discretionarySpend = roundMoney(
    classified
      .filter((item) => item.flexibility === "discretionary")
      .reduce((sum, item) => sum + item.amount, 0)
  );
  const flexibleSpend = roundMoney(
    classified.filter((item) => item.flexibility === "flexible").reduce((sum, item) => sum + item.amount, 0)
  );
  const recurringExpenses = roundMoney(
    classified.reduce((sum, item) => sum + item.amount, 0) ||
      (source !== "plaid" && profileEssential > 0 ? profileEssential : 0)
  );

  const creditDebt = roundMoney(
    toFiniteNumber(
      input.creditDebt ??
        input.profile?.creditDebt ??
        input.profile?.debt ??
        input.profile?.totalDebt,
      0
    )
  );

  const netCashFlow = roundMoney(income - recurringExpenses);
  const cuttable = classified.filter((item) => item.flexibility !== "essential");
  const cuttableTotal = cuttable.reduce((sum, item) => sum + item.amount, 0) || 1;

  const topDiscretionary: RankedDiscretionaryCategory[] = [...cuttable]
    .map((item) => {
      const shareOfFlexible = item.amount / cuttableTotal;
      // Prefer clear discretionary labels; still surface large flexible categories.
      const typeBoost = item.flexibility === "discretionary" ? 1.15 : 1;
      return {
        id: item.id,
        label: item.label,
        amount: item.amount,
        flexibility: item.flexibility as Exclude<SpendFlexibility, "essential">,
        shareOfFlexible,
        impactScore: roundMoney(item.amount * typeBoost * (1 + shareOfFlexible)),
      };
    })
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 3);

  const transactions = Array.isArray(input.transactions) ? input.transactions : [];

  return {
    income: roundMoney(income),
    recurringExpenses,
    essentialSpend,
    discretionarySpend,
    flexibleSpend,
    creditDebt,
    netCashFlow,
    isSurplus: netCashFlow >= 0,
    categories: classified,
    topDiscretionary,
    recommendationTarget: topDiscretionary[0] ?? null,
    source,
    transactionCount: transactions.length,
  };
}
