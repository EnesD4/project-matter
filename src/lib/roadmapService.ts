import { getStoredUser } from "./auth";
import { awardLessonXp } from "./lessonProgress";
import { PHASE_ORDER, type PhaseId } from "./lessons";
import { formatNumber, toFiniteNumber } from "./money";
import { readLocalItem } from "./storage";

export const FINANCIAL_PROFILE_UPDATED_EVENT = "matterpro:financial-profile-updated";
export const OPEN_FINANCIAL_ONBOARDING_EVENT = "matterpro:open-financial-onboarding";
export const OPEN_FINANCIAL_ROADMAP_EVENT = "matterpro:open-financial-roadmap";
export const ROADMAP_TODO_UPDATED_EVENT = "matterpro:roadmap-todo-updated";
export const ROADMAP_TASK_XP = 20;

/** Stable quest ids for the interactive AI roadmap. */
export const ROADMAP_QUEST_IDS = {
  cashFlowDebt: "quest-cashflow-debt",
  microSavings: "quest-micro-savings",
  compoundGrowth: "quest-compound-growth",
} as const;

export type CostOfLiving = "high" | "moderate" | "low";
export type IncomeRange = "under-3k" | "3k-5k" | "5k-8k" | "8k-plus";
export type MarginRange = "zero" | "micro" | "solid" | "high";
export type Bottleneck =
  | "high-interest-debt"
  | "emergency-safety-net"
  | "tax-strategy"
  | "stock-portfolio";
export type FinancialGoal = Bottleneck;
/** User-facing primary goal collected during post-bank onboarding intake. */
export type PrimaryFinancialGoal =
  | "home-down-payment"
  | "buy-a-car"
  | "financial-independence"
  | "wealth-growth";
export type FinancialArchetype = "survival" | "micro-match" | "wealth";
export type ExpenseLoad = "tight" | "balanced" | "comfortable";
export type KnowledgeLevel = "beginner" | "intermediate" | "advanced";

export const KNOWLEDGE_OPTIONS: Array<{
  id: KnowledgeLevel;
  label: string;
  hint: string;
}> = [
  {
    id: "beginner",
    label: "Beginner",
    hint: "Phases 2–5 stay locked until you finish the previous phase.",
  },
  {
    id: "intermediate",
    label: "Intermediate",
    hint: "All 5 curriculum phases unlock immediately for browsing.",
  },
  {
    id: "advanced",
    label: "Advanced",
    hint: "All 5 curriculum phases unlock immediately for browsing.",
  },
];

export function unlocksAllCurriculum(level: KnowledgeLevel): boolean {
  return level === "intermediate" || level === "advanced";
}

/** Typical HYSA yield shown on Safety Net liquidity cards. */
export const HYSA_APY = 0.045;
/** Rule-of-thumb employee deferral to capture a common 401(k) match. */
export const K401_MATCH_RATE = 0.06;
/** 2026 Roth IRA employee contribution room used for monthly targeting. */
export const ROTH_IRA_ANNUAL_LIMIT = 7000;

export type RetirementTargets = {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyMargin: number;
  k401Monthly: number;
  rothMonthly: number;
  totalMonthly: number;
  k401Annual: number;
  rothAnnual: number;
  note: string;
};

export function computeRetirementTargets(income: number, expenses: number): RetirementTargets {
  const monthlyIncome = Math.max(0, Number.isFinite(income) ? income : 0);
  const monthlyExpenses = Math.max(0, Number.isFinite(expenses) ? expenses : 0);
  const monthlyMargin = discretionaryMargin(monthlyIncome, monthlyExpenses);
  const surplus = Math.max(0, monthlyMargin);
  const matchCap = monthlyIncome * K401_MATCH_RATE;
  const rothCap = ROTH_IRA_ANNUAL_LIMIT / 12;

  const k401Monthly = Math.round(Math.min(surplus, matchCap));
  const rothMonthly = Math.round(Math.min(Math.max(0, surplus - k401Monthly), rothCap));
  const totalMonthly = k401Monthly + rothMonthly;

  let note: string;
  if (surplus <= 0) {
    note = "Stabilize cash flow first — 401(k) and Roth targets appear once leftover margin is real.";
  } else if (rothMonthly <= 0) {
    note = `Your ${usd(surplus)} surplus funds the 401(k) match first (about 6% of take-home).`;
  } else {
    note = `Match first (${usd(k401Monthly)}/mo), then Roth IRA up to annual contribution room.`;
  }

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlyMargin,
    k401Monthly,
    rothMonthly,
    totalMonthly,
    k401Annual: k401Monthly * 12,
    rothAnnual: rothMonthly * 12,
    note,
  };
}

export function hysaAnnualYield(cash: number, apy = HYSA_APY): number {
  return Math.max(0, cash) * apy;
}

export type UsState = {
  code: string;
  name: string;
  col: CostOfLiving;
};

export const US_STATES: UsState[] = [
  { code: "AL", name: "Alabama", col: "low" },
  { code: "AK", name: "Alaska", col: "high" },
  { code: "AZ", name: "Arizona", col: "moderate" },
  { code: "AR", name: "Arkansas", col: "low" },
  { code: "CA", name: "California", col: "high" },
  { code: "CO", name: "Colorado", col: "high" },
  { code: "CT", name: "Connecticut", col: "high" },
  { code: "DE", name: "Delaware", col: "moderate" },
  { code: "DC", name: "District of Columbia", col: "high" },
  { code: "FL", name: "Florida", col: "moderate" },
  { code: "GA", name: "Georgia", col: "moderate" },
  { code: "HI", name: "Hawaii", col: "high" },
  { code: "ID", name: "Idaho", col: "low" },
  { code: "IL", name: "Illinois", col: "moderate" },
  { code: "IN", name: "Indiana", col: "low" },
  { code: "IA", name: "Iowa", col: "low" },
  { code: "KS", name: "Kansas", col: "low" },
  { code: "KY", name: "Kentucky", col: "low" },
  { code: "LA", name: "Louisiana", col: "low" },
  { code: "ME", name: "Maine", col: "low" },
  { code: "MD", name: "Maryland", col: "high" },
  { code: "MA", name: "Massachusetts", col: "high" },
  { code: "MI", name: "Michigan", col: "low" },
  { code: "MN", name: "Minnesota", col: "moderate" },
  { code: "MS", name: "Mississippi", col: "low" },
  { code: "MO", name: "Missouri", col: "low" },
  { code: "MT", name: "Montana", col: "low" },
  { code: "NE", name: "Nebraska", col: "low" },
  { code: "NV", name: "Nevada", col: "moderate" },
  { code: "NH", name: "New Hampshire", col: "moderate" },
  { code: "NJ", name: "New Jersey", col: "high" },
  { code: "NM", name: "New Mexico", col: "low" },
  { code: "NY", name: "New York", col: "high" },
  { code: "NC", name: "North Carolina", col: "low" },
  { code: "ND", name: "North Dakota", col: "low" },
  { code: "OH", name: "Ohio", col: "low" },
  { code: "OK", name: "Oklahoma", col: "low" },
  { code: "OR", name: "Oregon", col: "moderate" },
  { code: "PA", name: "Pennsylvania", col: "moderate" },
  { code: "RI", name: "Rhode Island", col: "moderate" },
  { code: "SC", name: "South Carolina", col: "low" },
  { code: "SD", name: "South Dakota", col: "low" },
  { code: "TN", name: "Tennessee", col: "low" },
  { code: "TX", name: "Texas", col: "low" },
  { code: "UT", name: "Utah", col: "low" },
  { code: "VT", name: "Vermont", col: "moderate" },
  { code: "VA", name: "Virginia", col: "moderate" },
  { code: "WA", name: "Washington", col: "high" },
  { code: "WV", name: "West Virginia", col: "low" },
  { code: "WI", name: "Wisconsin", col: "low" },
  { code: "WY", name: "Wyoming", col: "low" },
];

export const INCOME_OPTIONS: Array<{
  id: IncomeRange;
  label: string;
  hint: string;
}> = [
  { id: "under-3k", label: "< $3,000", hint: "Tight take-home pay" },
  { id: "3k-5k", label: "$3,000 – $5,000", hint: "Building room to breathe" },
  { id: "5k-8k", label: "$5,000 – $8,000", hint: "Solid after-tax base" },
  { id: "8k-plus", label: "$8,000+", hint: "High after-tax income" },
];

export const MARGIN_OPTIONS: Array<{
  id: MarginRange;
  label: string;
  title: string;
  hint: string;
}> = [
  { id: "zero", label: "$0 – $100", title: "Zero Margin", hint: "Essentials consume the paycheck" },
  { id: "micro", label: "$100 – $400", title: "Micro Margin", hint: "A thin but usable surplus" },
  { id: "solid", label: "$400 – $1,200", title: "Solid Margin", hint: "Room to save and invest" },
  { id: "high", label: "$1,200+", title: "High Margin", hint: "Offense mode is available" },
];

export const GOAL_OPTIONS: Array<{
  id: Bottleneck;
  label: string;
  hint: string;
}> = [
  { id: "high-interest-debt", label: "Debt Payoff", hint: "Cards or loans above ~7% APR" },
  { id: "emergency-safety-net", label: "Emergency Fund", hint: "Build a cash buffer if income stops" },
  { id: "tax-strategy", label: "Tax Optimization", hint: "401(k), Roth, and HSA still unused" },
  { id: "stock-portfolio", label: "Investing", hint: "Grow paper or live market assets" },
];

export const BOTTLENECK_OPTIONS = GOAL_OPTIONS;

export const PRIMARY_GOAL_OPTIONS: Array<{
  id: PrimaryFinancialGoal;
  label: string;
  hint: string;
}> = [
  { id: "home-down-payment", label: "Home Down Payment", hint: "Save toward a house deposit" },
  { id: "buy-a-car", label: "Buy a Car", hint: "Fund a vehicle without high-interest debt" },
  { id: "financial-independence", label: "Financial Independence", hint: "Build freedom from a paycheck" },
  { id: "wealth-growth", label: "Wealth Growth", hint: "Grow long-term invested capital" },
];

export function primaryGoalLabel(goal: PrimaryFinancialGoal | null | undefined): string | null {
  if (!goal) return null;
  return PRIMARY_GOAL_OPTIONS.find((option) => option.id === goal)?.label ?? null;
}

/** Map intake goals onto the existing bottleneck curriculum pins. */
export function bottleneckFromPrimaryGoal(
  goal: PrimaryFinancialGoal | null | undefined,
  liquidSavings: number | null | undefined
): Bottleneck {
  const savings = liquidSavings == null ? null : Math.max(0, liquidSavings);
  if (savings != null && savings < 1000) return "emergency-safety-net";
  if (goal === "home-down-payment" || goal === "buy-a-car") return "emergency-safety-net";
  if (goal === "financial-independence") return "tax-strategy";
  if (goal === "wealth-growth") return "stock-portfolio";
  return "emergency-safety-net";
}

export type RoadmapTask = {
  id: string;
  title: string;
  detail: string;
  xp: number;
};

export type FinancialProfileAnswers = {
  stateCode: string | null;
  monthlyIncome: number;
  monthlyEssentialExpenses: number;
  bottleneck: Bottleneck;
  knowledgeLevel: KnowledgeLevel;
  /** Optional liquid / emergency-fund balance from post-bank goal intake. */
  liquidSavings?: number | null;
  /** Optional primary life goal from post-bank goal intake. */
  primaryGoal?: PrimaryFinancialGoal | null;
};

export type FinancialProfile = FinancialProfileAnswers & {
  version: 2;
  userId: string;
  monthlyMargin: number;
  incomeRange: IncomeRange;
  marginRange: MarginRange;
  costOfLiving: CostOfLiving | null;
  archetype: FinancialArchetype;
  expenseLoad: ExpenseLoad;
  liquidSavings: number | null;
  primaryGoal: PrimaryFinancialGoal | null;
  completedAt: string;
  updatedAt: string;
};

export type FinancialRoadmap = {
  profile: FinancialProfile;
  archetype: FinancialArchetype;
  title: string;
  modeLabel: string;
  accent: string;
  accentSoft: string;
  summary: string;
  strategy: string;
  steps: string[];
  todos: RoadmapTask[];
  recommendedPhaseId: PhaseId;
  phaseOrder: PhaseId[];
  lockedPhaseIds: PhaseId[];
  lockReason: string | null;
  unlockAllPhases: boolean;
  knowledgeLevel: KnowledgeLevel;
};

export type RoadmapTodoProgress = {
  completedIds: string[];
  awardedIds: string[];
};

type OpenOnboardingDetail = {
  cancelable?: boolean;
};

function storageKey(userId?: string) {
  return `sprout_user_profile_${userId ?? getStoredUser()?.id ?? "anon"}`;
}

function legacyStorageKey(userId?: string) {
  return `matterpro_financial_profile_${userId ?? getStoredUser()?.id ?? "anon"}`;
}

function todoStorageKey(userId?: string) {
  return `sprout_roadmap_state_${userId ?? getStoredUser()?.id ?? "anon"}`;
}

function legacyTodoStorageKey(userId?: string) {
  return `matterpro_roadmap_todo_${userId ?? getStoredUser()?.id ?? "anon"}`;
}

function usd(amount: unknown): string {
  const rounded = Math.round(toFiniteNumber(amount, 0));
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${formatNumber(Math.abs(rounded))}`;
}

export function costOfLivingForState(code: string | null | undefined): CostOfLiving | null {
  if (!code) return null;
  return US_STATES.find((state) => state.code === code)?.col ?? null;
}

export function stateByCode(code: string | null | undefined): UsState | null {
  if (!code) return null;
  return US_STATES.find((state) => state.code === code) ?? null;
}

export function incomeRangeFromAmount(income: number): IncomeRange {
  if (income < 3000) return "under-3k";
  if (income < 5000) return "3k-5k";
  if (income < 8000) return "5k-8k";
  return "8k-plus";
}

export function marginRangeFromAmount(margin: number): MarginRange {
  if (margin <= 100) return "zero";
  if (margin <= 400) return "micro";
  if (margin <= 1200) return "solid";
  return "high";
}

export function midpointIncome(range: IncomeRange): number {
  if (range === "under-3k") return 2000;
  if (range === "3k-5k") return 4000;
  if (range === "5k-8k") return 6500;
  return 10000;
}

export function midpointMargin(range: MarginRange): number {
  if (range === "zero") return 50;
  if (range === "micro") return 250;
  if (range === "solid") return 800;
  return 1600;
}

export function discretionaryMargin(income: number, expenses: number): number {
  return Math.max(0, income) - Math.max(0, expenses);
}

export function archetypeFromMargin(margin: MarginRange): FinancialArchetype {
  if (margin === "zero") return "survival";
  if (margin === "micro") return "micro-match";
  return "wealth";
}

export function expenseLoadFrom(income: IncomeRange, margin: MarginRange): ExpenseLoad {
  if (margin === "zero") return "tight";
  if (margin === "high") return "comfortable";
  if (income === "under-3k" && margin === "micro") return "tight";
  if (income === "8k-plus" && margin === "solid") return "comfortable";
  return "balanced";
}

export function expenseLoadFromNumbers(income: number, expenses: number): ExpenseLoad {
  if (income <= 0) return "tight";
  const ratio = expenses / income;
  if (ratio >= 0.9) return "tight";
  if (ratio <= 0.6) return "comfortable";
  return "balanced";
}

function pinPhase(order: PhaseId[], id: PhaseId): PhaseId[] {
  return [id, ...order.filter((phaseId) => phaseId !== id)];
}

function uniquePhases(order: PhaseId[]): PhaseId[] {
  const seen = new Set<PhaseId>();
  const next: PhaseId[] = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  for (const id of PHASE_ORDER) {
    if (!seen.has(id)) next.push(id);
  }
  return next;
}

function locationNote(state: UsState | null): string {
  if (!state) return "";
  return ` Based in ${state.name}.`;
}

function incomeNote(income: number, margin: number): string {
  if (income > 0 && income < 3000) {
    return ` Take-home of ${usd(income)} means income growth is a first-class goal, not a side quest.`;
  }
  if (income >= 8000 && margin <= 100) {
    return " High income with almost no leftover cash usually means essentials (or lifestyle) are oversized — audit before you invest.";
  }
  if (income >= 8000) {
    return ` With ${usd(income)} after tax, unused tax-advantaged space is the expensive mistake to avoid.`;
  }
  return "";
}

function bottleneckNote(bottleneck: Bottleneck): string {
  if (bottleneck === "high-interest-debt") {
    return " Your current focus is debt payoff — Avalanche extra dollars at the highest APR first.";
  }
  if (bottleneck === "emergency-safety-net") {
    return " Your current focus is the emergency fund — cash that can survive a job hitch beats a perfect portfolio.";
  }
  if (bottleneck === "tax-strategy") {
    return " Your current focus is tax optimization — capture match, Roth, and HSA before taxable brokerage.";
  }
  return " Your current focus is investing — learn the assets, then paper-trade the habit.";
}

function primaryGoalNote(
  primaryGoal: PrimaryFinancialGoal | null | undefined,
  liquidSavings: number | null | undefined
): string {
  const label = primaryGoalLabel(primaryGoal);
  const savings =
    liquidSavings == null || !Number.isFinite(liquidSavings)
      ? null
      : Math.max(0, Math.round(liquidSavings));
  const savingsBit =
    savings == null
      ? ""
      : savings <= 0
        ? " Liquid savings were marked as $0 — treat cash runway as step one."
        : ` You reported about ${usd(savings)} in liquid / emergency savings.`;
  if (!label) return savingsBit;
  return ` Primary goal: ${label}.${savingsBit}`;
}

function applyBottleneck(order: PhaseId[], bottleneck: Bottleneck, archetype: FinancialArchetype): PhaseId[] {
  if (bottleneck === "high-interest-debt" || bottleneck === "emergency-safety-net") {
    return pinPhase(order, "phase-1");
  }
  if (bottleneck === "tax-strategy") {
    return pinPhase(order, "phase-2");
  }
  if (bottleneck === "stock-portfolio" && archetype !== "survival") {
    return pinPhase(order, "phase-3");
  }
  return order;
}

function task(id: string, title: string, detail: string): RoadmapTask {
  return { id, title, detail, xp: ROADMAP_TASK_XP };
}

export function buildRoadmapTodos(
  archetype: FinancialArchetype,
  bottleneck: Bottleneck,
  monthlyMargin: number,
  options?: {
    primaryGoal?: PrimaryFinancialGoal | null;
    liquidSavings?: number | null;
  }
): RoadmapTask[] {
  const surplus = Math.max(0, Math.round(monthlyMargin));
  const primaryGoal = options?.primaryGoal ?? null;
  const liquidSavings =
    options?.liquidSavings == null || !Number.isFinite(options.liquidSavings)
      ? null
      : Math.max(0, Math.round(options.liquidSavings));
  const goalLabel = primaryGoalLabel(primaryGoal);

  const debtFocus =
    bottleneck === "high-interest-debt" || archetype === "survival"
      ? "Point every leftover dollar at the highest APR first (Avalanche)."
      : surplus > 0
        ? `You have about ${usd(surplus)}/mo of margin — protect it before lifestyle creep eats it.`
        : "Stabilize cash flow first so investing has something real to compound.";

  let savingsDetail =
    "Trim a slice of identified non-essential spend and automate the difference.";
  if (liquidSavings != null && liquidSavings < 1000) {
    savingsDetail = `Grow liquid savings past a $${usd(1000)} starter buffer${
      goalLabel ? ` on the path to ${goalLabel}` : ""
    }, then automate a monthly transfer.`;
  } else if (primaryGoal === "home-down-payment") {
    savingsDetail =
      "Automate a dedicated down-payment bucket (HYSA) before aggressive brokerage growth.";
  } else if (primaryGoal === "buy-a-car") {
    savingsDetail =
      "Automate a car-purchase cash target so you avoid financing at punitive rates.";
  } else if (liquidSavings != null && liquidSavings >= 1000) {
    savingsDetail = `You already reported ~${usd(liquidSavings)} liquid — protect that cushion and automate surplus above it.`;
  }

  let growthDetail =
    "See a 10-year illustration of investing those savings — then practice with paper trading.";
  if (primaryGoal === "financial-independence") {
    growthDetail =
      "Model FI runway with tax-advantaged accounts first, then practice the habit in paper trading.";
  } else if (primaryGoal === "wealth-growth") {
    growthDetail =
      "Illustrate 10-year compounding of surplus, then rehearse order entry in the Simulation Lab.";
  } else if (primaryGoal === "home-down-payment" || primaryGoal === "buy-a-car") {
    growthDetail =
      "Keep the near-term purchase funded in cash; use paper trading only to learn — not to raid the goal pot.";
  }

  return [
    task(ROADMAP_QUEST_IDS.cashFlowDebt, "Cash Flow & Debt Optimization", debtFocus),
    task(ROADMAP_QUEST_IDS.microSavings, "Micro-Savings Target", savingsDetail),
    task(ROADMAP_QUEST_IDS.compoundGrowth, "Compound Investment Growth Engine", growthDetail),
  ];
}

export function buildFinancialRoadmap(answers: FinancialProfileAnswers, userId?: string): FinancialRoadmap {
  const monthlyIncome = Math.max(0, Number.isFinite(answers.monthlyIncome) ? answers.monthlyIncome : 0);
  const monthlyEssentialExpenses = Math.max(
    0,
    Number.isFinite(answers.monthlyEssentialExpenses) ? answers.monthlyEssentialExpenses : 0
  );
  const monthlyMargin = discretionaryMargin(monthlyIncome, monthlyEssentialExpenses);
  const incomeRange = incomeRangeFromAmount(monthlyIncome);
  const marginRange = marginRangeFromAmount(monthlyMargin);
  const archetype = archetypeFromMargin(marginRange);
  const costOfLiving = costOfLivingForState(answers.stateCode);
  const state = stateByCode(answers.stateCode);
  const expenseLoad = expenseLoadFromNumbers(monthlyIncome, monthlyEssentialExpenses);
  const liquidSavings =
    answers.liquidSavings == null || !Number.isFinite(answers.liquidSavings)
      ? null
      : Math.max(0, Math.round(answers.liquidSavings));
  const primaryGoal = isPrimaryGoal(answers.primaryGoal) ? answers.primaryGoal : null;
  const now = new Date().toISOString();
  const todos = buildRoadmapTodos(archetype, answers.bottleneck, monthlyMargin, {
    primaryGoal,
    liquidSavings,
  });
  const knowledgeLevel = normalizeKnowledgeLevel(answers.knowledgeLevel);
  const unlockAllPhases = unlocksAllCurriculum(knowledgeLevel);

  const profile: FinancialProfile = {
    version: 2,
    userId: userId ?? getStoredUser()?.id ?? "anon",
    stateCode: answers.stateCode,
    monthlyIncome,
    monthlyEssentialExpenses,
    monthlyMargin,
    incomeRange,
    marginRange,
    bottleneck: answers.bottleneck,
    knowledgeLevel,
    costOfLiving,
    archetype,
    expenseLoad,
    liquidSavings,
    primaryGoal,
    completedAt: now,
    updatedAt: now,
  };

  const flavor = `${locationNote(state)}${incomeNote(monthlyIncome, monthlyMargin)}${bottleneckNote(
    answers.bottleneck
  )}${primaryGoalNote(primaryGoal, liquidSavings)}`;

  if (archetype === "survival") {
    const phaseOrder = uniquePhases(applyBottleneck([...PHASE_ORDER], answers.bottleneck, archetype));
    const shortfall = monthlyMargin < 0;
    return {
      profile,
      archetype,
      title: "Survival & Income Growth",
      modeLabel: "Survival & Income Growth Mode",
      accent: "#F43F5E",
      accentSoft: "rgba(244, 63, 94, 0.12)",
      summary: shortfall
        ? `Zero-investment pressure. Essentials exceed take-home by ${usd(Math.abs(monthlyMargin))} — every extra dollar should defend the household, not chase the market.`
        : `Zero-investment pressure. With ${usd(monthlyMargin)} of monthly margin, every extra dollar should defend the household — not chase the market.`,
      strategy: `Focus 100% on expense auditing, high-interest debt payoff (Avalanche), and income-boost strategies.${flavor}`,
      steps: todos.map((item) => item.title),
      todos,
      recommendedPhaseId: "phase-1",
      phaseOrder,
      lockedPhaseIds: [],
      lockReason: unlockAllPhases
        ? null
        : "Finish each phase to unlock the next — Phase 2–5 stay sequential.",
      unlockAllPhases,
      knowledgeLevel,
    };
  }

  if (archetype === "micro-match") {
    const phaseOrder = uniquePhases(
      applyBottleneck(["phase-2", "phase-1", "phase-3", "phase-4", "phase-5"], answers.bottleneck, archetype)
    );
    return {
      profile,
      archetype,
      title: "Micro-Match & Shield",
      modeLabel: "Micro-Match & Shield Mode",
      accent: "#F59E0B",
      accentSoft: "rgba(245, 158, 11, 0.12)",
      summary: `A ${usd(monthlyMargin)} surplus is enough to grab free money and a tiny buffer — not enough to skip defense.`,
      strategy: `Capture the 401(k) employer match up to the company limit, build a $1,000 mini emergency buffer, then return to remaining debt.${flavor}`,
      steps: todos.map((item) => item.title),
      todos,
      recommendedPhaseId: phaseOrder[0] ?? "phase-2",
      phaseOrder,
      lockedPhaseIds: [],
      lockReason: unlockAllPhases
        ? null
        : "Finish each phase to unlock the next — Phase 2–5 stay sequential.",
      unlockAllPhases,
      knowledgeLevel,
    };
  }

  const phaseOrder = uniquePhases(
    applyBottleneck(["phase-2", "phase-3", "phase-1", "phase-4", "phase-5"], answers.bottleneck, archetype)
  );
  return {
    profile,
    archetype,
    title: "Wealth Building & Tax Optimization",
    modeLabel: "Wealth Building & Tax Optimization Mode",
    accent: "#10B981",
    accentSoft: "rgba(16, 185, 129, 0.12)",
    summary: `With ${usd(monthlyMargin)} of monthly margin you can play offense — but the order still matters more than the ticker.`,
    strategy: `Max the 401(k) match, then Roth IRA, then HSA if eligible, then aggressive S&P 500 / paper-trading growth.${flavor}`,
    steps: todos.map((item) => item.title),
    todos,
    recommendedPhaseId: phaseOrder[0] ?? "phase-2",
    phaseOrder,
    lockedPhaseIds: [],
    lockReason: unlockAllPhases
      ? null
      : "Finish each phase to unlock the next — Phase 2–5 stay sequential.",
    unlockAllPhases,
    knowledgeLevel,
  };
}

function isIncomeRange(value: unknown): value is IncomeRange {
  return value === "under-3k" || value === "3k-5k" || value === "5k-8k" || value === "8k-plus";
}

function isMarginRange(value: unknown): value is MarginRange {
  return value === "zero" || value === "micro" || value === "solid" || value === "high";
}

function isBottleneck(value: unknown): value is Bottleneck {
  return (
    value === "high-interest-debt" ||
    value === "emergency-safety-net" ||
    value === "tax-strategy" ||
    value === "stock-portfolio"
  );
}

function isPrimaryGoal(value: unknown): value is PrimaryFinancialGoal {
  return (
    value === "home-down-payment" ||
    value === "buy-a-car" ||
    value === "financial-independence" ||
    value === "wealth-growth"
  );
}

function normalizeKnowledgeLevel(value: unknown): KnowledgeLevel {
  if (value === "intermediate") return "intermediate";
  if (value === "advanced" || value === "experienced" || value === "confident") return "advanced";
  return "beginner";
}

function parseProfile(raw: string): FinancialProfile | null {
  const parsed = JSON.parse(raw) as Partial<FinancialProfile>;
  if (!isBottleneck(parsed.bottleneck)) return null;

  const hasNumbers =
    typeof parsed.monthlyIncome === "number" &&
    Number.isFinite(parsed.monthlyIncome) &&
    typeof parsed.monthlyEssentialExpenses === "number" &&
    Number.isFinite(parsed.monthlyEssentialExpenses);

  let monthlyIncome: number;
  let monthlyEssentialExpenses: number;
  let incomeRange: IncomeRange;
  let marginRange: MarginRange;

  if (hasNumbers) {
    monthlyIncome = Math.max(0, parsed.monthlyIncome ?? 0);
    monthlyEssentialExpenses = Math.max(0, parsed.monthlyEssentialExpenses ?? 0);
    incomeRange = incomeRangeFromAmount(monthlyIncome);
    marginRange = marginRangeFromAmount(discretionaryMargin(monthlyIncome, monthlyEssentialExpenses));
  } else if (isIncomeRange(parsed.incomeRange) && isMarginRange(parsed.marginRange)) {
    incomeRange = parsed.incomeRange;
    marginRange = parsed.marginRange;
    monthlyIncome = midpointIncome(incomeRange);
    monthlyEssentialExpenses = Math.max(0, monthlyIncome - midpointMargin(marginRange));
  } else {
    return null;
  }

  const monthlyMargin = discretionaryMargin(monthlyIncome, monthlyEssentialExpenses);
  const stateCode = typeof parsed.stateCode === "string" && parsed.stateCode ? parsed.stateCode : null;
  const liquidSavings =
    typeof parsed.liquidSavings === "number" && Number.isFinite(parsed.liquidSavings)
      ? Math.max(0, Math.round(parsed.liquidSavings))
      : null;
  const primaryGoal = isPrimaryGoal(parsed.primaryGoal) ? parsed.primaryGoal : null;
  return {
    version: 2,
    userId: typeof parsed.userId === "string" ? parsed.userId : "anon",
    stateCode,
    monthlyIncome,
    monthlyEssentialExpenses,
    monthlyMargin,
    incomeRange,
    marginRange,
    bottleneck: parsed.bottleneck,
    knowledgeLevel: normalizeKnowledgeLevel(parsed.knowledgeLevel),
    costOfLiving: costOfLivingForState(stateCode),
    archetype: archetypeFromMargin(marginRange),
    expenseLoad: expenseLoadFromNumbers(monthlyIncome, monthlyEssentialExpenses),
    liquidSavings,
    primaryGoal,
    completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : new Date().toISOString(),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
  };
}

export function loadFinancialProfile(userId?: string): FinancialProfile | null {
  try {
    const raw = readLocalItem(storageKey(userId), legacyStorageKey(userId));
    if (!raw) return null;
    return parseProfile(raw);
  } catch {
    return null;
  }
}

export function hasFinancialProfile(userId?: string): boolean {
  return loadFinancialProfile(userId) != null;
}

export function loadFinancialRoadmap(userId?: string): FinancialRoadmap | null {
  const profile = loadFinancialProfile(userId);
  if (!profile) return null;
  const roadmap = buildFinancialRoadmap(profile, profile.userId);
  return {
    ...roadmap,
    profile: { ...roadmap.profile, completedAt: profile.completedAt, updatedAt: profile.updatedAt },
  };
}

export function saveFinancialProfile(answers: FinancialProfileAnswers, userId?: string): FinancialRoadmap {
  const existing = loadFinancialProfile(userId);
  const merged: FinancialProfileAnswers = {
    ...answers,
    liquidSavings:
      answers.liquidSavings !== undefined ? answers.liquidSavings : existing?.liquidSavings ?? null,
    primaryGoal: answers.primaryGoal !== undefined ? answers.primaryGoal : existing?.primaryGoal ?? null,
  };
  const roadmap = buildFinancialRoadmap(merged, userId);
  const persist: FinancialProfile = {
    ...roadmap.profile,
    completedAt: existing?.completedAt ?? roadmap.profile.completedAt,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey(persist.userId), JSON.stringify(persist));
  } catch {
    // Quota / private mode — in-memory roadmap still works for this session.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FINANCIAL_PROFILE_UPDATED_EVENT));
  }
  return { ...roadmap, profile: persist };
}

function emptyTodoProgress(): RoadmapTodoProgress {
  return { completedIds: [], awardedIds: [] };
}

function parseTodoProgress(raw: string): RoadmapTodoProgress {
  const parsed = JSON.parse(raw) as Partial<RoadmapTodoProgress>;
  const completedIds = Array.isArray(parsed.completedIds)
    ? parsed.completedIds.filter((id): id is string => typeof id === "string")
    : [];
  const awardedIds = Array.isArray(parsed.awardedIds)
    ? parsed.awardedIds.filter((id): id is string => typeof id === "string")
    : [];
  return { completedIds, awardedIds };
}

export function loadRoadmapTodoProgress(userId?: string): RoadmapTodoProgress {
  try {
    const raw = readLocalItem(todoStorageKey(userId), legacyTodoStorageKey(userId));
    if (!raw) return emptyTodoProgress();
    return parseTodoProgress(raw);
  } catch {
    return emptyTodoProgress();
  }
}

function persistTodoProgress(progress: RoadmapTodoProgress, userId?: string) {
  try {
    localStorage.setItem(todoStorageKey(userId ?? getStoredUser()?.id ?? "anon"), JSON.stringify(progress));
  } catch {
    // Quota / private mode — in-memory progress still works this session.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ROADMAP_TODO_UPDATED_EVENT));
  }
}

export function toggleRoadmapTask(
  task: RoadmapTask,
  complete: boolean,
  userId?: string
): { progress: RoadmapTodoProgress; awardedXp: number } {
  const current = loadRoadmapTodoProgress(userId);
  const completed = new Set(current.completedIds);
  const awarded = new Set(current.awardedIds);
  let awardedXp = 0;

  if (complete) {
    completed.add(task.id);
    if (!awarded.has(task.id)) {
      awarded.add(task.id);
      awardLessonXp(task.xp, userId);
      awardedXp = task.xp;
    }
  } else {
    completed.delete(task.id);
  }

  const progress = { completedIds: [...completed], awardedIds: [...awarded] };
  persistTodoProgress(progress, userId);
  return { progress, awardedXp };
}

export function requestFinancialOnboarding(cancelable = true) {
  if (typeof window === "undefined") return;
  const detail: OpenOnboardingDetail = { cancelable };
  window.dispatchEvent(new CustomEvent<OpenOnboardingDetail>(OPEN_FINANCIAL_ONBOARDING_EVENT, { detail }));
}

export function requestFinancialRoadmap() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_FINANCIAL_ROADMAP_EVENT));
}

function welcomeSeenKey(userId?: string) {
  return `sprout_ai_welcome_seen_${userId ?? getStoredUser()?.id ?? "anon"}`;
}

export function hasSeenSproutWelcome(userId?: string): boolean {
  try {
    return localStorage.getItem(welcomeSeenKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markSproutWelcomeSeen(userId?: string) {
  try {
    localStorage.setItem(welcomeSeenKey(userId), "1");
  } catch {
    // private mode / quota
  }
}

export function subscribeFinancialProfile(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(FINANCIAL_PROFILE_UPDATED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(FINANCIAL_PROFILE_UPDATED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function subscribeRoadmapTodos(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ROADMAP_TODO_UPDATED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(ROADMAP_TODO_UPDATED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
