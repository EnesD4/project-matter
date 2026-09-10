import { isEtfAsset } from "./etfIcons";
import { SAFETY_NET_STARTER_MONTHS } from "./safetyNet";

export const HISTORICAL_ANNUAL_RETURN = 0.08;
export const COMPOUNDER_MIN_DAYS = 365;
export const THOUSAND_MILESTONE = 1000;
export const EMERGENCY_SHIELD_USD = 300;
export const TROPHY_SLOTS = 24;
export const TROPHY_SHELF_CAPACITY = 4;

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
] as const;

export type TrophyId = (typeof TROPHY_IDS)[number];

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
};

type HoldingLike =
  | {
      kind: "stock";
      quantity: number;
      avgCost: number;
      currentPrice: number;
      symbol?: string;
      description?: string;
    }
  | { kind: "broker"; balance: number };

export type TrophyFacts = {
  userId: string;
  holdings: HoldingLike[];
  netWorth: number;
  portfolioValue: number;
  retirementDeposits: number;
  safetyNetValue?: number;
  monthlyExpenses?: number;
  now?: Date;
};

type TrophyPersist = {
  firstInvestedAt?: string;
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
    requirement: "Log your first stock or cash asset.",
    unlockLead: "You logged your first asset",
  },
  tickerScout: {
    title: "Ticker Scout",
    requirement: "Own at least one equity position.",
    unlockLead: "You picked up your first equity",
  },
  cashCushion: {
    title: "Cash Cushion",
    requirement: "Log a brokerage or cash balance.",
    unlockLead: "You logged a cash balance",
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
    requirement: "Grow net worth or portfolio to $1,000.",
    unlockLead: "You crossed the $1,000 milestone",
  },
  trio: {
    title: "The Trio",
    requirement: "Hold three distinct equity tickers.",
    unlockLead: "You now hold three distinct tickers",
  },
  inTheGreen: {
    title: "In the Green",
    requirement: "Push portfolio market value above cost basis.",
    unlockLead: "You pushed your portfolio above cost basis",
  },
  compounder: {
    title: "The 8% Compounder",
    requirement: "Beat the historical 8% annual average after one year.",
    unlockLead: "You beat the historical 8% annual average",
  },
  fiveK: {
    title: "$5,000 Club",
    requirement: "Grow net worth or portfolio to $5,000.",
    unlockLead: "You reached the $5,000 club",
  },
  fiveTickers: {
    title: "Five Tickers",
    requirement: "Hold five distinct equity tickers.",
    unlockLead: "You now hold five distinct tickers",
  },
  indexBeliever: {
    title: "Index Believer",
    requirement: "Own at least one ETF or index fund.",
    unlockLead: "You added an ETF to your portfolio",
  },
  habitStacker: {
    title: "Habit Stacker",
    requirement: "Log three retirement deposits.",
    unlockLead: "You logged three retirement deposits",
  },
  tenK: {
    title: "Five Figures",
    requirement: "Grow net worth or portfolio to $10,000.",
    unlockLead: "You reached five figures",
  },
  doubleDigit: {
    title: "Double Digits",
    requirement: "Reach a 10% simple return on equities.",
    unlockLead: "You reached a 10% return on equities",
  },
  yearIn: {
    title: "One Year In",
    requirement: "Stay invested for 365 days.",
    unlockLead: "You've stayed invested for a full year",
  },
  eightHoldings: {
    title: "Spread Out",
    requirement: "Hold eight distinct positions.",
    unlockLead: "You spread out across eight positions",
  },
  twentyFiveK: {
    title: "$25,000 Club",
    requirement: "Grow net worth or portfolio to $25,000.",
    unlockLead: "You reached the $25,000 club",
  },
  hundredK: {
    title: "Six Figures",
    requirement: "Grow net worth or portfolio to $100,000.",
    unlockLead: "You hit six figures",
  },
  fullRoster: {
    title: "Full Roster",
    requirement: "Hold twelve distinct positions.",
    unlockLead: "You filled twelve positions",
  },
  millionPath: {
    title: "Freedom Number",
    requirement: "Grow net worth or portfolio to $1,000,000.",
    unlockLead: "You reached your $1,000,000 freedom number",
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
  return `matterpro:trophy-cabinet:${userId || "anon"}`;
}

function loadPersist(userId: string): TrophyPersist {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { unlockedAt: {} };
    const parsed = JSON.parse(raw) as Partial<TrophyPersist>;
    const firstInvestedAt =
      typeof parsed.firstInvestedAt === "string" && !Number.isNaN(Date.parse(parsed.firstInvestedAt))
        ? parsed.firstInvestedAt
        : undefined;
    const unlockedAt: Partial<Record<TrophyId, string>> = {};
    const rawUnlocks = parsed.unlockedAt && typeof parsed.unlockedAt === "object" ? parsed.unlockedAt : {};
    for (const id of TROPHY_IDS) {
      const value = rawUnlocks[id];
      if (typeof value === "string" && !Number.isNaN(Date.parse(value))) unlockedAt[id] = value;
    }
    return { firstInvestedAt, unlockedAt };
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

function holdingIsAsset(holding: HoldingLike): boolean {
  if (holding.kind === "stock") return holding.quantity > 0;
  return holding.balance > 0;
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

function formatUsd(amount: number): string {
  const rounded = Math.max(0, Math.round(amount));
  return `$${rounded.toLocaleString("en-US")}`;
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

  const hasFirstAsset = facts.holdings.some(holdingIsAsset);
  const tickers = new Set<string>();
  let hasEtf = false;
  let cashBalance = 0;
  let positionCount = 0;

  for (const holding of facts.holdings) {
    if (holding.kind === "broker") {
      const balance = Number.isFinite(holding.balance) ? Math.max(0, holding.balance) : 0;
      cashBalance += balance;
      if (balance > 0) positionCount += 1;
      continue;
    }
    if (holding.quantity <= 0) continue;
    positionCount += 1;
    const symbol = (holding.symbol || "").trim().toUpperCase();
    if (symbol) tickers.add(symbol);
    if (isEtfAsset(symbol, { name: holding.description })) hasEtf = true;
  }

  const tickerCount = tickers.size;
  const hasEquity = tickerCount > 0;
  if (!persist.firstInvestedAt && hasEquity) {
    persist.firstInvestedAt = nowISO;
  }

  const daysInvested = persist.firstInvestedAt ? daysBetween(persist.firstInvestedAt, now) : 0;
  const { cost, value, simple } = portfolioReturn(facts.holdings);
  const years = daysInvested / COMPOUNDER_MIN_DAYS;
  const growth = simple != null ? 1 + simple : null;
  const annualReturn =
    growth != null && years >= 1 && growth > 0 ? Math.pow(growth, 1 / years) - 1 : null;
  const compounderEarned =
    daysInvested >= COMPOUNDER_MIN_DAYS &&
    annualReturn != null &&
    annualReturn > HISTORICAL_ANNUAL_RETURN;

  const wealth = Math.max(0, facts.netWorth, facts.portfolioValue);
  const depositCount = Math.max(0, Math.floor(facts.retirementDeposits));
  const safetyNetValue = Math.max(0, facts.safetyNetValue ?? 0);
  const monthlyExpenses = Math.max(0, facts.monthlyExpenses ?? 0);
  const fortressTarget = monthlyExpenses * SAFETY_NET_STARTER_MONTHS;

  const compounderEval = ((): EvalResult => {
    if (simple == null) {
      return {
        earned: false,
        progress: { current: 0, target: COMPOUNDER_MIN_DAYS, label: "Log equity with a cost basis" },
        metric: "Log equity with a cost basis",
      };
    }
    if (daysInvested < COMPOUNDER_MIN_DAYS) {
      const label = `${daysInvested} / ${COMPOUNDER_MIN_DAYS} days · ${formatPct(simple)} so far`;
      return {
        earned: false,
        progress: { current: daysInvested, target: COMPOUNDER_MIN_DAYS, label },
        metric: label,
      };
    }
    const shown = annualReturn ?? simple;
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
    if (cost <= 0) {
      return booleanProgress(false, "Portfolio is above cost", "Log equities with a cost basis");
    }
    const earned = value > cost;
    const label = `${formatUsd(value)} / ${formatUsd(cost)} cost`;
    return {
      earned,
      progress: { current: Math.min(value, cost), target: cost, label },
      metric: earned ? `Portfolio value reached ${formatUsd(value)}` : label,
    };
  })();

  const doubleDigitEval = ((): EvalResult => {
    if (simple == null) {
      return {
        earned: false,
        progress: { current: 0, target: 10, label: "Log equity with a cost basis" },
        metric: "Log equity with a cost basis",
      };
    }
    const pct = simple * 100;
    const earned = simple >= 0.1;
    const label = `${formatPct(simple)} / +10%`;
    return {
      earned,
      progress: { current: Math.max(0, Math.min(pct, 10)), target: 10, label },
      metric: earned ? `Simple return reached ${formatPct(simple)}` : label,
    };
  })();

  const results: Record<TrophyId, EvalResult> = {
    firstStep: booleanProgress(hasFirstAsset, "First asset logged", "Log your first stock or asset"),
    tickerScout: countProgress(tickerCount, 1, "tickers", `${tickerCount} ${tickerCount === 1 ? "ticker" : "tickers"} held`),
    cashCushion: booleanProgress(
      cashBalance > 0,
      `Cash balance ${formatUsd(cashBalance)}`,
      "Log a brokerage or cash balance"
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
    thousand: wealthProgress(wealth, THOUSAND_MILESTONE),
    trio: countProgress(tickerCount, 3, "tickers", `${tickerCount} tickers held`),
    inTheGreen: greenEval,
    compounder: compounderEval,
    fiveK: wealthProgress(wealth, 5_000),
    fiveTickers: countProgress(tickerCount, 5, "tickers", `${tickerCount} tickers held`),
    indexBeliever: booleanProgress(hasEtf, "ETF position logged", "Own at least one ETF"),
    habitStacker: countProgress(
      depositCount,
      3,
      "deposits",
      `${depositCount} ${depositCount === 1 ? "deposit" : "deposits"} logged`
    ),
    tenK: wealthProgress(wealth, 10_000),
    doubleDigit: doubleDigitEval,
    yearIn: countProgress(daysInvested, COMPOUNDER_MIN_DAYS, "days", `${daysInvested} days invested`),
    eightHoldings: countProgress(positionCount, 8, "positions", `${positionCount} positions held`),
    twentyFiveK: wealthProgress(wealth, 25_000),
    hundredK: wealthProgress(wealth, 100_000),
    fullRoster: countProgress(positionCount, 12, "positions", `${positionCount} positions held`),
    millionPath: wealthProgress(wealth, 1_000_000),
  };

  const newlyUnlockedIds: TrophyId[] = [];
  for (const id of TROPHY_IDS) {
    if (latchUnlock(facts.userId, unlockedAt, id, results[id].earned, nowISO)) {
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
    };
  });

  if (newlyUnlockedIds.length > 0) {
    const unlockedSet = new Set(newlyUnlockedIds);
    publishUnlocks(trophies.filter((trophy) => unlockedSet.has(trophy.id)));
  }

  return trophies;
}
