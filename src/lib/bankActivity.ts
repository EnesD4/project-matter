import type { CashFlowExpense } from "./auth";

export type BankTransaction = {
  id: string;
  date: string;
  name: string;
  amount: number;
  category: string;
};

export type RetirementAccountKind = "roth" | "traditional" | "401k" | "hsa";

export type DetectedRetirement = {
  present: boolean;
  savings: number;
  accountType: RetirementAccountKind;
  label: string;
};

export type RetirementAccountLike = {
  name?: string;
  officialName?: string;
  subtype?: string;
  type?: string;
  balance?: number;
};

export type RetirementLotLike = {
  vehicle?: string;
  shares?: number;
  buyPrice?: number;
};

const RETIREMENT_RE = /401\s*\(?k\)?|\broth\b|\bira\b|\bhsa\b/i;

export function isRetirementText(value?: string | null): boolean {
  return Boolean(value && RETIREMENT_RE.test(value));
}

export function retirementKindFromText(value?: string | null): RetirementAccountKind | null {
  if (!value) return null;
  const text = value.toLowerCase();
  if (/401\s*\(?k\)?/.test(text)) return "401k";
  if (/roth/.test(text)) return "roth";
  if (/\bhsa\b/.test(text)) return "hsa";
  if (/\bira\b/.test(text)) return "traditional";
  return null;
}

export function detectRetirementAssets(
  accounts: RetirementAccountLike[] = [],
  lots: RetirementLotLike[] = []
): DetectedRetirement {
  const matches = accounts.filter((account) => {
    const blob = `${account.subtype ?? ""} ${account.name ?? ""} ${account.officialName ?? ""}`;
    return isRetirementText(blob);
  });
  const lotValue = lots
    .filter((lot) => lot.vehicle && lot.vehicle !== "brokerage")
    .reduce((sum, lot) => sum + Math.max(0, lot.shares ?? 0) * Math.max(0, lot.buyPrice ?? 0), 0);
  const accountValue = matches.reduce((sum, account) => sum + Math.max(0, account.balance ?? 0), 0);
  const savings = Math.round(Math.max(accountValue, lotValue));
  const blob = matches.map((account) => `${account.subtype ?? ""} ${account.name ?? ""}`).join(" ");
  const accountType = retirementKindFromText(blob) ?? (lotValue > 0 ? "401k" : "roth");
  const label =
    accountType === "401k"
      ? "401(k)"
      : accountType === "roth"
        ? "Roth IRA"
        : accountType === "hsa"
          ? "HSA"
          : "Traditional IRA";
  return {
    present: savings > 0 || matches.length > 0,
    savings,
    accountType,
    label,
  };
}

export function summarizeBankActivity(transactions: BankTransaction[] | null | undefined): {
  monthlyIncome: number;
  expenses: CashFlowExpense[];
} {
  let monthlyIncome = 0;
  const byCategory = new Map<string, number>();

  for (const txn of transactions || []) {
    if (!(Math.abs(txn.amount) > 0)) continue;
    if (txn.amount > 0) {
      monthlyIncome += txn.amount;
      continue;
    }
    const label = txn.category.trim() || "Other";
    byCategory.set(label, (byCategory.get(label) ?? 0) + Math.abs(txn.amount));
  }

  const expenses = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount], index) => ({
      id: `bank-exp-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`,
      label,
      amount: Math.round(amount * 100) / 100,
    }));

  return {
    monthlyIncome: Math.round(monthlyIncome * 100) / 100,
    expenses,
  };
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function buildMockBankTransactions(input: {
  prefix: string;
  monthlyIncome: number;
  monthlySpending: number;
}): BankTransaction[] {
  const income = Math.max(0, input.monthlyIncome);
  const spend = Math.max(0, input.monthlySpending);
  const paycheck = Math.round((income / 2) * 100) / 100;
  const weights = [
    { category: "Rent", name: "Cortland Apartments", share: 0.42 },
    { category: "Groceries", name: "Whole Foods", share: 0.16 },
    { category: "Utilities", name: "City Power & Water", share: 0.07 },
    { category: "Dining", name: "Toast · Dining out", share: 0.1 },
    { category: "Transport", name: "Chevron / Metro", share: 0.08 },
    { category: "Phone", name: "T-Mobile", share: 0.04 },
    { category: "Insurance", name: "Geico", share: 0.06 },
    { category: "Subscriptions", name: "Netflix + Spotify", share: 0.03 },
    { category: "Shopping", name: "Amazon", share: 0.04 },
  ];

  const transactions: BankTransaction[] = [
    {
      id: `${input.prefix}-pay-1`,
      date: isoDaysAgo(18),
      name: "Acme Corp Payroll",
      amount: paycheck,
      category: "Income",
    },
    {
      id: `${input.prefix}-pay-2`,
      date: isoDaysAgo(4),
      name: "Acme Corp Payroll",
      amount: Math.round((income - paycheck) * 100) / 100,
      category: "Income",
    },
  ];

  let allocated = 0;
  weights.forEach((row, index) => {
    const isLast = index === weights.length - 1;
    const amount = isLast
      ? Math.max(0, Math.round((spend - allocated) * 100) / 100)
      : Math.round(spend * row.share * 100) / 100;
    allocated += amount;
    if (amount <= 0) return;
    transactions.push({
      id: `${input.prefix}-exp-${index}`,
      date: isoDaysAgo(2 + index * 2),
      name: row.name,
      amount: -amount,
      category: row.category,
    });
  });

  return transactions;
}
