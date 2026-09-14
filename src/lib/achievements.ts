import { holdingAccount, type AccountKind } from "./accountKind";
import { isEtfAsset } from "./etfIcons";
import { formatNumber, toFiniteNumber } from "./money";
import { SAFETY_NET_STARTER_MONTHS } from "./safetyNet";
import { readLocalItem } from "./storage";
import { getLessonStreak, STREAK_MILESTONES } from "./streakService";

export const HISTORICAL_ANNUAL_RETURN = 0.08;
export const COMPOUNDER_MIN_DAYS = 365;
export const THOUSAND_MILESTONE = 1000;
export const EMERGENCY_SHIELD_USD = 300;
export const TROPHY_SHELF_CAPACITY = 4;
export const TROPHY_SHELVES_PER_CABINET = 5;
export const TROPHY_CABINET_CAPACITY = TROPHY_SHELF_CAPACITY * TROPHY_SHELVES_PER_CABINET;

export const TROPHY_IDS = [
  "firstStep",
  "tickerScout",
  "cashCushion",
  "emergencyShield",
  "fortressLiquidity",
  "oldYou",
  "thousand",
  "trio",
  "inTheGreen",
  "compounder",
  "fiveK",
  "fiveTickers",
  "indexBeliever",
  "habitStacker",
  "tenK",
  "doubleDigit",
  "yearIn",
  "eightHoldings",
  "twentyFiveK",
  "hundredK",
  "fullRoster",
  "millionPath",
  "consistentLearner",
  "financeScholar",
  "marketStrategist",
] as const;

export type TrophyId = (typeof TROPHY_IDS)[number];
export const TROPHY_SLOTS = TROPHY_IDS.length;

/** Portfolio / equity trophies — paper (manual) lots cannot unlock these. */
export const INVESTMENT_TROPHY_IDS = [
  "firstStep",
  "tickerScout",
  "cashCushion",
  "thousand",
  "trio",
  "inTheGreen",
  "compounder",
  "fiveK",
  "fiveTickers",
  "indexBeliever",
  "tenK",
  "doubleDigit",
  "yearIn",
  "eightHoldings",
  "twentyFiveK",
  "hundredK",
  "fullRoster",
  "millionPath",
] as const satisfies readonly TrophyId[];

const INVESTMENT_TROPHY_ID_SET = new Set<TrophyId>(INVESTMENT_TROPHY_IDS);

export function isInvestmentTrophy(id: TrophyId): boolean {
  return INVESTMENT_TROPHY_ID_SET.has(id);
}

export type TrophyProgress = {
  current: number;
  target: number;
  label: string;
};

export type Trophy = {
  id: TrophyId;
  title: string;
  requirement: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress: TrophyProgress;
  metric: string;
  requiresVerified: boolean;
};

export type TrophyCabinetPage = {
  number: number;
  filled: number;
  shelves: (Trophy | null)[][];
};

/** Split earned badges into cabinets of 5 shelves × 4 slots. A new cabinet appears once the previous one is full. */
export function buildTrophyCabinetPages(trophies: Trophy[]): TrophyCabinetPage[] {
  const unlocked = trophies.filter((trophy) => trophy.unlocked);
  const cabinetCount = Math.max(1, Math.ceil(unlocked.length / TROPHY_CABINET_CAPACITY));
  const pages: TrophyCabinetPage[] = [];

  for (let cabinetIndex = 0; cabinetIndex < cabinetCount; cabinetIndex += 1) {
    const start = cabinetIndex * TROPHY_CABINET_CAPACITY;
    const slice = unlocked.slice(start, start + TROPHY_CABINET_CAPACITY);
    const shelves: (Trophy | null)[][] = [];

    for (let shelfIndex = 0; shelfIndex < TROPHY_SHELVES_PER_CABINET; shelfIndex += 1) {
      const shelf: (Trophy | null)[] = [];
      for (let slot = 0; slot < TROPHY_SHELF_CAPACITY; slot += 1) {
        shelf.push(slice[shelfIndex * TROPHY_SHELF_CAPACITY + slot] ?? null);
      }
      shelves.push(shelf);
    }

    pages.push({
      number: cabinetIndex + 1,
      filled: slice.length,
      shelves,
    });
  }

  return pages;
}

type HoldingLike =
  | {
      kind: "stock";
      quantity: number;
      avgCost: number;
      currentPrice: number;
      symbol?: string;
      description?: string;
      account?: AccountKind | null;
    }
  | { kind: "broker"; balance: number; account?: AccountKind | null };

export type TrophyFacts = {
  userId: string;
  holdings: HoldingLike[];
  netWorth: number;
  portfolioValue: number;
  retirementDeposits: number;
  safetyNetValue?: number;
  monthlyExpenses?: number;
  now?: Date;
  /** False while the portfolio request is in flight so paper lots aren't judged from an empty snapshot. */
  holdingsReady?: boolean;
};

type TrophyPersist = {
  firstInvestedAt?: string;
  firstVerifiedInvestedAt?: string;
  unlockedAt: Partial<Record<TrophyId, string>>;
};

type EvalResult = {
  earned: boolean;
  progress: TrophyProgress;
  metric: string;
};

export const TROPHY_UNLOCKED_EVENT = "matterpro:trophy-unlocked";

export type TrophyUnlockedDetail = {
  trophies: Trophy[];
};

const CATALOG: Record<TrophyId, { title: string; requirement: string; unlockLead: string }> = {
  firstStep: {
    title: "First Step",
    requirement: "Hold your first stock or cash asset in a verified brokerage account. Paper trades don't count.",
    unlockLead: "You logged your first verified asset",
  },
  tickerScout: {
    title: "Ticker Scout",
    requirement: "Own at least one equity position in a verified brokerage account.",
    unlockLead: "You picked up your first verified equity",
  },
  cashCushion: {
    title: "Cash Cushion",
    requirement: "Hold a cash balance in a verified brokerage account.",
    unlockLead: "You logged a verified cash balance",
  },
  emergencyShield: {
    title: "Emergency Shield",
    requirement: "Grow your Safety Net past $300 — more liquid than the typical US household emergency cushion.",
    unlockLead: "You built a Safety Net past $300",
  },
  fortressLiquidity: {
    title: "Fortress of Liquidity",
    requirement: "Reach 100% of a 3-month expense target in your Safety Net.",
    unlockLead: "You funded 3 months of expenses in your Safety Net",
  },
  oldYou: {
    title: "Old You Loves You",
    requirement: "Make a deposit to your 401(k) / IRA.",
    unlockLead: "You joined the retirement system",
  },
  thousand: {
    title: "$1,000 Milestone",
    requirement: "Grow a verified brokerage portfolio to $1,000. Paper Account value is excluded.",
    unlockLead: "You crossed the $1,000 milestone",
  },
  trio: {
    title: "The Trio",
    requirement: "Hold three distinct equity tickers in a verified brokerage account.",
    unlockLead: "You now hold three distinct verified tickers",
  },
  inTheGreen: {
    title: "In the Green",
    requirement: "Push verified brokerage market value above cost basis.",
    unlockLead: "You pushed your verified portfolio above cost basis",
  },
  compounder: {
    title: "The 8% Compounder",
    requirement: "Beat the historical 8% annual average after one year in a verified brokerage account.",
    unlockLead: "You beat the historical 8% annual average",
  },
  fiveK: {
    title: "$5,000 Club",
    requirement: "Grow a verified brokerage portfolio to $5,000. Paper Account value is excluded.",
    unlockLead: "You reached the $5,000 club",
  },
  fiveTickers: {
    title: "Five Tickers",
    requirement: "Hold five distinct equity tickers in a verified brokerage account.",
    unlockLead: "You now hold five distinct verified tickers",
  },
  indexBeliever: {
    title: "Index Believer",
    requirement: "Own at least one ETF or index fund in a verified brokerage account.",
    unlockLead: "You added a verified ETF to your portfolio",
  },
  habitStacker: {
    title: "Habit Stacker",
    requirement: "Log three retirement deposits.",
    unlockLead: "You logged three retirement deposits",
  },
  tenK: {
    title: "Five Figures",
    requirement: "Grow a verified brokerage portfolio to $10,000. Paper Account value is excluded.",
    unlockLead: "You reached five figures",
  },
  doubleDigit: {
    title: "Double Digits",
    requirement: "Reach a 10% simple return on verified brokerage equities.",
    unlockLead: "You reached a 10% return on equities",
  },
  yearIn: {
    title: "One Year In",
    requirement: "Stay invested for 365 days in a verified brokerage account.",
    unlockLead: "You've stayed invested for a full year",
  },
  eightHoldings: {
    title: "Spread Out",
    requirement: "Hold eight distinct verified brokerage positions.",
    unlockLead: "You spread out across eight verified positions",
  },
  twentyFiveK: {
    title: "$25,000 Club",
    requirement: "Grow a verified brokerage portfolio to $25,000. Paper Account value is excluded.",
    unlockLead: "You reached the $25,000 club",
  },
  hundredK: {
    title: "Six Figures",
    requirement: "Grow a verified brokerage portfolio to $100,000. Paper Account value is excluded.",
    unlockLead: "You hit six figures",
  },
  fullRoster: {
    title: "Full Roster",
    requirement: "Hold twelve distinct verified brokerage positions.",
    unlockLead: "You filled twelve verified positions",
  },
  millionPath: {
    title: "Freedom Number",
    requirement: "Grow a verified brokerage portfolio to $1,000,000. Paper Account value is excluded.",
    unlockLead: "You reached your $1,000,000 freedom number",
  },
  consistentLearner: {
    title: "Consistent Learner",
    requirement: "Complete at least one lesson module on 3 consecutive calendar days.",
    unlockLead: "You locked in a 3-day learning streak",
  },
  financeScholar: {
    title: "Finance Scholar",
    requirement: "Complete at least one lesson module on 7 consecutive calendar days.",
    unlockLead: "You built a 7-day learning streak",
  },
  marketStrategist: {
    title: "Market Strategist",
    requirement: "Complete at least one lesson module on 30 consecutive calendar days.",
    unlockLead: "You sustained a 30-day learning streak",
  },
};

const announcedUnlocks = new Set<string>();
let pendingUnlocks: Trophy[] = [];
const unlockListeners = new Set<(trophies: Trophy[]) => void>();

export function subscribeTrophyUnlocks(listener: (trophies: Trophy[]) => void): () => void {
  unlockListeners.add(listener);
  if (pendingUnlocks.length > 0) listener(pendingUnlocks);
  return () => {
    unlockListeners.delete(listener);
  };
}

export function acknowledgeTrophyUnlock(id: TrophyId) {
  pendingUnlocks = pendingUnlocks.filter((trophy) => trophy.id !== id);
}

function publishUnlocks(trophies: Trophy[]) {
  if (trophies.length === 0) return;
  const seen = new Set(pendingUnlocks.map((trophy) => trophy.id));
  const fresh: Trophy[] = [];
  for (const trophy of trophies) {
    if (seen.has(trophy.id)) continue;
    pendingUnlocks.push(trophy);
    fresh.push(trophy);
    seen.add(trophy.id);
  }
  if (fresh.length === 0) return;
  for (const listener of unlockListeners) listener(fresh);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<TrophyUnlockedDetail>(TROPHY_UNLOCKED_EVENT, { detail: { trophies: fresh } })
    );
  }
}

function storageKey(userId: string) {
  return `sprout_trophy_cabinet_${userId || "anon"}`;
}

function legacyStorageKey(userId: string) {
  return `matterpro:trophy-cabinet:${userId || "anon"}`;
}

function loadPersist(userId: string): TrophyPersist {
  try {
    const raw = readLocalItem(storageKey(userId), legacyStorageKey(userId));
    if (!raw) return { unlockedAt: {} };
    const parsed = JSON.parse(raw) as Partial<TrophyPersist>;
    const firstInvestedAt =
      typeof parsed.firstInvestedAt === "string" && !Number.isNaN(Date.parse(parsed.firstInvestedAt))
        ? parsed.firstInvestedAt
        : undefined;
    const firstVerifiedInvestedAt =
      typeof parsed.firstVerifiedInvestedAt === "string" &&
      !Number.isNaN(Date.parse(parsed.firstVerifiedInvestedAt))
        ? parsed.firstVerifiedInvestedAt
        : undefined;
    const unlockedAt: Partial<Record<TrophyId, string>> = {};
    const rawUnlocks = parsed.unlockedAt && typeof parsed.unlockedAt === "object" ? parsed.unlockedAt : {};
    for (const id of TROPHY_IDS) {
      const value = rawUnlocks[id];
      if (typeof value === "string" && !Number.isNaN(Date.parse(value))) unlockedAt[id] = value;
    }
    return { firstInvestedAt, firstVerifiedInvestedAt, unlockedAt };
  } catch {
    return { unlockedAt: {} };
  }
}

function savePersist(userId: string, state: TrophyPersist) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // ignore quota / private-mode failures
  }
}

function isVerifiedHolding(holding: HoldingLike): boolean {
  return holdingAccount(holding) === "verified";
}

type HoldingStats = {
  hasFirstAsset: boolean;
  hasEquity: boolean;
  hasEtf: boolean;
  tickerCount: number;
  positionCount: number;
  cashBalance: number;
  wealth: number;
  cost: number;
  value: number;
  simple: number | null;
};

function summarizeHoldings(holdings: HoldingLike[]): HoldingStats {
  const tickers = new Set<string>();
  let hasEtf = false;
  let cashBalance = 0;
  let positionCount = 0;
  let hasFirstAsset = false;

  for (const holding of holdings) {
    if (holding.kind === "broker") {
      const balance = Number.isFinite(holding.balance) ? Math.max(0, holding.balance) : 0;
      cashBalance += balance;
      if (balance > 0) {
        positionCount += 1;
        hasFirstAsset = true;
      }
      continue;
    }
    if (holding.quantity <= 0) continue;
    hasFirstAsset = true;
    positionCount += 1;
    const symbol = (holding.symbol || "").trim().toUpperCase();
    if (symbol) tickers.add(symbol);
    if (isEtfAsset(symbol, { name: holding.description })) hasEtf = true;
  }

  const { cost, value, simple } = portfolioReturn(holdings);
  return {
    hasFirstAsset,
    hasEquity: tickers.size > 0,
    hasEtf,
    tickerCount: tickers.size,
    positionCount,
    cashBalance,
    wealth: value + cashBalance,
    cost,
    value,
    simple,
  };
}

function paperNote(paperCount: number, unit: string): string {
  if (paperCount <= 0) return "";
  return ` · ${paperCount} paper ${unit} excluded`;
}

function paperUsdNote(paperWealth: number): string {
  if (paperWealth <= 0) return "";
  return ` · ${formatUsd(paperWealth)} paper excluded`;
}

function portfolioReturn(holdings: HoldingLike[]): { cost: number; value: number; simple: number | null } {
  let cost = 0;
  let value = 0;
  for (const holding of holdings) {
    if (holding.kind !== "stock" || holding.quantity <= 0) continue;
    const avgCost = Number.isFinite(holding.avgCost) ? holding.avgCost : 0;
    const price = Number.isFinite(holding.currentPrice) ? holding.currentPrice : 0;
    cost += holding.quantity * Math.max(0, avgCost);
    value += holding.quantity * Math.max(0, price);
  }
  if (cost <= 0) return { cost, value, simple: null };
  return { cost, value, simple: value / cost - 1 };
}

function daysBetween(fromISO: string, now: Date): number {
  const start = Date.parse(fromISO);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / 86_400_000));
}

function formatUsd(amount: unknown): string {
  const rounded = Math.max(0, Math.round(toFiniteNumber(amount, 0)));
  return `$${formatNumber(rounded)}`;
}

function formatPct(ratio: number): string {
  const pct = ratio * 100;
  const digits = Math.abs(pct) >= 10 ? 0 : 1;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

function latchUnlock(
  userId: string,
  unlockedAt: Partial<Record<TrophyId, string>>,
  id: TrophyId,
  earned: boolean,
  nowISO: string
): boolean {
  if (!earned) return false;
  const key = `${userId}:${id}`;
  if (unlockedAt[id]) {
    announcedUnlocks.add(key);
    return false;
  }
  unlockedAt[id] = nowISO;
  if (announcedUnlocks.has(key)) return false;
  announcedUnlocks.add(key);
  return true;
}

export function trophyUnlockMessage(trophy: Trophy, userName: string): string {
  const name = userName.trim() || "Investor";
  const lead = CATALOG[trophy.id].unlockLead;
  return `Congratulations ${name}! ${lead} and achieved the '${trophy.title}' badge.`;
}

function wealthProgress(wealth: number, target: number): EvalResult {
  const earned = wealth >= target;
  const label = `${formatUsd(wealth)} / ${formatUsd(target)}`;
  return {
    earned,
    progress: { current: Math.min(wealth, target), target, label },
    metric: earned ? `Net worth reached ${formatUsd(wealth)}` : label,
  };
}

function countProgress(
  current: number,
  target: number,
  unit: string,
  earnedMetric: string
): EvalResult {
  const earned = current >= target;
  const label = `${current} / ${target} ${unit}`;
  return {
    earned,
    progress: { current: Math.min(current, target), target, label },
    metric: earned ? earnedMetric : label,
  };
}

function streakProgress(current: number, longest: number, target: number): EvalResult {
  const earned = longest >= target;
  const label = `${current} / ${target} day streak`;
  return {
    earned,
    progress: {
      current: Math.min(earned ? Math.max(current, target) : current, target),
      target,
      label: earned ? `${longest}-day streak reached` : label,
    },
    metric: earned ? `Longest learning streak: ${longest} days` : label,
  };
}

function booleanProgress(earned: boolean, doneLabel: string, pendingLabel: string): EvalResult {
  return {
    earned,
    progress: {
      current: earned ? 1 : 0,
      target: 1,
      label: earned ? doneLabel : pendingLabel,
    },
    metric: earned ? doneLabel : pendingLabel,
  };
}

export function trophyCompletionPct(trophy: Trophy): number {
  if (trophy.unlocked) return 100;
  if (trophy.progress.target <= 0) return 0;
  const raw = (trophy.progress.current / trophy.progress.target) * 100;
  return Math.max(0, Math.min(99, raw));
}

export function formatTrophyUnlockedDate(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function evaluateTrophies(facts: TrophyFacts): Trophy[] {
  const now = facts.now ?? new Date();
  const nowISO = now.toISOString();
  const persist = loadPersist(facts.userId);
  const snapshot = JSON.stringify(persist);
  const unlockedAt = { ...persist.unlockedAt };

  const holdings = Array.isArray(facts.holdings) ? facts.holdings : [];
  const verifiedHoldings = holdings.filter(isVerifiedHolding);
  const paperHoldings = holdings.filter((holding) => !isVerifiedHolding(holding));
  const verified = summarizeHoldings(verifiedHoldings);
  const paper = summarizeHoldings(paperHoldings);

  if (!persist.firstInvestedAt && (verified.hasEquity || paper.hasEquity)) {
    persist.firstInvestedAt = nowISO;
  }
  if (!persist.firstVerifiedInvestedAt && verified.hasEquity) {
    persist.firstVerifiedInvestedAt = nowISO;
  }

  const daysInvested = persist.firstVerifiedInvestedAt
    ? daysBetween(persist.firstVerifiedInvestedAt, now)
    : 0;
  const years = daysInvested / COMPOUNDER_MIN_DAYS;
  const growth = verified.simple != null ? 1 + verified.simple : null;
  const annualReturn =
    growth != null && years >= 1 && growth > 0 ? Math.pow(growth, 1 / years) - 1 : null;
  const compounderEarned =
    daysInvested >= COMPOUNDER_MIN_DAYS &&
    annualReturn != null &&
    annualReturn > HISTORICAL_ANNUAL_RETURN;

  const depositCount = Math.max(0, Math.floor(facts.retirementDeposits));
  const safetyNetValue = Math.max(0, facts.safetyNetValue ?? 0);
  const monthlyExpenses = Math.max(0, facts.monthlyExpenses ?? 0);
  const fortressTarget = monthlyExpenses * SAFETY_NET_STARTER_MONTHS;
  const lessonStreak = getLessonStreak(facts.userId, now);

  const compounderEval = ((): EvalResult => {
    if (verified.simple == null) {
      const pending = paper.simple != null
        ? "Requires verified brokerage equity (paper lots excluded)"
        : "Hold verified equity with a cost basis";
      return {
        earned: false,
        progress: { current: 0, target: COMPOUNDER_MIN_DAYS, label: pending },
        metric: pending,
      };
    }
    if (daysInvested < COMPOUNDER_MIN_DAYS) {
      const label = `${daysInvested} / ${COMPOUNDER_MIN_DAYS} days · ${formatPct(verified.simple)} so far`;
      return {
        earned: false,
        progress: { current: daysInvested, target: COMPOUNDER_MIN_DAYS, label },
        metric: label,
      };
    }
    const shown = annualReturn ?? verified.simple;
    const label = `${formatPct(shown)} annual vs 8% benchmark`;
    return {
      earned: compounderEarned,
      progress: {
        current: Math.max(0, shown) * 100,
        target: HISTORICAL_ANNUAL_RETURN * 100,
        label,
      },
      metric: compounderEarned
        ? `Annual return reached ${formatPct(shown)}`
        : `Annual return at ${formatPct(shown)} vs 8% target`,
    };
  })();

  const greenEval = ((): EvalResult => {
    if (verified.cost <= 0) {
      return booleanProgress(
        false,
        "Verified portfolio is above cost",
        paper.cost > 0
          ? "Requires verified brokerage equities (paper lots excluded)"
          : "Hold verified equities with a cost basis"
      );
    }
    const earned = verified.value > verified.cost;
    const label = `${formatUsd(verified.value)} / ${formatUsd(verified.cost)} cost`;
    return {
      earned,
      progress: { current: Math.min(verified.value, verified.cost), target: verified.cost, label },
      metric: earned ? `Verified portfolio value reached ${formatUsd(verified.value)}` : label,
    };
  })();

  const doubleDigitEval = ((): EvalResult => {
    if (verified.simple == null) {
      const pending = paper.simple != null
        ? "Requires verified brokerage equity (paper lots excluded)"
        : "Hold verified equity with a cost basis";
      return {
        earned: false,
        progress: { current: 0, target: 10, label: pending },
        metric: pending,
      };
    }
    const pct = verified.simple * 100;
    const earned = verified.simple >= 0.1;
    const label = `${formatPct(verified.simple)} / +10%`;
    return {
      earned,
      progress: { current: Math.max(0, Math.min(pct, 10)), target: 10, label },
      metric: earned ? `Simple return reached ${formatPct(verified.simple)}` : label,
    };
  })();

  const wealthWithPaper = (target: number): EvalResult => {
    const result = wealthProgress(verified.wealth, target);
    if (result.earned || paper.wealth <= 0) return result;
    const note = paperUsdNote(paper.wealth);
    return {
      ...result,
      progress: { ...result.progress, label: `${result.progress.label}${note}` },
      metric: `${result.metric}${note}`,
    };
  };

  const tickersWithPaper = (target: number): EvalResult => {
    const result = countProgress(
      verified.tickerCount,
      target,
      "tickers",
      `${verified.tickerCount} ${verified.tickerCount === 1 ? "ticker" : "tickers"} held`
    );
    if (result.earned || paper.tickerCount <= 0) return result;
    const note = paperNote(paper.tickerCount, "tickers");
    return {
      ...result,
      progress: { ...result.progress, label: `${result.progress.label}${note}` },
      metric: `${result.metric}${note}`,
    };
  };

  const positionsWithPaper = (target: number): EvalResult => {
    const result = countProgress(
      verified.positionCount,
      target,
      "positions",
      `${verified.positionCount} positions held`
    );
    if (result.earned || paper.positionCount <= 0) return result;
    const note = paperNote(paper.positionCount, "positions");
    return {
      ...result,
      progress: { ...result.progress, label: `${result.progress.label}${note}` },
      metric: `${result.metric}${note}`,
    };
  };

  const results: Record<TrophyId, EvalResult> = {
    firstStep: booleanProgress(
      verified.hasFirstAsset,
      "First verified asset logged",
      paper.hasFirstAsset
        ? "Requires a verified brokerage holding (paper lots excluded)"
        : "Hold your first verified stock or asset"
    ),
    tickerScout: tickersWithPaper(1),
    cashCushion: booleanProgress(
      verified.cashBalance > 0,
      `Verified cash balance ${formatUsd(verified.cashBalance)}`,
      paper.cashBalance > 0
        ? "Requires verified brokerage cash (paper balances excluded)"
        : "Hold a verified brokerage cash balance"
    ),
    emergencyShield: (() => {
      const earned = safetyNetValue >= EMERGENCY_SHIELD_USD;
      const label = `${formatUsd(safetyNetValue)} / ${formatUsd(EMERGENCY_SHIELD_USD)}`;
      return {
        earned,
        progress: {
          current: Math.min(safetyNetValue, EMERGENCY_SHIELD_USD),
          target: EMERGENCY_SHIELD_USD,
          label,
        },
        metric: earned ? `Safety Net reached ${formatUsd(safetyNetValue)}` : label,
      };
    })(),
    fortressLiquidity: (() => {
      if (fortressTarget <= 0) {
        return booleanProgress(false, "3-month target reached", "Add monthly expenses to set a 3-month target");
      }
      const earned = safetyNetValue >= fortressTarget;
      const label = `${formatUsd(safetyNetValue)} / ${formatUsd(fortressTarget)}`;
      return {
        earned,
        progress: {
          current: Math.min(safetyNetValue, fortressTarget),
          target: fortressTarget,
          label,
        },
        metric: earned
          ? `Safety Net covers ${SAFETY_NET_STARTER_MONTHS} months of expenses`
          : label,
      };
    })(),
    oldYou:
      depositCount > 0
        ? {
            earned: true,
            progress: {
              current: 1,
              target: 1,
              label: `${depositCount} ${depositCount === 1 ? "deposit" : "deposits"} logged`,
            },
            metric: `${depositCount} ${depositCount === 1 ? "deposit" : "deposits"} logged`,
          }
        : booleanProgress(false, "Retirement deposit logged", "Log a retirement deposit"),
    thousand: wealthWithPaper(THOUSAND_MILESTONE),
    trio: tickersWithPaper(3),
    inTheGreen: greenEval,
    compounder: compounderEval,
    fiveK: wealthWithPaper(5_000),
    fiveTickers: tickersWithPaper(5),
    indexBeliever: booleanProgress(
      verified.hasEtf,
      "Verified ETF position logged",
      paper.hasEtf
        ? "Requires a verified brokerage ETF (paper lots excluded)"
        : "Own at least one verified ETF"
    ),
    habitStacker: countProgress(
      depositCount,
      3,
      "deposits",
      `${depositCount} ${depositCount === 1 ? "deposit" : "deposits"} logged`
    ),
    tenK: wealthWithPaper(10_000),
    doubleDigit: doubleDigitEval,
    yearIn: countProgress(daysInvested, COMPOUNDER_MIN_DAYS, "days", `${daysInvested} days invested`),
    eightHoldings: positionsWithPaper(8),
    twentyFiveK: wealthWithPaper(25_000),
    hundredK: wealthWithPaper(100_000),
    fullRoster: positionsWithPaper(12),
    millionPath: wealthWithPaper(1_000_000),
    consistentLearner: streakProgress(lessonStreak.current, lessonStreak.longest, STREAK_MILESTONES[0].days),
    financeScholar: streakProgress(lessonStreak.current, lessonStreak.longest, STREAK_MILESTONES[1].days),
    marketStrategist: streakProgress(lessonStreak.current, lessonStreak.longest, STREAK_MILESTONES[2].days),
  };

  const newlyUnlockedIds: TrophyId[] = [];
  const holdingsReady = facts.holdingsReady !== false;
  for (const id of TROPHY_IDS) {
    const earned = results[id].earned;
    if (!earned && isInvestmentTrophy(id) && unlockedAt[id]) {
      if (!holdingsReady) continue;
      delete unlockedAt[id];
      continue;
    }
    if (latchUnlock(facts.userId, unlockedAt, id, earned, nowISO)) {
      newlyUnlockedIds.push(id);
    }
  }

  persist.unlockedAt = unlockedAt;
  if (JSON.stringify(persist) !== snapshot) savePersist(facts.userId, persist);

  const trophies = TROPHY_IDS.map((id) => {
    const meta = CATALOG[id];
    const evalResult = results[id];
    const unlocked = Boolean(unlockedAt[id]);
    return {
      id,
      title: meta.title,
      requirement: meta.requirement,
      unlocked,
      unlockedAt: unlockedAt[id],
      progress: evalResult.progress,
      metric: evalResult.metric,
      requiresVerified: isInvestmentTrophy(id),
    };
  });

  if (newlyUnlockedIds.length > 0) {
    const unlockedSet = new Set(newlyUnlockedIds);
    publishUnlocks(trophies.filter((trophy) => unlockedSet.has(trophy.id)));
  }

  return trophies;
}
