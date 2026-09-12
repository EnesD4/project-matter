import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  Gift,
  HelpCircle,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Target,
  Undo2,
  X,
} from "lucide-react";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrencyInput, parseCurrency } from "../lib/money";
import { readLocalItem } from "../lib/storage";
import { ageFromBirthDate, applyAgeToBirthDate, clampAge, parseISODate, todayISODate } from "../lib/age";
import {
  computeRetirementTargets,
  K401_MATCH_RATE,
  loadFinancialProfile,
  subscribeFinancialProfile,
} from "../lib/roadmapService";

const EMERALD = "#10B981";
const TARGET_LINE = "#94A3B8";
const FREEDOM_NUMBER = 1_000_000;
const RETIRE_AGE = 65;
const LOOKAHEAD_AGE = 80;
const DEFAULT_RETURN = 8;
const AGE_PRESETS = [18, 21, 25, 30, 35, 40, 50];
const ON_TRACK_TOLERANCE = 0.05;

export const RETIREMENT_UPDATED_EVENT = "matterpro:retirement-updated";

type AccountType = "roth" | "traditional" | "401k" | "hsa";
type SetupStep = 1 | 2 | 3 | 4;

const ACCOUNTS: Array<{
  id: AccountType;
  label: string;
  shortLabel: string;
  benefit: string;
  hint: string;
}> = [
  { id: "roth", label: "Roth IRA", shortLabel: "Roth IRA", benefit: "Tax-free growth & withdrawals", hint: "Pay tax now · withdraw tax-free later" },
  { id: "traditional", label: "Traditional IRA", shortLabel: "Trad IRA", benefit: "Possible deduction now, taxed later", hint: "Possible deduction now · taxed later" },
  { id: "401k", label: "401(k)", shortLabel: "401(k)", benefit: "Pre-tax paycheck deferral, tax-deferred growth", hint: "Employer plan · often with a match" },
  { id: "hsa", label: "HSA", shortLabel: "HSA", benefit: "Triple tax advantage for medical + retirement", hint: "HDHP required · stealth retirement bucket" },
];

const IRA_PROVIDERS: Array<{
  name: string;
  domain: string;
  rothUrl: string;
  traditionalUrl: string;
  hsaUrl: string;
  color: string;
}> = [
  {
    name: "Fidelity",
    domain: "fidelity.com",
    rothUrl: "https://www.fidelity.com/retirement-ira/roth-ira",
    traditionalUrl: "https://www.fidelity.com/retirement-ira/traditional-ira",
    hsaUrl: "https://www.fidelity.com/go/hsa",
    color: "#4B8B3B",
  },
  {
    name: "Vanguard",
    domain: "vanguard.com",
    rothUrl: "https://investor.vanguard.com/accounts-plans/iras/roth-ira",
    traditionalUrl: "https://investor.vanguard.com/accounts-plans/iras/traditional-ira",
    hsaUrl: "https://investor.vanguard.com/accounts-plans/hsa",
    color: "#A02033",
  },
  {
    name: "Schwab",
    domain: "schwab.com",
    rothUrl: "https://www.schwab.com/ira/roth-ira",
    traditionalUrl: "https://www.schwab.com/ira/traditional-ira",
    hsaUrl: "https://www.schwab.com/health-savings-account",
    color: "#00A0DF",
  },
];

type YearPoint = {
  age: number;
  year: number;
  value: number;
  contributed: number;
  interest: number;
};

type ChartPoint = YearPoint & {
  target: number;
  actual: number;
};

type Contribution = {
  id: string;
  amount: number;
  date: string;
};

type StoredPlan = {
  configured: boolean;
  editing?: boolean;
  step?: SetupStep;
  savings: number;
  monthly: number;
  accountType: AccountType;
  annualReturn: number;
  age?: number;
  contributions?: Contribution[];
  startedAt?: string;
};

type TrackStatus = {
  onTrack: boolean;
  goalWealth: number;
  goalAge: number;
  shiftedAge: number;
  catchUp: number;
  thisMonthRemaining: number;
  missedPrior: number;
  message: string;
};

export type RetirementPlannerProps = {
  userId: string;
  age: number | null;
  birthDate?: string | null;
  onAgeChange: (age: number, birthDate: string) => void;
  /** Live retirement balance so the parent can include it in Net Worth. */
  onBalanceChange?: (balance: number) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function monthKeyFromISO(iso: string): string {
  return iso.slice(0, 7);
}

function monthsInclusive(fromISO: string, to = new Date()): number {
  const from = parseISODate(fromISO) ?? to;
  const delta = to.getFullYear() * 12 + to.getMonth() - (from.getFullYear() * 12 + from.getMonth());
  return Math.max(1, delta + 1);
}

function monthsCompleted(fromISO: string, to = new Date()): number {
  return Math.max(0, monthsInclusive(fromISO, to) - 1);
}

function iterateMonthKeys(fromISO: string, to = new Date()): string[] {
  const from = parseISODate(fromISO) ?? to;
  const keys: string[] = [];
  let year = from.getFullYear();
  let month = from.getMonth();
  const endYear = to.getFullYear();
  const endMonth = to.getMonth();
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${pad2(month + 1)}`);
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return keys;
}

function newContributionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseContributions(raw: unknown): Contribution[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Partial<Contribution>;
      const amount = Number(rec.amount);
      const date = typeof rec.date === "string" ? rec.date : "";
      const id = typeof rec.id === "string" ? rec.id : "";
      if (!id || !parseISODate(date) || !Number.isFinite(amount) || amount <= 0) return null;
      return { id, date, amount: Math.round(amount * 100) / 100 };
    })
    .filter((c): c is Contribution => c != null);
}

function contributionsByMonth(contributions: Contribution[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of contributions) {
    const key = monthKeyFromISO(c.date);
    map.set(key, (map.get(key) ?? 0) + c.amount);
  }
  return map;
}

function futureValue(currentSavings: number, monthly: number, annualReturn: number, months: number) {
  if (months <= 0) return currentSavings;
  const r = annualReturn / 100 / 12;
  if (r === 0) return currentSavings + monthly * months;
  const growth = Math.pow(1 + r, months);
  const lump = currentSavings * growth;
  const annuity = monthly * ((growth - 1) / r);
  return lump + annuity;
}

function actualBalanceNow(
  savings: number,
  contributions: Contribution[],
  annualReturn: number,
  startedAt: string,
  now = new Date()
) {
  const byMonth = contributionsByMonth(contributions);
  const r = annualReturn / 100 / 12;
  const keys = iterateMonthKeys(startedAt, now);
  let balance = savings;
  keys.forEach((key, index) => {
    const deposited = byMonth.get(key) ?? 0;
    const isCurrentMonth = index === keys.length - 1;
    if (isCurrentMonth) {
      balance += deposited;
      return;
    }
    balance = r === 0 ? balance + deposited : balance * (1 + r) + deposited;
  });
  return balance;
}

function buildProjection(
  currentAge: number,
  retireAge: number,
  currentSavings: number,
  monthly: number,
  annualReturn: number
): YearPoint[] {
  const years = Math.max(0, retireAge - currentAge);
  const points: YearPoint[] = [];
  for (let y = 0; y <= years; y++) {
    const months = y * 12;
    const value = futureValue(currentSavings, monthly, annualReturn, months);
    const contributed = currentSavings + monthly * months;
    points.push({
      age: currentAge + y,
      year: y,
      value,
      contributed,
      interest: Math.max(0, value - contributed),
    });
  }
  return points;
}

function formatWealth(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = n / 1_000_000;
    const digits = m >= 10 ? 1 : 2;
    return `$${m.toFixed(digits).replace(/\.?0+$/, "")}M`;
  }
  if (abs >= 10_000) return `$${Math.round(n / 1000).toLocaleString("en-US")}k`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatDollars(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatAxisMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

function monthsToTarget(
  target: number,
  currentSavings: number,
  monthly: number,
  annualReturn: number,
  cap = 720
) {
  if (target <= currentSavings) return 0;
  const r = annualReturn / 100 / 12;
  let balance = currentSavings;
  for (let m = 1; m <= cap; m += 1) {
    balance = r === 0 ? balance + monthly : balance * (1 + r) + monthly;
    if (balance >= target) return m;
  }
  return Number.POSITIVE_INFINITY;
}

function firstAgeAtOrAbove(series: YearPoint[], target: number): number | null {
  const hit = series.find((p) => p.value >= target);
  return hit ? hit.age : null;
}

function accountLabel(account: AccountType) {
  return ACCOUNTS.find((item) => item.id === account)?.label ?? "Roth IRA";
}

function isAccountType(value: unknown): value is AccountType {
  return value === "roth" || value === "traditional" || value === "401k" || value === "hsa";
}

function recommendedAccount(age: number): AccountType {
  return age < 45 ? "roth" : "401k";
}

function buildTrackStatus(opts: {
  monthly: number;
  annualReturn: number;
  currentAge: number;
  savings: number;
  contributions: Contribution[];
  startedAt: string;
  expectedNow: number;
  actualNow: number;
}): TrackStatus {
  const { monthly, annualReturn, currentAge, contributions, startedAt, expectedNow, actualNow } = opts;
  const now = new Date();
  const thisKey = monthKeyFromDate(now);
  const byMonth = contributionsByMonth(contributions);
  const thisMonthDeposited = byMonth.get(thisKey) ?? 0;
  const thisMonthRemaining = Math.max(0, monthly - thisMonthDeposited);
  const closed = monthsCompleted(startedAt, now);
  const expectedClosed = monthly * closed;
  const actualClosed = contributions.reduce((sum, c) => {
    return monthKeyFromISO(c.date) === thisKey ? sum : sum + c.amount;
  }, 0);
  const slack = Math.max(1, monthly * ON_TRACK_TOLERANCE);
  const missedPrior = Math.max(0, expectedClosed - actualClosed);
  const onTrack = monthly <= 0 ? true : missedPrior <= slack;

  const idealSeries = buildProjection(currentAge, LOOKAHEAD_AGE, expectedNow, monthly, annualReturn);
  const retirePoint = idealSeries.find((p) => p.age === RETIRE_AGE) ?? idealSeries[idealSeries.length - 1];
  const millionAge = firstAgeAtOrAbove(idealSeries, FREEDOM_NUMBER);
  const goalWealth = millionAge != null ? FREEDOM_NUMBER : retirePoint?.value ?? FREEDOM_NUMBER;
  const goalAge = millionAge ?? RETIRE_AGE;

  const shiftedMonths = monthsToTarget(goalWealth, actualNow, monthly, annualReturn);
  const shiftedAge = Number.isFinite(shiftedMonths)
    ? currentAge + Math.ceil(shiftedMonths / 12)
    : LOOKAHEAD_AGE;
  const catchUp = Math.max(0, Math.round(missedPrior + thisMonthRemaining));

  if (monthly <= 0) {
    return {
      onTrack: true,
      goalWealth,
      goalAge,
      shiftedAge: goalAge,
      catchUp: 0,
      thisMonthRemaining: 0,
      missedPrior: 0,
      message: "Set a monthly contribution to start pacing toward your freedom number.",
    };
  }

  if (onTrack) {
    const ahead = actualNow > expectedNow + slack;
    return {
      onTrack: true,
      goalWealth,
      goalAge,
      shiftedAge: goalAge,
      catchUp: 0,
      thisMonthRemaining,
      missedPrior: 0,
      message: ahead
        ? `You're ahead of plan — on target to hit ${formatWealth(Math.max(goalWealth, actualNow))} by age ${goalAge}!`
        : `You are on target to hit ${formatWealth(goalWealth)} by age ${goalAge}!`,
    };
  }

  return {
    onTrack: false,
    goalWealth,
    goalAge,
    shiftedAge: Math.max(goalAge, shiftedAge),
    catchUp,
    thisMonthRemaining,
    missedPrior,
    message:
      catchUp > 0
        ? `You missed contributions in recent months. Target age shifted to ${Math.max(goalAge, shiftedAge)}. Add ${formatDollars(catchUp)} to get back on track.`
        : `You missed contributions in recent months. Target age shifted to ${Math.max(goalAge, shiftedAge)}.`,
  };
}

function buildInsight(opts: {
  account: AccountType;
  monthly: number;
  annualReturn: number;
  currentAge: number;
  retireAge: number;
  savings: number;
  series: YearPoint[];
  extraSeries: YearPoint[];
}): string {
  const { account, monthly, annualReturn, currentAge, retireAge, savings, series, extraSeries } = opts;
  const final = series[series.length - 1];
  const extraFinal = extraSeries[extraSeries.length - 1];
  if (!final) {
    return "Set your age and contribution to see how compound interest builds your freedom number.";
  }

  if (currentAge >= retireAge) {
    return `You're at or past the standard retirement age of ${retireAge}. Keep this ${accountLabel(account)} invested — compound interest can still work from here.`;
  }

  if (final.value <= 0 && monthly <= 0) {
    return "Start with any monthly amount — even $50 — and watch compound interest do the heavy lifting toward your freedom number.";
  }

  const extraDelta = Math.max(0, (extraFinal?.value ?? 0) - final.value);
  const extraMonthsToSame = monthsToTarget(final.value, savings, monthly + 50, annualReturn);
  const yearsShaved =
    Number.isFinite(extraMonthsToSame)
      ? Math.max(0, Math.round((Math.max(0, retireAge - currentAge) * 12 - extraMonthsToSame) / 12))
      : 0;

  const baseMillionAge = firstAgeAtOrAbove(series, FREEDOM_NUMBER);
  const extraMillionAge = firstAgeAtOrAbove(extraSeries, FREEDOM_NUMBER);
  const millionYearsShaved =
    baseMillionAge != null && extraMillionAge != null ? Math.max(0, baseMillionAge - extraMillionAge) : 0;

  const leadWealth = baseMillionAge != null ? FREEDOM_NUMBER : final.value;
  const leadAge = baseMillionAge ?? retireAge;
  const lead = `At $${Math.round(monthly).toLocaleString("en-US")}/mo with ${annualReturn}% return, you'll reach ${formatWealth(leadWealth)} by age ${leadAge} in your ${accountLabel(account)}.`;

  let boost = "";
  if (baseMillionAge != null && millionYearsShaved >= 1) {
    boost = ` Increasing monthly contributions by just $50 shaves ${millionYearsShaved} ${millionYearsShaved === 1 ? "year" : "years"} off your goal!`;
  } else if (baseMillionAge == null && extraMillionAge != null) {
    boost = ` Increasing monthly contributions by just $50 gets you to your $1M freedom number by age ${extraMillionAge}!`;
  } else if (yearsShaved >= 1) {
    boost = ` Increasing monthly contributions by just $50 shaves ${yearsShaved} ${yearsShaved === 1 ? "year" : "years"} off your goal!`;
  } else if (extraDelta > 0) {
    boost = ` A $50 bump adds ${formatWealth(extraDelta)} more by age ${retireAge} — that's compound interest working overtime.`;
  }

  return `${lead}${boost}`;
}

function resolveCurrentAge(
  age: number | null,
  birthDate?: string | null,
  planAge?: number,
  draftAge?: number
) {
  const fromBirth = birthDate ? ageFromBirthDate(birthDate) : null;
  const candidates = [age, fromBirth, planAge, draftAge];
  for (const value of candidates) {
    if (value != null && Number.isFinite(value) && value > 0) {
      return clampAge(value, 13, 80);
    }
  }
  return null;
}

function targetFreedomAgeFrom(currentAge: number, retireAge = RETIRE_AGE) {
  const yearsRemaining = Math.max(0, retireAge - currentAge);
  return currentAge + yearsRemaining;
}

function WhatIfSimulator({
  currentAge,
  currentSavings,
  baseMonthly,
  baseReturn,
}: {
  currentAge: number;
  currentSavings: number;
  baseMonthly: number;
  baseReturn: number;
}) {
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [annualReturn, setAnnualReturn] = useState(baseReturn);
  const [targetAge, setTargetAge] = useState(() => targetFreedomAgeFrom(currentAge));

  useEffect(() => {
    setAnnualReturn(baseReturn);
  }, [baseReturn]);

  useEffect(() => {
    setTargetAge((prev) => Math.max(currentAge, Math.min(LOOKAHEAD_AGE, prev)));
  }, [currentAge]);

  const freedomAge = targetFreedomAgeFrom(currentAge);
  const clampedTarget = Math.max(currentAge, Math.min(LOOKAHEAD_AGE, targetAge));
  const years = Math.max(0, clampedTarget - currentAge);
  const months = years * 12;
  const monthly = Math.max(0, baseMonthly + extraMonthly);
  const projected = futureValue(currentSavings, monthly, annualReturn, months);
  const baseline = futureValue(currentSavings, baseMonthly, baseReturn, months);
  const delta = projected - baseline;
  const millionMonths = monthsToTarget(FREEDOM_NUMBER, currentSavings, monthly, annualReturn);
  const millionAge = Number.isFinite(millionMonths)
    ? currentAge + Math.ceil(millionMonths / 12)
    : null;

  return (
    <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-[#0A0A0A] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-300/80">
            <SlidersHorizontal size={12} />
            What-If Wealth Simulator
          </p>
          <p className="mt-1 mb-0 text-[12px] font-medium leading-snug text-[#9CA3AF]">
            Play with extra savings and return — your real plan stays unchanged.
          </p>
        </div>
      </div>

      <p className="mt-3 mb-0 text-[11px] font-semibold text-[#94A3B8]">
        Target freedom age {freedomAge}
        {clampedTarget !== freedomAge ? ` · simulating age ${clampedTarget}` : ""}
      </p>
      <p className="mt-1 mb-0 text-3xl font-extrabold tabular-nums tracking-tight text-white">
        {formatWealth(projected)}
      </p>
      <p className="mt-1 mb-0 text-[12px] font-semibold text-emerald-300/90">
        {delta === 0
          ? `Matches your current plan at age ${clampedTarget}`
          : `${delta > 0 ? "+" : ""}${formatWealth(delta)} vs current plan at age ${clampedTarget}`}
      </p>
      {millionAge != null ? (
        <p className="mt-1 mb-0 text-[11px] font-medium text-[#9CA3AF]">
          Hits $1M around age {millionAge}
        </p>
      ) : null}

      <label className="mt-4 block">
        <span className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#94A3B8]">
          Extra monthly
          <span className="tabular-nums text-white">+{formatDollars(extraMonthly)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          step={25}
          value={extraMonthly}
          onChange={(e) => setExtraMonthly(Number(e.target.value))}
          className="mt-1.5 w-full accent-emerald-500"
          aria-label="Extra monthly contribution"
        />
      </label>

      <label className="mt-3 block">
        <span className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#94A3B8]">
          Expected return
          <span className="tabular-nums text-white">{annualReturn}%</span>
        </span>
        <input
          type="range"
          min={4}
          max={12}
          step={0.5}
          value={annualReturn}
          onChange={(e) => setAnnualReturn(Number(e.target.value))}
          className="mt-1.5 w-full accent-emerald-500"
          aria-label="Expected annual return"
        />
      </label>

      <label className="mt-3 block">
        <span className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#94A3B8]">
          Simulate to age
          <span className="tabular-nums text-white">{clampedTarget}</span>
        </span>
        <input
          type="range"
          min={currentAge}
          max={LOOKAHEAD_AGE}
          step={1}
          value={clampedTarget}
          onChange={(e) => setTargetAge(Number(e.target.value))}
          className="mt-1.5 w-full accent-emerald-500"
          aria-label="Simulate to age"
        />
      </label>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border border-[#1F2937] bg-[#0A0A0A] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748B]">Age {point.age}</p>
      <p className="mt-1 text-[12px] font-extrabold tabular-nums text-emerald-300">
        Actual {formatWealth(point.actual)}
      </p>
      <p className="text-[12px] font-bold tabular-nums text-[#94A3B8]">Target {formatWealth(point.target)}</p>
      <p className="mt-1 text-[10px] font-semibold text-[#9CA3AF]">
        You {formatWealth(point.contributed)} · Markets {formatWealth(point.interest)}
      </p>
    </div>
  );
}

function SproutBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/15 ${
        compact ? "px-2 py-0.5" : "px-2.5 py-1"
      }`}
    >
      <Sparkles size={compact ? 11 : 12} className="text-emerald-400" />
      <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-300">Sprout AI</span>
    </div>
  );
}

function storageKey(userId: string) {
  return `sprout_retirement_${userId || "anon"}`;
}

function legacyStorageKey(userId: string) {
  return `matterpro_retirement_${userId || "anon"}`;
}

function defaultPlan(): StoredPlan {
  return {
    configured: false,
    savings: 0,
    monthly: 0,
    accountType: "roth",
    annualReturn: DEFAULT_RETURN,
    contributions: [],
  };
}

function loadPlan(userId: string): StoredPlan {
  try {
    const raw = readLocalItem(storageKey(userId), legacyStorageKey(userId));
    if (!raw) return defaultPlan();
    const parsed = JSON.parse(raw) as Partial<StoredPlan>;
    const accountType: AccountType = isAccountType(parsed.accountType) ? parsed.accountType : "roth";
    const startedAt =
      typeof parsed.startedAt === "string" && parseISODate(parsed.startedAt) ? parsed.startedAt : undefined;
    return {
      configured: Boolean(parsed.configured),
      editing: Boolean(parsed.editing),
      step: parsed.step === 2 || parsed.step === 3 || parsed.step === 4 ? parsed.step : 1,
      savings: Number.isFinite(parsed.savings) ? Math.max(0, Number(parsed.savings)) : 0,
      monthly: Number.isFinite(parsed.monthly) ? Math.max(0, Number(parsed.monthly)) : 0,
      accountType,
      annualReturn:
        Number.isFinite(parsed.annualReturn) && parsed.annualReturn
          ? clamp(Number(parsed.annualReturn), 1, 15)
          : DEFAULT_RETURN,
      age: Number.isFinite(parsed.age) ? clampAge(Number(parsed.age), 13, 80) : undefined,
      contributions: parseContributions(parsed.contributions),
      startedAt,
    };
  } catch {
    return defaultPlan();
  }
}

function writePlan(userId: string, plan: StoredPlan) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(plan));
    window.dispatchEvent(new Event(RETIREMENT_UPDATED_EVENT));
  } catch {
    // ignore quota / private-mode failures
  }
}

export function getRetirementDepositCount(userId: string): number {
  if (!userId) return 0;
  return loadPlan(userId).contributions?.length ?? 0;
}

function MoneyField({
  id,
  label,
  value,
  onChange,
  placeholder = "0",
  suffix,
  autoFocus,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  placeholder?: string;
  suffix?: string;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value === 0 ? "" : formatCurrencyInput(String(value)));

  useEffect(() => {
    if (!focused) setDraft(value === 0 ? "" : formatCurrencyInput(String(Math.round(value))));
  }, [value, focused]);

  return (
    <label htmlFor={id} className="block">
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-black px-3.5 py-3 focus-within:border-emerald-500/50">
        <span className="text-lg font-extrabold text-emerald-400">$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoFocus={autoFocus}
          value={draft}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const parsed = parseCurrency(draft);
            onChange(parsed);
            setDraft(parsed === 0 ? "" : formatCurrencyInput(draft));
          }}
          onChange={(e) => {
            const next = formatCurrencyInput(e.target.value);
            setDraft(next);
            onChange(parseCurrency(next));
          }}
          className="w-full bg-transparent text-xl font-extrabold tabular-nums text-white outline-none placeholder:text-[#334155]"
        />
        {suffix ? <span className="flex-shrink-0 text-[12px] font-bold text-[#64748B]">{suffix}</span> : null}
      </div>
    </label>
  );
}

function AccountPlanSelector({
  value,
  onChange,
}: {
  value: AccountType;
  onChange: (next: AccountType) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = ACCOUNTS.find((account) => account.id === value) ?? ACCOUNTS[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="retirement-plan-list"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3 text-left transition hover:border-emerald-500/35 focus-visible:border-emerald-500/50 focus-visible:outline-none"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#64748B]">
            Select Your Retirement Plan
          </span>
          <span className="mt-0.5 block truncate text-[14px] font-extrabold text-white">
            {selected.label}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-[#64748B] transition ${open ? "rotate-180 text-emerald-300" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          id="retirement-plan-list"
          role="listbox"
          aria-label="Retirement plans"
          className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-[#1F1F1F] bg-[#121212] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
        >
          {ACCOUNTS.map((account) => {
            const active = value === account.id;
            return (
              <li key={account.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(account.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left ${
                    active ? "bg-emerald-500/15 text-white" : "text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <span>
                    <span className="block text-[13px] font-extrabold">{account.label}</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-[#9CA3AF]">{account.hint}</span>
                  </span>
                  {active ? <Check size={14} className="flex-shrink-0 text-emerald-400" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function AccountGuideModal({
  age,
  onClose,
  onChoose,
}: {
  age: number;
  onClose: () => void;
  onChoose: (account: AccountType) => void;
}) {
  const recommended = recommendedAccount(age);
  const rec = ACCOUNTS.find((a) => a.id === recommended) ?? ACCOUNTS[0];
  const young = age < 45;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="account-guide-title">
      <div className="w-full max-w-md rounded-2xl border border-[#1F2937] bg-[#0A0A0A] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-3">
          <SproutBadge />
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#1F1F1F] text-[#9CA3AF] hover:text-white"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <h3 id="account-guide-title" className="mt-3 text-[16px] font-extrabold tracking-tight text-white">
          Which account fits you?
        </h3>
        <ul className="mt-3 space-y-2.5 text-[13px] font-medium leading-relaxed text-[#CBD5E1]">
          <li>
            <span className="font-extrabold text-white">Roth IRA</span> — You contribute after-tax dollars. Growth and qualified withdrawals are tax-free.
          </li>
          <li>
            <span className="font-extrabold text-white">Traditional IRA</span> — You may deduct contributions now and pay tax when you withdraw in retirement.
          </li>
          <li>
            <span className="font-extrabold text-white">401(k)</span> — An employer plan. Money comes out of your paycheck before taxes, and many employers match what you put in.
          </li>
          <li>
            <span className="font-extrabold text-white">HSA</span> — Triple tax advantage if you have an HDHP: pre-tax in, tax-free growth, tax-free medical withdrawals. After 65 it can act like a stealth IRA.
          </li>
        </ul>
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-[13px] font-semibold leading-relaxed text-[#E2E8F0]">
            {young
              ? `At ${age}, Sprout recommends a ${rec.label}: you're likely in a lower tax bracket now, so paying tax today and unlocking decades of tax-free growth is usually the better trade.`
              : `At ${age}, Sprout recommends a ${rec.label} if your employer offers a match — that's an instant return. Pair it with a Roth IRA if you want tax-free withdrawals later.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChoose(recommended)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-extrabold text-[#042F2E]"
        >
          Use {rec.label}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl px-4 py-2 text-[12px] font-bold text-[#9CA3AF] hover:text-white"
        >
          I'll pick myself
        </button>
      </div>
    </div>
  );
}

function ContributionModal({
  monthlyTarget,
  remaining,
  account,
  onClose,
  onSave,
}: {
  monthlyTarget: number;
  remaining: number;
  account: AccountType;
  onClose: () => void;
  onSave: (amount: number) => void;
}) {
  const suggested = remaining > 0 ? remaining : monthlyTarget || 50;
  const [amount, setAmount] = useState(suggested);
  const chips = Array.from(
    new Set(
      [remaining > 0 ? Math.round(remaining) : 0, 50, 100, Math.round(monthlyTarget) || 0].filter((n) => n > 0)
    )
  ).slice(0, 4);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-contribution-title"
    >
      <div className="matter-pop w-full max-w-md rounded-2xl border border-[#1F2937] bg-[#0A0A0A] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-300/80">
              Manual log
            </p>
            <h3 id="add-contribution-title" className="mt-1 text-[16px] font-extrabold tracking-tight text-white">
              Add Manual Contribution
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#1F1F1F] text-[#9CA3AF] hover:text-white"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <p className="mt-2 text-[12px] font-medium leading-relaxed text-[#9CA3AF]">
          Log a deposit to your {accountLabel(account)} if bank linking isn&apos;t active. This tracks pacing in
          Sprout — it does not move money at your provider.
        </p>
        <div className="mt-4">
          <MoneyField
            id="retire-manual-contribution"
            label="Contribution amount"
            value={amount}
            onChange={(next) => setAmount(clamp(next, 0, 100_000))}
          />
        </div>
        {chips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const active = Math.round(amount) === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAmount(chip)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold transition ${
                    active
                      ? "bg-[#10B981] text-[#042F2E]"
                      : "border border-[#1F1F1F] bg-black text-[#9CA3AF] hover:text-white"
                  }`}
                >
                  {chip === Math.round(remaining) && remaining > 0 ? `Remaining ${formatDollars(chip)}` : formatDollars(chip)}
                </button>
              );
            })}
          </div>
        ) : null}
        <button
          type="button"
          disabled={amount <= 0}
          onClick={() => onSave(amount)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-extrabold text-[#042F2E] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} />
          Log {amount > 0 ? formatDollars(amount) : "contribution"}
        </button>
      </div>
    </div>
  );
}

function MonthlyPaymentModal({
  current,
  onClose,
  onSave,
}: {
  current: number;
  onClose: () => void;
  onSave: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(current);

  const save = () => {
    onSave(clamp(amount, 0, 20_000));
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="monthly-payment-title"
      onClick={onClose}
    >
      <form
        className="matter-pop w-full max-w-md rounded-2xl border border-[#1F2937] bg-[#0A0A0A] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-300/80">
              Monthly contribution
            </p>
            <h3 id="monthly-payment-title" className="mt-1 text-[16px] font-extrabold tracking-tight text-white">
              Enter your new monthly payment
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#1F1F1F] text-[#9CA3AF] hover:text-white"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <p className="mt-2 text-[12px] font-medium leading-relaxed text-[#9CA3AF]">
          This updates your target contribution and recalculates the retirement projection immediately.
        </p>
        <div className="mt-4">
          <MoneyField
            id="retire-monthly-payment"
            label="New monthly payment"
            value={amount}
            onChange={(next) => setAmount(clamp(next, 0, 20_000))}
            suffix="/mo"
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-extrabold text-[#042F2E]"
        >
          Save {formatDollars(amount)} / month
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl px-4 py-2 text-[12px] font-bold text-[#9CA3AF] hover:text-white"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}

function ProviderLogo({ domain, color, name }: { domain: string; color: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="grid h-8 w-8 flex-shrink-0 place-items-center overflow-hidden rounded-lg"
      style={{ background: `${color}22`, color }}
    >
      {failed ? (
        <span className="text-[10px] font-extrabold">{name.slice(0, 1)}</span>
      ) : (
        <img
          src={`https://www.google.com/s2/favicons?sz=64&domain=${domain}`}
          alt=""
          width={18}
          height={18}
          className="h-[18px] w-[18px] rounded-sm object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function providerHref(account: AccountType, provider: (typeof IRA_PROVIDERS)[number]): string {
  if (account === "traditional") return provider.traditionalUrl;
  if (account === "hsa") return provider.hsaUrl;
  return provider.rothUrl;
}

function providerCta(account: AccountType, providerName: string): string {
  if (account === "traditional") return `Open Traditional IRA on ${providerName}`;
  if (account === "hsa") return `Open HSA on ${providerName}`;
  if (account === "401k") return `Open Roth IRA on ${providerName}`;
  return `Open Roth IRA on ${providerName}`;
}

const PAYROLL_PCTS = [3, 6, 10, 15];

function formatPayrollPct(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function inferredPayIncome(monthlyIncome: number, matchCap: number): number {
  if (monthlyIncome > 0) return monthlyIncome;
  if (matchCap > 0) return matchCap / K401_MATCH_RATE;
  return 0;
}

function K401MatchCard({
  monthly,
  matchCap,
  monthlyIncome = 0,
  onPayrollPctChange,
}: {
  monthly: number;
  matchCap: number;
  monthlyIncome?: number;
  onPayrollPctChange?: (pct: number) => void;
}) {
  const income = inferredPayIncome(monthlyIncome, matchCap);
  const usingExample = monthly <= 0;
  const payrollPct = income > 0 && monthly > 0 ? Math.round((monthly / income) * 1000) / 10 : usingExample ? 6 : 0;
  const yours = monthly > 0 ? Math.round(monthly) : income > 0 ? Math.round(income * K401_MATCH_RATE) : 150;
  const cap = matchCap > 0 ? Math.round(matchCap) : income > 0 ? Math.round(income * K401_MATCH_RATE) : yours;
  const employer = Math.min(yours, cap);
  const total = yours + employer;
  const matchPct = income > 0 && cap > 0 ? Math.round((cap / income) * 1000) / 10 : 6;
  const capturingMatch = !usingExample && yours >= cap && cap > 0;

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.08] to-[#0A0A0A]">
      <div className="flex items-start gap-3 border-b border-white/5 px-3.5 py-3">
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-300">
          <Banknote size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[12px] font-extrabold text-white">Pre-Tax Payroll %</p>
          <p className="mt-0.5 mb-0 text-[11px] font-medium leading-snug text-[#9CA3AF]">
            Set with HR — deducted before your paycheck hits the bank.
          </p>
        </div>
        <p className="m-0 flex-shrink-0 text-2xl font-extrabold tabular-nums tracking-tight text-white">
          {formatPayrollPct(payrollPct)}%
        </p>
      </div>

      {onPayrollPctChange && income > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3.5 pt-3">
          {PAYROLL_PCTS.map((preset) => {
            const active = Math.abs(payrollPct - preset) < 0.35;
            const isMatch = Math.abs(preset - matchPct) < 0.35;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onPayrollPctChange(preset)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                  active
                    ? "bg-emerald-500 text-[#042F2E]"
                    : "border border-[#1F1F1F] bg-black/50 text-[#9CA3AF]"
                }`}
              >
                {preset}%{isMatch ? " match" : ""}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-200">
            <Gift size={11} />
            Free Money
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/80">
            {capturingMatch ? "Match captured" : "1:1 employer match"}
          </span>
        </div>
        <p className="mt-2 mb-0 text-[11px] font-medium leading-snug text-[#CBD5E1]">
          {cap > 0
            ? `Your company matches 1:1 up to ${formatPayrollPct(matchPct)}% (${formatDollars(cap)}/mo).`
            : "Your company matches 1:1 up to the plan limit."}
          {usingExample ? " Example shown until you set a payroll %." : ""}
        </p>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1">
          <div className="rounded-xl border border-[#1F1F1F] bg-black/50 px-2 py-2 text-center">
            <p className="m-0 text-[9px] font-extrabold uppercase tracking-wide text-[#64748B]">You</p>
            <p className="mt-0.5 mb-0 text-[13px] font-extrabold tabular-nums text-white">{formatDollars(yours)}</p>
          </div>
          <ArrowRight size={14} className="text-emerald-400" aria-hidden />
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-2 py-2 text-center">
            <p className="m-0 text-[9px] font-extrabold uppercase tracking-wide text-amber-200/80">Employer</p>
            <p className="mt-0.5 mb-0 text-[13px] font-extrabold tabular-nums text-amber-200">
              {formatDollars(employer)}
            </p>
          </div>
          <ArrowRight size={14} className="text-emerald-400" aria-hidden />
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-2 py-2 text-center">
            <p className="m-0 text-[9px] font-extrabold uppercase tracking-wide text-emerald-300/80">Total</p>
            <p className="mt-0.5 mb-0 text-[13px] font-extrabold tabular-nums text-emerald-300">
              {formatDollars(total)}
            </p>
          </div>
        </div>
        <p className="mt-2 mb-0 text-center text-[11px] font-semibold leading-snug text-[#94A3B8]">
          You defer {formatDollars(yours)} → Employer adds {formatDollars(employer)} → Total {formatDollars(total)}
        </p>
      </div>
    </div>
  );
}

function ProviderOnboarding({ account }: { account: AccountType }) {
  const steps =
    account === "hsa"
      ? [
          "Confirm you're on a High-Deductible Health Plan (HDHP) — that's required to open an HSA.",
          "Open an HSA at Fidelity, Schwab, or your employer's administrator — about 10 minutes.",
          "Keep a small cash cushion for medical bills, then invest the rest in a total-market or target-date fund.",
          "After 65, leftover HSA dollars can be withdrawn like a Traditional IRA. Log deposits here to stay on pace.",
        ]
      : account === "401k"
        ? [
            "Ask HR or open your benefits portal and enroll in the 401(k) — most plans take 5–10 minutes.",
            "Contribute enough to capture the full employer match. That's an instant return.",
            "If you're unsure what to buy, choose the target-date fund closest to age 65.",
            "No 401(k) at work? Open a Roth IRA with Fidelity or Vanguard below, then log deposits here.",
          ]
        : [
            "Create a free account at Fidelity, Vanguard, or Schwab — about 5 minutes with your SSN and a bank.",
            `Open a ${accountLabel(account)}. Roth is usually best if you're earlier in your career.`,
            "Fund it (even $50), pick a target-date or total-market index fund, then log the deposit here.",
            "Repeat monthly. Consistency is what puts the actual trend on top of the target line.",
          ];

  const headline =
    account === "hsa"
      ? "Don't have an HSA yet?"
      : account === "401k"
        ? "Don't have a 401(k) yet?"
        : `Don't have a ${accountLabel(account)} yet?`;

  return (
    <div className="mt-4 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-300/80">Account onboarding</p>
      <h3 className="mt-1 text-[15px] font-extrabold tracking-tight text-white">{headline}</h3>
      <p className="mt-1 text-[12px] font-medium leading-relaxed text-[#9CA3AF]">
        Sprout tracks the plan. Your provider holds the money. Set the account up once, then come back and log
        deposits.
      </p>
      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-2.5 text-[12px] font-medium leading-relaxed text-[#CBD5E1]">
            <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[10px] font-extrabold text-emerald-300">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 space-y-2">
        {IRA_PROVIDERS.map((provider) => (
          <a
            key={provider.name}
            href={providerHref(account, provider)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-[#1F1F1F] bg-black px-3 py-2.5 transition hover:border-emerald-500/35"
          >
            <ProviderLogo domain={provider.domain} color={provider.color} name={provider.name} />
            <span className="min-w-0 flex-1 text-[13px] font-extrabold text-white">
              {providerCta(account, provider.name)}
            </span>
            <ExternalLink size={14} className="flex-shrink-0 text-[#64748B]" />
          </a>
        ))}
      </div>
    </div>
  );
}

export default function RetirementPlanner({
  userId,
  age,
  birthDate,
  onAgeChange,
  onBalanceChange,
}: RetirementPlannerProps) {
  const [plan, setPlan] = useState<StoredPlan>(() => loadPlan(userId));
  const [editing, setEditing] = useState(() => {
    const stored = loadPlan(userId);
    return stored.editing || !stored.configured;
  });
  const [step, setStep] = useState<SetupStep>(() => loadPlan(userId).step ?? 1);
  const [draftAge, setDraftAge] = useState(() => (age != null ? clampAge(age) : 0));
  const [ageText, setAgeText] = useState(() => (age != null ? String(clampAge(age)) : ""));
  const [savings, setSavings] = useState(() => loadPlan(userId).savings);
  const [monthly, setMonthly] = useState(() => loadPlan(userId).monthly);
  const [accountType, setAccountType] = useState<AccountType>(() => loadPlan(userId).accountType);
  const [guideOpen, setGuideOpen] = useState(false);
  const [contributeOpen, setContributeOpen] = useState(false);
  const [monthlyEditOpen, setMonthlyEditOpen] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [seededFromBudget, setSeededFromBudget] = useState(false);
  const [budgetTick, setBudgetTick] = useState(0);

  const budgetTargets = useMemo(() => {
    const profile = loadFinancialProfile(userId);
    if (!profile) return null;
    return computeRetirementTargets(profile.monthlyIncome, profile.monthlyEssentialExpenses);
  }, [userId, budgetTick]);

  useEffect(() => subscribeFinancialProfile(() => setBudgetTick((tick) => tick + 1)), []);

  useEffect(() => {
    if (age == null) return;
    const next = clampAge(age);
    setDraftAge(next);
    setAgeText(String(next));
  }, [age]);

  useEffect(() => {
    if (!plan.configured || plan.startedAt) return;
    setPlan((prev) => (prev.startedAt ? prev : { ...prev, startedAt: todayISODate() }));
  }, [plan.configured, plan.startedAt]);

  useEffect(() => {
    writePlan(userId, {
      configured: plan.configured,
      editing,
      step,
      savings: editing ? savings : plan.savings,
      monthly: editing ? monthly : plan.monthly,
      accountType: editing ? accountType : plan.accountType,
      annualReturn: plan.annualReturn || DEFAULT_RETURN,
      age: (age ?? draftAge) || undefined,
      contributions: plan.contributions ?? [],
      startedAt: plan.startedAt,
    });
  }, [
    userId,
    plan.configured,
    plan.savings,
    plan.monthly,
    plan.accountType,
    plan.annualReturn,
    plan.contributions,
    plan.startedAt,
    editing,
    step,
    savings,
    monthly,
    accountType,
    age,
    draftAge,
  ]);

  const userCurrentAge = resolveCurrentAge(age, birthDate, plan.age, draftAge) ?? clampAge(draftAge || 0, 13, 80);
  const userRetirementAge = RETIRE_AGE;
  const yearsLeft = userRetirementAge - userCurrentAge;
  const yearsToFreedom = Math.max(0, yearsLeft);
  const targetFreedomAge = userCurrentAge + yearsToFreedom;
  const currentAge = userCurrentAge;
  const annualReturn = plan.annualReturn || DEFAULT_RETURN;
  const contributions = plan.contributions ?? [];
  const startedAt = plan.startedAt ?? todayISODate();
  const thisMonthKey = monthKeyFromDate(new Date());
  const thisMonthDeposited = contributions.reduce(
    (sum, c) => (monthKeyFromISO(c.date) === thisMonthKey ? sum + c.amount : sum),
    0
  );
  const thisMonthCount = contributions.filter((c) => monthKeyFromISO(c.date) === thisMonthKey).length;
  const thisMonthRemaining = Math.max(0, plan.monthly - thisMonthDeposited);
  const monthProgress = plan.monthly > 0 ? clamp((thisMonthDeposited / plan.monthly) * 100, 0, 100) : 0;
  const lastContribution = contributions[contributions.length - 1];

  const closedMonths = monthsCompleted(startedAt);
  const expectedNow =
    futureValue(plan.savings, plan.monthly, annualReturn, closedMonths) + plan.monthly;
  const actualNow = actualBalanceNow(plan.savings, contributions, annualReturn, startedAt);

  useEffect(() => {
    onBalanceChange?.(plan.configured ? actualNow : 0);
  }, [actualNow, onBalanceChange, plan.configured]);

  const targetSeries = useMemo(
    () => buildProjection(currentAge, RETIRE_AGE, expectedNow, plan.monthly, annualReturn),
    [currentAge, expectedNow, plan.monthly, annualReturn]
  );

  const actualSeries = useMemo(
    () => buildProjection(currentAge, RETIRE_AGE, actualNow, plan.monthly, annualReturn),
    [currentAge, actualNow, plan.monthly, annualReturn]
  );

  const extraSeries = useMemo(
    () => buildProjection(currentAge, RETIRE_AGE, actualNow, plan.monthly + 50, annualReturn),
    [currentAge, actualNow, plan.monthly, annualReturn]
  );

  const chartData = useMemo<ChartPoint[]>(
    () =>
      targetSeries.map((point, i) => {
        const actualPoint = actualSeries[i];
        return {
          ...point,
          target: point.value,
          actual: actualPoint?.value ?? point.value,
          contributed: actualPoint?.contributed ?? point.contributed,
          interest: actualPoint?.interest ?? point.interest,
        };
      }),
    [targetSeries, actualSeries]
  );

  const final = actualSeries[actualSeries.length - 1];
  const totalWealth = final?.value ?? 0;
  const totalContributed = final?.contributed ?? 0;
  const totalInterest = final?.interest ?? 0;
  const contributedPct = totalWealth > 0 ? clamp((totalContributed / totalWealth) * 100, 0, 100) : 100;
  const growthPct = 100 - contributedPct;

  const xTicks = useMemo(() => {
    if (chartData.length <= 1) return chartData.map((p) => p.age);
    const mid = chartData[Math.floor(chartData.length / 2)]?.age;
    const ticks = [chartData[0].age, mid, chartData[chartData.length - 1].age].filter(
      (v, i, arr): v is number => v != null && arr.indexOf(v) === i
    );
    return ticks;
  }, [chartData]);

  const yDomain = useMemo(() => {
    const max = Math.max(...chartData.flatMap((p) => [p.target, p.actual]), 1);
    return [0, max * 1.08] as [number, number];
  }, [chartData]);

  const track = useMemo(
    () =>
      buildTrackStatus({
        monthly: plan.monthly,
        annualReturn,
        currentAge,
        savings: plan.savings,
        contributions,
        startedAt,
        expectedNow,
        actualNow,
      }),
    [plan.monthly, plan.savings, annualReturn, currentAge, contributions, startedAt, expectedNow, actualNow]
  );

  const insight = useMemo(
    () =>
      buildInsight({
        account: plan.accountType,
        monthly: plan.monthly,
        annualReturn,
        currentAge,
        retireAge: RETIRE_AGE,
        savings: actualNow,
        series: actualSeries,
        extraSeries,
      }),
    [plan.accountType, plan.monthly, annualReturn, currentAge, actualNow, actualSeries, extraSeries]
  );

  const nudge = useMemo(() => {
    if (plan.accountType === "401k") {
      if (!track.onTrack) {
        return `You're behind the target trend. Ask HR to raise your pre-tax payroll %. ${insight}`;
      }
      return `${track.message} ${insight}`;
    }
    if (!track.onTrack) {
      const catchUp =
        track.catchUp > 0
          ? ` Add ${formatDollars(track.catchUp)} this month to pull your freedom age back toward ${track.goalAge}.`
          : "";
      return `You're behind the target trend.${catchUp} ${insight}`;
    }
    if (track.thisMonthRemaining > 0 && plan.monthly > 0) {
      return `${track.message} Deposit ${formatDollars(track.thisMonthRemaining)} more this month to stay on pace.`;
    }
    return `${track.message} ${insight}`;
  }, [track, insight, plan.monthly, plan.accountType]);

  const commitAgeToProfile = (nextAge: number) => {
    const clamped = clampAge(nextAge);
    setDraftAge(clamped);
    setAgeText(String(clamped));
    onAgeChange(clamped, applyAgeToBirthDate(clamped, birthDate));
  };

  const goNext = () => {
    setStepError(null);
    if (step === 1) {
      const parsed = Number(ageText);
      if (!Number.isFinite(parsed) || ageText.trim() === "") {
        setStepError("Enter your age to continue.");
        return;
      }
      commitAgeToProfile(parsed);
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!seededFromBudget && monthly <= 0 && budgetTargets && budgetTargets.totalMonthly > 0) {
        setMonthly(budgetTargets.totalMonthly);
        setAccountType(budgetTargets.k401Monthly >= budgetTargets.rothMonthly ? "401k" : "roth");
        setSeededFromBudget(true);
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      setStep(4);
      return;
    }
    const nextPlan: StoredPlan = {
      configured: true,
      savings: Math.max(0, savings),
      monthly: Math.max(0, monthly),
      accountType,
      annualReturn: DEFAULT_RETURN,
      age: clampAge(Number(ageText) || draftAge || age || 0),
      contributions: plan.contributions ?? [],
      startedAt: plan.startedAt ?? todayISODate(),
    };
    writePlan(userId, nextPlan);
    setPlan(nextPlan);
    setEditing(false);
  };

  const goBack = () => {
    setStepError(null);
    if (step > 1) setStep((step - 1) as SetupStep);
  };

  const startRecalculate = () => {
    setSavings(plan.savings);
    setMonthly(plan.monthly);
    setAccountType(plan.accountType);
    setStep(1);
    setStepError(null);
    setEditing(true);
  };

  const switchAccount = (next: AccountType) => {
    setAccountType(next);
    setPlan((prev) => ({ ...prev, accountType: next }));
  };

  const commitMonthly = (next: number) => {
    const value = clamp(next, 0, 20_000);
    setMonthly(value);
    setPlan((prev) => ({ ...prev, monthly: value }));
  };

  const addContribution = (amount: number) => {
    const rounded = Math.round(Math.max(0, amount) * 100) / 100;
    if (rounded <= 0) return;
    const next: Contribution = {
      id: newContributionId(),
      amount: rounded,
      date: todayISODate(),
    };
    setPlan((prev) => ({
      ...prev,
      contributions: [...(prev.contributions ?? []), next],
    }));
    setContributeOpen(false);
  };

  const undoLastContribution = () => {
    if (!lastContribution) return;
    setPlan((prev) => ({
      ...prev,
      contributions: (prev.contributions ?? []).filter((c) => c.id !== lastContribution.id),
    }));
  };

  const showSetup = editing || !plan.configured;

  return (
    <article
      className="rounded-2xl border border-[#1F2937] bg-[#000000] p-4 sm:p-5"
      aria-label="Retirement tracker"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold leading-snug tracking-tight text-white">
            Retirement Tracker
          </h2>
          <p className="mt-1 text-[12px] font-medium italic leading-snug text-[#9CA3AF]">
            {showSetup
              ? "Sprout AI will set this up with you in four quick questions"
              : "Live pacing toward your freedom number"}
          </p>
        </div>
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
          <Landmark size={18} />
        </span>
      </div>

      {showSetup ? (
        <div key={step} className="matter-pop mt-4 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-4">
          <div className="flex items-center justify-between gap-3">
            <SproutBadge />
            <span className="text-[11px] font-extrabold tabular-nums text-[#64748B]">
              {step}/4
            </span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#121212]" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[#10B981] transition-[width] duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>

          {step === 1 ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-300/80">
                Step 1
              </p>
              <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-white">How old are you?</h3>
              <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
                We'll lock retirement age at 65 and save this to your profile.
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-black px-3.5 py-3 focus-within:border-emerald-500/50">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Your age"
                  value={ageText}
                  placeholder="Age"
                  onChange={(e) => setAgeText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  className="w-full bg-transparent text-xl font-extrabold tabular-nums text-white outline-none placeholder:text-[#334155]"
                />
                <span className="text-[12px] font-bold text-[#64748B]">years</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {AGE_PRESETS.map((preset) => {
                  const active = ageText === String(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAgeText(String(preset))}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold transition ${
                        active
                          ? "bg-[#10B981] text-[#042F2E]"
                          : "border border-[#1F1F1F] bg-black text-[#9CA3AF] hover:text-white"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-300/80">
                Step 2
              </p>
              <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-white">
                How much savings do you have right now for retirement?
              </h3>
              <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">Zero is a perfectly honest starting point.</p>
              <div className="mt-4">
                <MoneyField
                  id="retire-setup-savings"
                  label="Current retirement savings"
                  value={savings}
                  onChange={(next) => setSavings(clamp(next, 0, 5_000_000))}
                />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-300/80">
                Step 3
              </p>
              <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-white">
                How much can you comfortably contribute monthly?
              </h3>
              <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
                {budgetTargets && budgetTargets.totalMonthly > 0
                  ? `Suggested from your onboarding budget: ${formatDollars(budgetTargets.k401Monthly)} to 401(k) + ${formatDollars(budgetTargets.rothMonthly)} to Roth IRA.`
                  : "Consistency beats size. You can change this later."}
              </p>
              <div className="mt-4">
                <MoneyField
                  id="retire-setup-monthly"
                  label="Monthly contribution"
                  value={monthly}
                  onChange={(next) => setMonthly(clamp(next, 0, 20_000))}
                  suffix="/mo"
                />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-300/80">
                Step 4
              </p>
              <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-white">
                Which account type fits your strategy?
              </h3>
              <div className="mt-3 space-y-2">
                {ACCOUNTS.map((account) => {
                  const active = accountType === account.id;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setAccountType(account.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                        active
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-[#1F1F1F] bg-black hover:border-[#2A2A2A]"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border ${
                          active ? "border-emerald-400 bg-emerald-400" : "border-[#334155]"
                        }`}
                      >
                        {active ? <span className="h-1.5 w-1.5 rounded-full bg-[#042F2E]" /> : null}
                      </span>
                      <span>
                        <span className="block text-[14px] font-extrabold text-white">{account.label}</span>
                        <span className="mt-0.5 block text-[12px] font-medium text-[#9CA3AF]">{account.hint}</span>
                      </span>
                    </button>
                  );
                })}
                {accountType === "401k" ? (
                  <K401MatchCard
                    monthly={monthly}
                    matchCap={
                      budgetTargets?.k401Monthly ||
                      Math.round((budgetTargets?.monthlyIncome ?? 0) * K401_MATCH_RATE)
                    }
                    monthlyIncome={budgetTargets?.monthlyIncome ?? 0}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  className="flex w-full items-start gap-3 rounded-xl border border-dashed border-emerald-500/35 bg-emerald-500/5 px-3.5 py-3 text-left hover:bg-emerald-500/10"
                >
                  <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center text-emerald-400">
                    <HelpCircle size={16} />
                  </span>
                  <span>
                    <span className="block text-[14px] font-extrabold text-white">I&apos;m not sure (Guide me)</span>
                    <span className="mt-0.5 block text-[12px] font-medium text-[#9CA3AF]">
                      Sprout AI will explain the difference and recommend one
                    </span>
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          {stepError ? <p className="mt-3 text-[12px] font-semibold text-rose-300">{stepError}</p> : null}

          <div className="mt-4 flex items-center gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={goBack}
                className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-[#1F1F1F] text-[#E2E8F0]"
                aria-label="Go back"
              >
                <ChevronLeft size={18} />
              </button>
            ) : plan.configured ? (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-[#1F1F1F] text-[#E2E8F0]"
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={goNext}
              className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 text-sm font-extrabold text-[#042F2E]"
            >
              {step === 4 ? (
                <>
                  <Sparkles size={16} />
                  See my tracker
                </>
              ) : (
                "Continue"
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`mt-4 rounded-2xl border px-3.5 py-3 ${
              track.onTrack
                ? "border-emerald-500/35 bg-emerald-500/10"
                : "border-amber-400/35 bg-amber-400/10"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${
                  track.onTrack
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-400/20 text-amber-200"
                }`}
              >
                {track.onTrack ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {track.onTrack ? "On Track" : "Behind Schedule"}
              </span>
              <SproutBadge compact />
            </div>
            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#E2E8F0]">{track.message}</p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3">
              <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">
                <Calendar size={11} className="text-emerald-400" />
                Current Age
              </span>
              <p className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight text-white">
                {currentAge}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-[#64748B]">From your profile</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3">
              <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-300/80">
                <Target size={11} className="text-emerald-400" />
                Retirement Age
              </span>
              <p className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight text-emerald-300">
                {userRetirementAge}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-emerald-300/70">
                {`Years Left: ${userRetirementAge - userCurrentAge}`}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <AccountPlanSelector value={plan.accountType} onChange={switchAccount} />
            {plan.accountType === "401k" ? (
              <K401MatchCard
                monthly={plan.monthly}
                matchCap={
                  budgetTargets?.k401Monthly ||
                  Math.round((budgetTargets?.monthlyIncome ?? 0) * K401_MATCH_RATE)
                }
                monthlyIncome={budgetTargets?.monthlyIncome ?? 0}
                onPayrollPctChange={(pct) => {
                  const income = inferredPayIncome(
                    budgetTargets?.monthlyIncome ?? 0,
                    budgetTargets?.k401Monthly ||
                      Math.round((budgetTargets?.monthlyIncome ?? 0) * K401_MATCH_RATE)
                  );
                  if (income > 0) commitMonthly(Math.round(income * (pct / 100)));
                }}
              />
            ) : null}
          </div>

          {plan.accountType !== "401k" ? (
          <div className="mt-4 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-4 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#64748B]">
              Monthly Investment Contribution
            </p>
            <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
              You can change this anytime you want
            </p>
            <button
              type="button"
              onClick={() => setMonthlyEditOpen(true)}
              className="mx-auto mt-3 flex w-fit items-center justify-center gap-2 rounded-full border border-[#1F1F1F] bg-black px-3.5 py-2 text-[13px] font-extrabold transition hover:border-emerald-500/40 hover:bg-emerald-500/[0.04] focus-visible:border-emerald-500/60 focus-visible:outline-none"
              aria-haspopup="dialog"
              aria-expanded={monthlyEditOpen}
              aria-label={
                plan.monthly > 0
                  ? `Edit monthly contribution, currently ${formatDollars(plan.monthly)} per month`
                  : "Edit monthly contribution"
              }
            >
              {plan.monthly > 0 ? (
                <>
                  <span className="tabular-nums tracking-tight text-white">{formatDollars(plan.monthly)}</span>
                  <span className="font-bold text-[#64748B]">/ month</span>
                </>
              ) : (
                <span className="text-white">Edit Contribution</span>
              )}
              <Pencil size={13} className="text-emerald-300" aria-hidden="true" />
            </button>
          </div>
          ) : null}

          {plan.accountType !== "401k" ? (
          <div className="mt-3 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#64748B]">
                Monthly Retirement Target
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-extrabold tabular-nums text-emerald-300">{Math.round(monthProgress)}%</span>
                {lastContribution ? (
                  <button
                    type="button"
                    onClick={undoLastContribution}
                    className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-[#1F1F1F] text-[#9CA3AF] hover:text-white"
                    aria-label="Undo last contribution"
                  >
                    <Undo2 size={14} />
                  </button>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setContributeOpen(true)}
              className="mt-3 w-full rounded-xl border border-[#1F1F1F] bg-black px-3.5 py-3 text-left transition hover:border-emerald-500/40 hover:bg-emerald-500/[0.04] focus-visible:border-emerald-500/60 focus-visible:outline-none"
              aria-label={`Log a manual contribution. Monthly target ${formatDollars(plan.monthly)}.`}
            >
              <div className="flex items-end justify-between gap-3">
                <p className="text-3xl font-extrabold tabular-nums tracking-tight text-white">
                  {formatDollars(plan.monthly)}
                  <span className="ml-1 text-[12px] font-bold text-[#64748B]">/mo</span>
                </p>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                  <Plus size={12} />
                  Tap to log
                </span>
              </div>
              <p className="mt-1 text-[12px] font-semibold text-[#9CA3AF]">
                Deposited so far: {formatDollars(thisMonthDeposited)}
                {thisMonthCount > 0
                  ? ` · ${thisMonthCount} ${thisMonthCount === 1 ? "deposit" : "deposits"}`
                  : ""}
              </p>
            </button>
            <p className="mt-2 text-[11px] font-medium text-[#9CA3AF]">
              {thisMonthRemaining > 0
                ? `${formatDollars(thisMonthRemaining)} left to stay on this month's pace`
                : plan.monthly > 0
                  ? "Monthly target hit — nice work."
                  : "Set a monthly contribution above to start pacing."}
            </p>
          </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-4">
            <p className="text-[12px] font-semibold leading-snug text-[#9CA3AF]">
              Estimated Wealth at Age {targetFreedomAge}
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-white tabular-nums sm:text-5xl">
              {formatWealth(totalWealth)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[12px] font-bold leading-snug text-[#94A3B8]">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#64748B]" aria-hidden="true" />
                  Principal (You Contribute)
                </p>
                <p className="mt-0.5 text-[15px] font-extrabold tabular-nums tracking-tight text-white sm:text-base">
                  {formatWealth(totalContributed)}
                </p>
              </div>
              <div className="text-right">
                <p className="inline-flex items-center justify-end gap-1.5 text-[12px] font-bold leading-snug text-emerald-300/90">
                  Compound Growth
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#10B981]" aria-hidden="true" />
                </p>
                <p className="mt-0.5 text-[15px] font-extrabold tabular-nums tracking-tight text-emerald-300 sm:text-base">
                  +{formatWealth(totalInterest)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-wide text-[#9CA3AF]">
                <span>{Math.round(contributedPct)}% you contribute</span>
                <span className="text-emerald-300">{Math.round(growthPct)}% compound</span>
              </div>
              <div
                className="flex h-2.5 overflow-hidden rounded-full bg-[#1F1F1F]"
                role="img"
                aria-label={`Principal ${Math.round(contributedPct)} percent, compound growth ${Math.round(growthPct)} percent`}
              >
                <div
                  className="h-full bg-[#334155] transition-[width] duration-300"
                  style={{ width: `${contributedPct}%` }}
                />
                <div
                  className="h-full bg-[#10B981] transition-[width] duration-300"
                  style={{ width: `${growthPct}%` }}
                />
              </div>
            </div>

            <div className="mt-4 border-t border-[#1F1F1F] pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#9CA3AF]">
                  Portfolio growth by age
                </p>
                <div className="flex items-center gap-3 text-[10px] font-bold text-[#9CA3AF]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-px w-3.5 border-t-[1.5px] border-dashed border-[#94A3B8]" />
                    Target
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-300">
                    <span className="h-[2px] w-3.5 rounded-full bg-[#10B981]" />
                    Actual
                  </span>
                </div>
              </div>
              <div className="h-44 -mx-1 sm:h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="retirementAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={EMERALD} stopOpacity={0.38} />
                      <stop offset="100%" stopColor={EMERALD} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis
                    domain={yDomain}
                    width={46}
                    tickFormatter={formatAxisMoney}
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickCount={4}
                  />
                  <XAxis
                    dataKey="age"
                    ticks={xTicks}
                    tickFormatter={(tickAge) => `${tickAge}`}
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <Tooltip
                    cursor={{ stroke: "#FFFFFF", strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.4 }}
                    content={(props) => (
                      <ChartTooltip
                        active={props.active}
                        payload={props.payload as ReadonlyArray<{ payload?: ChartPoint }> | undefined}
                      />
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="Target trend"
                    stroke={TARGET_LINE}
                    strokeWidth={2}
                    strokeDasharray="7 5"
                    dot={false}
                    isAnimationActive
                    animationDuration={400}
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    name="Actual trend"
                    stroke={EMERALD}
                    strokeWidth={2.5}
                    fill="url(#retirementAreaGradient)"
                    isAnimationActive
                    animationDuration={400}
                    activeDot={{ r: 5, fill: EMERALD, stroke: "#000000", strokeWidth: 2 }}
                  />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <WhatIfSimulator
            currentAge={currentAge}
            currentSavings={actualNow}
            baseMonthly={plan.monthly}
            baseReturn={annualReturn}
          />

          <div className="mt-4 rounded-2xl border border-[#10B981]/35 bg-[#0A0A0A] p-3.5">
            <div className="mb-2">
              <SproutBadge />
            </div>
            <p className="text-[13px] font-semibold leading-relaxed text-[#E2E8F0]">{nudge}</p>
          </div>

          {plan.accountType !== "401k" ? <ProviderOnboarding account={plan.accountType} /> : null}

          <button
            type="button"
            onClick={startRecalculate}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#1F1F1F] bg-transparent px-3 py-2.5 text-[12px] font-bold text-[#9CA3AF] transition hover:border-[#2A2A2A] hover:text-white"
          >
            <RefreshCw size={13} />
            Recalculate / Change Inputs
          </button>
        </>
      )}

      {guideOpen ? (
        <AccountGuideModal
          age={currentAge || draftAge || 22}
          onClose={() => setGuideOpen(false)}
          onChoose={(next) => {
            setAccountType(next);
            setGuideOpen(false);
          }}
        />
      ) : null}

      {contributeOpen ? (
        <ContributionModal
          monthlyTarget={plan.monthly}
          remaining={thisMonthRemaining}
          account={plan.accountType}
          onClose={() => setContributeOpen(false)}
          onSave={addContribution}
        />
      ) : null}

      {monthlyEditOpen ? (
        <MonthlyPaymentModal
          current={plan.monthly}
          onClose={() => setMonthlyEditOpen(false)}
          onSave={(next) => {
            commitMonthly(next);
            setMonthlyEditOpen(false);
          }}
        />
      ) : null}
    </article>
  );
}
