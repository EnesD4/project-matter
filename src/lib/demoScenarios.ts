import {
  getStoredUser,
  writePortfolioCache,
  type CashFlowDebt,
  type CashFlowExpense,
  type PortfolioApiItem,
} from "./auth";
import {
  buildMockBankTransactions,
  detectRetirementAssets,
  summarizeBankActivity,
  type BankTransaction,
  type DetectedRetirement,
} from "./bankActivity";
import {
  saveFinancialProfile,
  type Bottleneck,
  type FinancialProfileAnswers,
  type KnowledgeLevel,
} from "./roadmapService";

export const DEMO_SCENARIO_APPLIED_EVENT = "matterpro:demo-scenario-applied";
export const DEMO_SCENARIO_STORAGE_KEY = "sprout_demo_scenario";

export type DemoScenarioId = "starter" | "balanced" | "advanced" | "custom";
export type DemoVehicle = "brokerage" | "ira" | "roth" | "401k";

export type DemoLot = {
  symbol: string;
  name: string;
  shares: number;
  buyPrice: number;
  purchasedAt: string;
  vehicle?: DemoVehicle;
};

export type DemoScenario = {
  id: DemoScenarioId;
  label: string;
  blurb: string;
  cash: number;
  hysa: number;
  investments: number;
  monthlyIncome: number;
  monthlyEssentialExpenses: number;
  bottleneck: Bottleneck;
  knowledgeLevel: KnowledgeLevel;
  debts: CashFlowDebt[];
  lots: DemoLot[];
  transactions?: BankTransaction[];
  retirementBalance?: number;
  retirementType?: DetectedRetirement["accountType"];
};

export type DemoBrokerageMeta = {
  brokerName: string;
  brokerageCash: number;
};

export type DemoScenarioApplyDetail = {
  id: DemoScenarioId;
  cash: number;
  hysa: number;
  monthlyIncome: number;
  debts: CashFlowDebt[];
  expenses: CashFlowExpense[];
  holdings: PortfolioApiItem[];
  lots: DemoLot[];
  transactions: BankTransaction[];
  profile: FinancialProfileAnswers;
  hasActiveDebts: boolean;
  hasActiveInvestments: boolean;
  retirement: DetectedRetirement | null;
  /** Optional brokerage label for custom demo profiles (e.g. Robinhood). */
  brokerName?: string;
  /** Uninvested cash sitting in the linked brokerage. */
  brokerageCash?: number;
};

export const DEMO_TICKER_CATALOG: Record<string, { name: string; buyPrice: number }> = {
  AAPL: { name: "Apple Inc.", buyPrice: 228.4 },
  MSFT: { name: "Microsoft Corp.", buyPrice: 418.2 },
  NVDA: { name: "NVIDIA Corp.", buyPrice: 124.6 },
  GOOGL: { name: "Alphabet Inc.", buyPrice: 174.8 },
  AMZN: { name: "Amazon.com Inc.", buyPrice: 191.3 },
  META: { name: "Meta Platforms", buyPrice: 512.7 },
  TSLA: { name: "Tesla Inc.", buyPrice: 248.9 },
  RCAT: { name: "Red Cat Holdings Inc.", buyPrice: 8.4 },
  SPY: { name: "SPDR S&P 500 ETF", buyPrice: 562.1 },
  QQQ: { name: "Invesco QQQ Trust", buyPrice: 481.5 },
  VOO: { name: "Vanguard S&P 500 ETF", buyPrice: 516.4 },
  VTI: { name: "Vanguard Total Stock Market", buyPrice: 286.2 },
  SCHD: { name: "Schwab US Dividend Equity", buyPrice: 27.8 },
  VXUS: { name: "Vanguard Total International", buyPrice: 64.2 },
};

export const DEMO_SCENARIOS: Record<Exclude<DemoScenarioId, "custom">, DemoScenario> = {
  starter: {
    id: "starter",
    label: "Starter / Debt",
    blurb: "$500 cash · $2,000 card debt",
    cash: 500,
    hysa: 0,
    investments: 0,
    monthlyIncome: 2800,
    monthlyEssentialExpenses: 2650,
    bottleneck: "high-interest-debt",
    knowledgeLevel: "beginner",
    debts: [
      {
        id: "demo-debt-starter-card",
        title: "Chase Freedom Card",
        originalBalance: 2000,
        balance: 2000,
        minPayment: 60,
        apr: 22.4,
      },
    ],
    lots: [],
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    blurb: "$5k cash · $10k HYSA · $3k stocks",
    cash: 5000,
    hysa: 10000,
    investments: 3000,
    monthlyIncome: 5500,
    monthlyEssentialExpenses: 3800,
    bottleneck: "emergency-safety-net",
    knowledgeLevel: "intermediate",
    debts: [],
    lots: [
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        shares: 6,
        buyPrice: 178.25,
        purchasedAt: "2025-03-12",
      },
      {
        symbol: "SPY",
        name: "SPDR S&P 500 ETF",
        shares: 4,
        buyPrice: 482.4,
        purchasedAt: "2024-11-04",
      },
      {
        symbol: "VTI",
        name: "Vanguard Total Stock Market",
        shares: 18,
        buyPrice: 248.5,
        purchasedAt: "2023-08-14",
        vehicle: "roth",
      },
    ],
    retirementBalance: 4473,
    retirementType: "roth",
  },
  advanced: {
    id: "advanced",
    label: "Advanced",
    blurb: "$25k cash · $50k investments",
    cash: 25000,
    hysa: 0,
    investments: 50000,
    monthlyIncome: 12000,
    monthlyEssentialExpenses: 5400,
    bottleneck: "tax-strategy",
    knowledgeLevel: "advanced",
    debts: [],
    lots: [
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        shares: 80,
        buyPrice: 178.25,
        purchasedAt: "2024-06-18",
      },
      {
        symbol: "SPY",
        name: "SPDR S&P 500 ETF",
        shares: 72,
        buyPrice: 498.4,
        purchasedAt: "2023-10-02",
      },
      {
        symbol: "FXAIX",
        name: "Fidelity 500 Index",
        shares: 95,
        buyPrice: 186.4,
        purchasedAt: "2022-04-11",
        vehicle: "401k",
      },
    ],
    retirementBalance: 17708,
    retirementType: "401k",
  },
};

export const DEMO_SCENARIO_LIST: DemoScenario[] = [
  DEMO_SCENARIOS.starter,
  DEMO_SCENARIOS.balanced,
  DEMO_SCENARIOS.advanced,
];

function demoScenarioKey(userId?: string) {
  return `${DEMO_SCENARIO_STORAGE_KEY}_${userId ?? getStoredUser()?.id ?? "anon"}`;
}

const DEMO_BROKERAGE_META_KEY = "sprout_demo_brokerage";

function demoBrokerageKey(userId?: string) {
  return `${DEMO_BROKERAGE_META_KEY}_${userId ?? getStoredUser()?.id ?? "anon"}`;
}

export function readDemoBrokerageMeta(userId?: string): DemoBrokerageMeta | null {
  try {
    const raw = localStorage.getItem(demoBrokerageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoBrokerageMeta>;
    const brokerageCash = Math.max(0, Number(parsed.brokerageCash) || 0);
    const brokerName = String(parsed.brokerName || "").trim();
    if (!brokerName && brokerageCash <= 0) return null;
    return {
      brokerName: brokerName || "Brokerage",
      brokerageCash,
    };
  } catch {
    return null;
  }
}

export function writeDemoBrokerageMeta(meta: DemoBrokerageMeta | null, userId?: string) {
  try {
    const key = demoBrokerageKey(userId);
    if (!meta || (!meta.brokerName && !(meta.brokerageCash > 0))) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(
      key,
      JSON.stringify({
        brokerName: meta.brokerName || "Brokerage",
        brokerageCash: Math.max(0, meta.brokerageCash),
      })
    );
  } catch {
    // private mode
  }
}

function lotToHolding(lot: DemoLot, index: number): PortfolioApiItem {
  const now = new Date().toISOString();
  return {
    id: `demo-${lot.symbol.toLowerCase()}-${index}`,
    userId: getStoredUser()?.id ?? "local",
    symbol: lot.symbol,
    shares: lot.shares,
    buyPrice: lot.buyPrice,
    purchasedAt: lot.purchasedAt,
    accountType: "verified",
    createdAt: now,
  };
}

export function scenarioToProfile(scenario: Pick<
  DemoScenario,
  "monthlyIncome" | "monthlyEssentialExpenses" | "bottleneck" | "knowledgeLevel"
>): FinancialProfileAnswers {
  return {
    stateCode: null,
    monthlyIncome: scenario.monthlyIncome,
    monthlyEssentialExpenses: scenario.monthlyEssentialExpenses,
    bottleneck: scenario.bottleneck,
    knowledgeLevel: scenario.knowledgeLevel,
  };
}

export function inferProfileFromBalances(input: {
  cash: number;
  hysa: number;
  investments: number;
  debt?: number;
  monthlyIncome?: number;
  monthlyEssentialExpenses?: number;
}): FinancialProfileAnswers {
  const debt = Math.max(0, input.debt ?? 0);
  const base =
    debt >= 500 && input.cash + input.hysa < 3000
      ? scenarioToProfile(DEMO_SCENARIOS.starter)
      : input.investments >= 20000 || input.cash >= 20000
        ? scenarioToProfile(DEMO_SCENARIOS.advanced)
        : scenarioToProfile(DEMO_SCENARIOS.balanced);
  const liquidSavings = Math.round(Math.max(0, input.cash) + Math.max(0, input.hysa));
  return {
    ...base,
    monthlyIncome: input.monthlyIncome ?? base.monthlyIncome,
    monthlyEssentialExpenses: input.monthlyEssentialExpenses ?? base.monthlyEssentialExpenses,
    // Derived from linked checking / HYSA balances — not a manual intake answer.
    liquidSavings,
  };
}

function brokerageLots(lots: DemoLot[]): DemoLot[] {
  return lots.filter((lot) => !lot.vehicle || lot.vehicle === "brokerage");
}

function retirementFromScenario(scenario: DemoScenario, lots: DemoLot[]): DetectedRetirement | null {
  const fromLots = detectRetirementAssets(
    [],
    lots.map((lot) => ({ vehicle: lot.vehicle, shares: lot.shares, buyPrice: lot.buyPrice }))
  );
  if (scenario.retirementBalance && scenario.retirementBalance > 0) {
    return {
      present: true,
      savings: scenario.retirementBalance,
      accountType: scenario.retirementType ?? fromLots.accountType,
      label:
        scenario.retirementType === "401k"
          ? "401(k)"
          : scenario.retirementType === "roth"
            ? "Roth IRA"
            : fromLots.label,
    };
  }
  return fromLots.present ? fromLots : null;
}

function detailFromParts(input: {
  id: DemoScenarioId;
  cash: number;
  hysa: number;
  monthlyIncome: number;
  monthlyEssentialExpenses: number;
  debts: CashFlowDebt[];
  lots: DemoLot[];
  transactions?: BankTransaction[];
  /** When set, skip mock-derived categories and use these cash-flow rows. */
  expenses?: CashFlowExpense[];
  profile: FinancialProfileAnswers;
  retirement: DetectedRetirement | null;
  brokerName?: string;
  brokerageCash?: number;
}): DemoScenarioApplyDetail {
  const debtMinimums = input.debts.reduce((sum, debt) => sum + debt.minPayment, 0);
  const explicitExpenses = (input.expenses || []).filter((row) => row.amount > 0);
  const transactions =
    input.transactions ??
    (explicitExpenses.length > 0
      ? []
      : buildMockBankTransactions({
          prefix: input.id,
          monthlyIncome: input.monthlyIncome,
          monthlySpending: Math.max(0, input.monthlyEssentialExpenses - debtMinimums),
        }));
  const activity = summarizeBankActivity(transactions);
  const brokerage = brokerageLots(input.lots);
  const expenses =
    explicitExpenses.length > 0
      ? explicitExpenses
      : activity.expenses.length > 0
        ? activity.expenses
        : [
            {
              id: `demo-exp-${input.id}-essentials`,
              label: "Essential bills",
              amount: Math.max(0, input.monthlyEssentialExpenses - debtMinimums),
            },
          ];
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  return {
    id: input.id,
    cash: input.cash,
    hysa: input.hysa,
    monthlyIncome: explicitExpenses.length > 0 ? input.monthlyIncome : activity.monthlyIncome || input.monthlyIncome,
    debts: input.debts,
    expenses,
    holdings: brokerage.map(lotToHolding),
    lots: input.lots,
    transactions,
    profile: {
      ...input.profile,
      monthlyIncome:
        explicitExpenses.length > 0 ? input.monthlyIncome : activity.monthlyIncome || input.monthlyIncome,
      monthlyEssentialExpenses: expenseTotal + debtMinimums || input.monthlyEssentialExpenses,
    },
    hasActiveDebts: input.debts.length > 0,
    hasActiveInvestments: brokerage.length > 0 || (input.brokerageCash ?? 0) > 0,
    retirement: input.retirement,
    brokerName: input.brokerName,
    brokerageCash: Math.max(0, input.brokerageCash ?? 0),
  };
}

export function buildDemoApplyDetail(id: Exclude<DemoScenarioId, "custom">): DemoScenarioApplyDetail {
  const scenario = DEMO_SCENARIOS[id];
  return detailFromParts({
    id,
    cash: scenario.cash,
    hysa: scenario.hysa,
    monthlyIncome: scenario.monthlyIncome,
    monthlyEssentialExpenses: scenario.monthlyEssentialExpenses,
    debts: scenario.debts,
    lots: scenario.lots,
    transactions: scenario.transactions,
    profile: scenarioToProfile(scenario),
    retirement: retirementFromScenario(scenario, scenario.lots),
  });
}

export function resolveDemoTicker(symbol: string): { symbol: string; name: string; buyPrice: number } {
  const ticker = symbol.trim().toUpperCase();
  const known = DEMO_TICKER_CATALOG[ticker];
  return {
    symbol: ticker,
    name: known?.name ?? ticker,
    // Catalog price only — do not invent a static $100 when the ticker is unknown.
    buyPrice: known?.buyPrice ?? 0,
  };
}

export type CustomDemoInput = {
  cash: number;
  creditDebt: number;
  monthlySpending: number;
  monthlyIncome?: number;
  /** Essential / fixed monthly bills when building an interactive custom profile. */
  fixedExpenses?: number;
  /** Discretionary monthly spend when building an interactive custom profile. */
  discretionaryExpenses?: number;
  /** Display name for the custom brokerage (e.g. Robinhood). */
  brokerName?: string;
  /** Uninvested cash in the brokerage account. */
  brokerageCash?: number;
  stocks: Array<{ symbol: string; shares?: number; amount?: number }>;
  retirementBalance?: number;
  retirementType?: DetectedRetirement["accountType"];
};

export function buildCustomDemoDetail(input: CustomDemoInput): DemoScenarioApplyDetail {
  const brokerageCash = Math.max(0, input.brokerageCash ?? 0);
  const cash = Math.max(0, input.cash);
  const creditDebt = Math.max(0, input.creditDebt);
  const fixedExpenses = Math.max(0, input.fixedExpenses ?? 0);
  const discretionaryExpenses = Math.max(0, input.discretionaryExpenses ?? 0);
  const hasSplitExpenses = fixedExpenses > 0 || discretionaryExpenses > 0;
  const monthlySpending = Math.max(
    0,
    hasSplitExpenses ? fixedExpenses + discretionaryExpenses : input.monthlySpending
  );
  const monthlyIncome = Math.max(0, input.monthlyIncome ?? Math.round(monthlySpending * 1.35 + 400));
  const brokerName = String(input.brokerName || "").trim() || (brokerageCash > 0 || input.stocks.length > 0 ? "Robinhood" : undefined);
  const lots: DemoLot[] = [];
  for (const row of input.stocks) {
    const meta = resolveDemoTicker(row.symbol);
    if (!meta.symbol) continue;
    const amount = Math.max(0, Number(row.amount) || 0);
    let shares = Math.max(0, Number(row.shares) || 0);
    let buyPrice = meta.buyPrice;
    if (shares <= 0 && amount > 0) {
      if (buyPrice > 0) {
        shares = Math.round((amount / buyPrice) * 10000) / 10000;
      } else {
        shares = 1;
        buyPrice = amount;
      }
    }
    if (shares <= 0) continue;
    // Unknown tickers with share counts get a placeholder cost basis so they still appear.
    if (!(buyPrice > 0)) buyPrice = amount > 0 ? amount / shares : 25;
    lots.push({
      symbol: meta.symbol,
      name: meta.name,
      shares,
      buyPrice,
      purchasedAt: new Date().toISOString().slice(0, 10),
      vehicle: "brokerage",
    });
  }

  const debts: CashFlowDebt[] =
    creditDebt > 0
      ? [
          {
            id: "demo-debt-custom-card",
            title: "High-interest debt",
            originalBalance: creditDebt,
            balance: creditDebt,
            minPayment: Math.max(25, Math.round(creditDebt * 0.03)),
            apr: 21.9,
          },
        ]
      : [];

  const debtMinimums = debts.reduce((sum, debt) => sum + debt.minPayment, 0);
  const investments = lots.reduce((sum, lot) => sum + lot.shares * lot.buyPrice, 0);
  const profile = inferProfileFromBalances({
    cash: cash + brokerageCash,
    hysa: 0,
    investments,
    debt: creditDebt,
    monthlyIncome,
    monthlyEssentialExpenses: monthlySpending + debtMinimums,
  });

  const explicitExpenses: CashFlowExpense[] = hasSplitExpenses
    ? [
        ...(fixedExpenses > 0
          ? [{ id: "demo-exp-custom-fixed", label: "Fixed expenses", amount: fixedExpenses }]
          : []),
        ...(discretionaryExpenses > 0
          ? [
              {
                id: "demo-exp-custom-discretionary",
                label: "Discretionary spending",
                amount: discretionaryExpenses,
              },
            ]
          : []),
      ]
    : [];

  return detailFromParts({
    id: "custom",
    cash,
    hysa: 0,
    monthlyIncome,
    monthlyEssentialExpenses: profile.monthlyEssentialExpenses,
    debts,
    lots,
    expenses: explicitExpenses,
    profile,
    brokerName,
    brokerageCash,
    retirement:
      input.retirementBalance && input.retirementBalance > 0
        ? {
            present: true,
            savings: input.retirementBalance,
            accountType: input.retirementType ?? "401k",
            label: input.retirementType === "roth" ? "Roth IRA" : "401(k)",
          }
        : null,
  });
}

export function readActiveDemoScenario(userId?: string): DemoScenarioId | null {
  try {
    const raw = localStorage.getItem(demoScenarioKey(userId));
    if (raw === "starter" || raw === "balanced" || raw === "advanced" || raw === "custom") return raw;
    return null;
  } catch {
    return null;
  }
}

export function clearActiveDemoScenario(userId?: string) {
  try {
    localStorage.removeItem(demoScenarioKey(userId));
  } catch {
    // private mode
  }
  writeDemoBrokerageMeta(null, userId);
}

function persistAndDispatch(detail: DemoScenarioApplyDetail, userId?: string): DemoScenarioApplyDetail {
  const uid = userId ?? getStoredUser()?.id;
  saveFinancialProfile(detail.profile, uid);
  writePortfolioCache(detail.holdings, uid);
  try {
    localStorage.setItem(demoScenarioKey(userId), detail.id);
  } catch {
    // private mode
  }
  if (detail.brokerName || (detail.brokerageCash ?? 0) > 0) {
    writeDemoBrokerageMeta(
      {
        brokerName: detail.brokerName || "Brokerage",
        brokerageCash: Math.max(0, detail.brokerageCash ?? 0),
      },
      uid
    );
  } else {
    writeDemoBrokerageMeta(null, uid);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<DemoScenarioApplyDetail>(DEMO_SCENARIO_APPLIED_EVENT, { detail }));
  }
  return detail;
}

export function applyDemoScenario(id: DemoScenarioId, userId?: string): DemoScenarioApplyDetail {
  if (id === "custom") {
    const existing = readActiveDemoScenario(userId);
    if (existing && existing !== "custom") return applyDemoScenario(existing, userId);
    return persistAndDispatch(buildCustomDemoDetail({ cash: 0, creditDebt: 0, monthlySpending: 0, stocks: [] }), userId);
  }
  return persistAndDispatch(buildDemoApplyDetail(id), userId);
}

export function applyCustomDemo(input: CustomDemoInput, userId?: string): DemoScenarioApplyDetail {
  return persistAndDispatch(buildCustomDemoDetail(input), userId);
}
