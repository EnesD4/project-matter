import {
  Banknote,
  BookOpen,
  Check,
  ChevronRight,
  Coins,
  Flame,
  Landmark,
  Lock,
  Map,
  Play,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Sprout,
  TrendingUp,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import RoadmapGlyph from "./RoadmapGlyph";
import React, { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import LoadingSpinner, { EmptyChartPlaceholder } from "./LoadingSpinner";
import { useFinancialRoadmap, useRoadmapTodoProgress } from "../hooks/useFinancialRoadmap";
import { playAchievementFanfare, playSuccessChime } from "../lib/audioService";
import type { AuthUser, UserSettings } from "../lib/auth";
import {
  CERTIFICATE_META,
  CERTIFICATE_UNLOCKED_EVENT,
  loadCertificates,
} from "../lib/certificates";
import { LESSON_PROGRESS_UPDATED_EVENT, readLessonProgress } from "../lib/lessonProgress";
import {
  LESSON_MODULES,
  PHASES,
  modulesForPhase,
  phaseIsComplete,
  requestOpenLesson,
  type LessonModuleDef,
} from "../lib/lessons";
import { privacyMoney } from "../lib/privacy";
import { toFiniteNumber } from "../lib/money";
import {
  requestFinancialOnboarding,
  toggleRoadmapTask,
  type RoadmapTask,
} from "../lib/roadmapService";
import {
  SAFETY_NET_RECOMMENDED_MONTHS,
  coverageProgressPct,
  monthsOfCoverage,
  type SafetyNetConfig,
} from "../lib/safetyNet";
import { getLessonStreak, STREAK_UPDATED_EVENT } from "../lib/streakService";
import type { Holding } from "./InvestmentScreen";
import InvestmentScreen from "./InvestmentScreen";
import CashFlowScreen, { SafetyNetSection } from "./CashFlowScreen";
import LessonsScreen from "./LessonsScreen";
import CertificatesSection from "./CertificatesSection";
import ProfileScreen from "./ProfileScreen";
import RetirementScreen from "./RetirementScreen";
import StreakBadge from "./StreakBadge";

export type WebDashboardNavId =
  | "investments"
  | "retirement"
  | "cashflow"
  | "lessons"
  | "settings"
  | "sprout"
  | "dashboard"
  | "certificates";

const NAV_ITEMS: Array<{
  id: Exclude<WebDashboardNavId, "sprout" | "dashboard" | "certificates">;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "investments", label: "Investments", icon: <TrendingUp size={16} /> },
  { id: "retirement", label: "Retirement", icon: <Shield size={16} /> },
  { id: "cashflow", label: "Cash Flow", icon: <Wallet size={16} /> },
  { id: "lessons", label: "Lessons", icon: <BookOpen size={16} /> },
  { id: "settings", label: "Settings", icon: <Settings size={16} /> },
];

const RETIRE_AGE = 65;

const BREAKDOWN_COLORS = {
  portfolio: "#38BDF8",
  retirement: "#10B981",
  checking: "#E2E8F0",
  hysa: "#34D399",
  gold: "#E8C547",
  bonds: "#A78BFA",
};

type BreakdownSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
  Icon: LucideIcon;
};

export type WebDashboardProps = {
  user: AuthUser;
  userName: string;
  profileInitials: string;
  privacyMode: boolean;
  onTogglePrivacy: () => void;
  netWorth: number;
  stockHoldingsValue: number;
  retirementBalance: number;
  liquidCashValue: number;
  hysaCashValue: number;
  goldValue: number;
  bondsValue: number;
  safetyNetTotal: number;
  monthlyExpenses: number;
  monthlyIncome?: number;
  totalDebt?: number;
  age: number | null;
  birthDate?: string | null;
  holdings: Holding[];
  holdingsReady: boolean;
  cashBalance: number;
  onHoldingsChange: (holdings: Holding[]) => void;
  onConsultSocrates: () => void;
  onAgeChange: (age: number, birthDate: string) => void;
  onBalanceChange: (balance: number) => void;
  settings: UserSettings | null;
  onSettingsChange: (settings: UserSettings) => void;
  onLogout: () => void;
  onEditFinancialProfile: () => void;
  safetyNet: SafetyNetConfig;
  onSafetyNetChange: (next: SafetyNetConfig) => void;
  onCashChange: (next: number) => void;
  goldPricePerOz: number | null;
  bondPrices: Record<string, number>;
  safetyQuotesLoading?: boolean;
  cashFlowExtra?: React.ReactNode;
  sproutExtra?: React.ReactNode;
};

function activeLesson(completed: string[]): LessonModuleDef {
  return LESSON_MODULES.find((moduleDef) => !completed.includes(moduleDef.id)) ?? LESSON_MODULES[0];
}

function goldCurriculumPct(completed: string[]): { done: number; total: number; pct: number } {
  const total = LESSON_MODULES.length;
  const done = LESSON_MODULES.filter((moduleDef) => completed.includes(moduleDef.id)).length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function pickFinancialTip(input: {
  safetyMonths: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  totalDebt: number;
  holdingsCount: number;
  netWorth: number;
  age: number | null;
  lessonPct: number;
  streak: number;
}): { eyebrow: string; title: string; body: string } {
  const tips: Array<{ eyebrow: string; title: string; body: string; weight: number }> = [];

  if (input.monthlyExpenses > 0 && input.safetyMonths < 3) {
    tips.push({
      eyebrow: "Safety first",
      title: "Build 3 months of cash",
      body: "Your emergency net is under the starter target. Park the next surplus in HYSA before adding risk.",
      weight: 5,
    });
  } else if (input.monthlyExpenses > 0 && input.safetyMonths < SAFETY_NET_RECOMMENDED_MONTHS) {
    tips.push({
      eyebrow: "Resilience",
      title: "Stretch the safety net to 6 months",
      body: "You’re past the starter cushion. The recommended 6-month reserve is what turns a job scare into a planning problem.",
      weight: 4,
    });
  }

  if (input.totalDebt > 0) {
    tips.push({
      eyebrow: "Debt",
      title: "Keep the snowball rolling",
      body: "Minimums on everything, extras on the smallest balance. Every cleared account frees cash flow for investing.",
      weight: 4,
    });
  }

  if (input.holdingsCount === 0) {
    tips.push({
      eyebrow: "Investing",
      title: "Open a paper lot this week",
      body: "Practice with a broad ETF before real dollars. The lessons unlock ticker prompts you can send to Investments.",
      weight: 3,
    });
  }

  if (input.monthlyIncome > 0 && input.monthlyExpenses > 0 && input.monthlyIncome > input.monthlyExpenses) {
    tips.push({
      eyebrow: "Surplus",
      title: "Automate the leftover",
      body: "You have a monthly surplus. Split it: safety net, high-APR debt, then a boring index fund. Automation beats willpower.",
      weight: 3,
    });
  }

  if (input.age != null && input.age < RETIRE_AGE) {
    tips.push({
      eyebrow: "Retirement",
      title: `${RETIRE_AGE - input.age} years to the standard age`,
      body: "Time is the rare asset. A modest monthly contribution now usually beats a heroic one later.",
      weight: 2,
    });
  }

  if (input.lessonPct < 100) {
    tips.push({
      eyebrow: "Academy",
      title: "One lesson keeps the streak alive",
      body: "Gold Master is earned at 100% of all five phases. Today’s module is the cheapest progress you can buy.",
      weight: 2,
    });
  }

  if (input.streak >= 3) {
    tips.push({
      eyebrow: "Streak",
      title: `${input.streak}-day streak is working`,
      body: "Consistency compounds like interest. Protect the chain — a four-minute lesson still counts.",
      weight: 2,
    });
  }

  if (input.netWorth > 0) {
    tips.push({
      eyebrow: "Allocation",
      title: "Re-read the breakdown, not the headline",
      body: "Net worth is a mix. Checking, HYSA, brokerage, retirement, gold, and bonds each do a different job.",
      weight: 1,
    });
  }

  if (tips.length === 0) {
    return {
      eyebrow: "Sprout tip",
      title: "Measure, then move",
      body: "Track cash flow, keep a safety net, then invest on a schedule. Small repeats beat perfect plans.",
    };
  }

  const daySeed = Math.floor(Date.now() / 86_400_000);
  const weighted = tips.flatMap((tip, index) => Array.from({ length: tip.weight }, () => index));
  const pick = tips[weighted[(daySeed + input.streak) % weighted.length] ?? 0];
  return { eyebrow: pick.eyebrow, title: pick.title, body: pick.body };
}

export default function WebDashboard({
  user,
  userName,
  profileInitials,
  privacyMode,
  onTogglePrivacy,
  netWorth,
  stockHoldingsValue,
  retirementBalance,
  liquidCashValue,
  hysaCashValue,
  goldValue,
  bondsValue,
  safetyNetTotal,
  monthlyExpenses,
  monthlyIncome = 0,
  totalDebt = 0,
  age,
  birthDate,
  holdings,
  holdingsReady,
  cashBalance,
  onHoldingsChange,
  onConsultSocrates,
  onAgeChange,
  onBalanceChange,
  settings,
  onSettingsChange,
  onLogout,
  onEditFinancialProfile,
  safetyNet,
  onSafetyNetChange,
  onCashChange,
  goldPricePerOz,
  bondPrices,
  safetyQuotesLoading = false,
  cashFlowExtra,
  sproutExtra,
}: WebDashboardProps) {
  // Guard mapped dashboard arrays so undefined never reaches child charts/tables.
  const safeHoldings = holdings || [];

  const [view, setView] = useState<WebDashboardNavId>("investments");
  const [streak, setStreak] = useState(() => getLessonStreak(user.id).current);
  const [completed, setCompleted] = useState(() => readLessonProgress(user.id).completed);
  const [goldEarned, setGoldEarned] = useState(() => loadCertificates(user.id).some((cert) => cert.tier === "gold"));

  useEffect(() => {
    const refresh = () => {
      setStreak(getLessonStreak(user.id).current);
      setCompleted(readLessonProgress(user.id).completed);
      setGoldEarned(loadCertificates(user.id).some((cert) => cert.tier === "gold"));
    };
    refresh();
    window.addEventListener(STREAK_UPDATED_EVENT, refresh);
    window.addEventListener(LESSON_PROGRESS_UPDATED_EVENT, refresh);
    window.addEventListener(CERTIFICATE_UNLOCKED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STREAK_UPDATED_EVENT, refresh);
      window.removeEventListener(LESSON_PROGRESS_UPDATED_EVENT, refresh);
      window.removeEventListener(CERTIFICATE_UNLOCKED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [user.id]);

  const slices = useMemo<BreakdownSlice[]>(
    () =>
      [
        {
          key: "portfolio",
          label: "Portfolio",
          value: toFiniteNumber(stockHoldingsValue, 0),
          color: BREAKDOWN_COLORS.portfolio,
          Icon: TrendingUp,
        },
        {
          key: "retirement",
          label: "Retirement",
          value: toFiniteNumber(retirementBalance, 0),
          color: BREAKDOWN_COLORS.retirement,
          Icon: Shield,
        },
        {
          key: "checking",
          label: "Checking",
          value: toFiniteNumber(liquidCashValue, 0),
          color: BREAKDOWN_COLORS.checking,
          Icon: Banknote,
        },
        {
          key: "hysa",
          label: "HYSA",
          value: toFiniteNumber(hysaCashValue, 0),
          color: BREAKDOWN_COLORS.hysa,
          Icon: Landmark,
        },
        {
          key: "gold",
          label: "Gold",
          value: toFiniteNumber(goldValue, 0),
          color: BREAKDOWN_COLORS.gold,
          Icon: Coins,
        },
        {
          key: "bonds",
          label: "Bonds",
          value: toFiniteNumber(bondsValue, 0),
          color: BREAKDOWN_COLORS.bonds,
          Icon: ScrollText,
        },
      ].filter((slice) => toFiniteNumber(slice?.value, 0) > 0),
    [stockHoldingsValue, retirementBalance, liquidCashValue, hysaCashValue, goldValue, bondsValue]
  );

  const safetyMonths = monthsOfCoverage(safetyNetTotal, monthlyExpenses);
  const safetyPct = coverageProgressPct(safetyMonths, SAFETY_NET_RECOMMENDED_MONTHS);
  const yearsToRetire = age != null ? Math.max(0, RETIRE_AGE - age) : null;
  const lesson = activeLesson(completed);
  const gold = goldCurriculumPct(completed);
  const lessonPhase = PHASES.find((phase) => phase.id === lesson.phaseId);
  const tip = useMemo(
    () =>
      pickFinancialTip({
        safetyMonths,
        monthlyExpenses,
        monthlyIncome,
        totalDebt,
        holdingsCount: safeHoldings.length,
        netWorth,
        age,
        lessonPct: gold.pct,
        streak,
      }),
    [safetyMonths, monthlyExpenses, monthlyIncome, totalDebt, safeHoldings.length, netWorth, age, gold.pct, streak]
  );

  const showDashboard = view === "dashboard";
  const startLesson = () => {
    requestOpenLesson({ moduleId: lesson.id, phaseId: lesson.phaseId });
    setView("lessons");
  };
  const openSprout = () => {
    setView("sprout");
    onConsultSocrates();
  };

  // Strict render guard: wait until portfolio mirror is ready before painting market UI.
  if (!holdingsReady && safeHoldings.length === 0) {
    return <LoadingSpinner fullScreen label="Loading your dashboard…" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-black text-slate-50">
      <aside className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-[#1F1F1F] bg-[#050505]">
        <div className="flex items-center gap-2 px-5 pb-4 pt-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400" aria-hidden>
            <Sprout size={18} />
          </span>
          <div>
            <p className="m-0 text-[15px] font-extrabold tracking-tight text-white">Sprout</p>
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400/80">Desktop</p>
          </div>
        </div>

        <nav aria-label="Desktop" className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            if (!item) return null;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-bold transition ${
                  active
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className={active ? "text-emerald-400" : "text-slate-500"}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3 border-t border-[#1F1F1F] p-3">
          <div className="flex items-center justify-between px-1">
            <p className="m-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Streak</p>
            <StreakBadge streak={streak} size="sm" />
          </div>
          <p className="m-0 px-1 text-[11px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Flame size={11} className={streak > 0 ? "text-orange-400" : "text-slate-600"} aria-hidden />
              {streak > 0
                ? `${streak} day${streak === 1 ? "" : "s"} · keep the streak going`
                : "Complete a lesson to start a streak"}
            </span>
          </p>

          <button
            type="button"
            onClick={openSprout}
            aria-current={view === "sprout" ? "page" : undefined}
            className={`flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition ${
              view === "sprout"
                ? "border-emerald-400/50 bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-[#0A0A0A] shadow-[0_0_24px_rgba(16,185,129,0.18)]"
                : "border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-[#0A0A0A] to-[#050505] hover:border-emerald-400/40 hover:from-emerald-500/20"
            }`}
          >
            <span
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
              aria-hidden
            >
              <Sparkles size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-extrabold text-white">Sprout AI</span>
              <span className="block truncate text-[11px] font-semibold text-emerald-300/80">
                Educational finance coach
              </span>
            </span>
            <Sparkles size={14} className="flex-shrink-0 text-emerald-400" />
          </button>

          <button
            type="button"
            onClick={() => setView("settings")}
            className={`flex w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left transition ${
              view === "settings"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-[#1F1F1F] bg-[#0A0A0A] hover:border-emerald-500/25"
            }`}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-emerald-500/20 text-[11px] font-extrabold text-emerald-200">
                {profileInitials}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-extrabold text-white">{userName}</span>
              <span className="block truncate text-[11px] font-semibold text-slate-500">{user.email}</span>
            </span>
            <User size={14} className="flex-shrink-0 text-slate-500" />
          </button>
        </div>
      </aside>

      <div className={showDashboard ? "flex min-w-0 flex-1" : "hidden"}>
          <>
            <main className="matter-dividend-scroll min-w-0 flex-1 overflow-y-auto px-6 py-6">
              <header className="flex items-start justify-between gap-4">
                <div>
                  <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
                    Total net worth
                  </p>
                  <p className="mt-1 text-4xl font-extrabold tracking-tight text-white">
                    {privacyMoney(privacyMode, netWorth)}
                  </p>
                  <p className="mt-1 text-[12px] font-semibold text-slate-500">
                    Checking and HYSA stay separate in the vault
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onTogglePrivacy}
                  aria-label={privacyMode ? "Show net worth amounts" : "Hide net worth amounts"}
                  aria-pressed={privacyMode}
                  title={privacyMode ? "Unlock amounts" : "Lock amounts in the privacy vault"}
                  className={`grid h-11 w-11 place-items-center rounded-2xl border text-lg transition ${
                    privacyMode
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                      : "border-[#1F1F1F] bg-[#0A0A0A] text-slate-300 hover:border-emerald-500/30"
                  }`}
                >
                  <Shield size={18} aria-hidden="true" />
                </button>
              </header>

              <BalanceBreakdown slices={slices} privacyMode={privacyMode} total={netWorth} />

              <RoadmapChecklist />

              <div className="mt-4 grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setView("cashflow")}
                  className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 text-left transition hover:border-emerald-500/30"
                >
                  <p className="m-0 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                    <Shield size={13} className="text-emerald-400" />
                    Emergency Safety Net
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-white">
                    {privacyMoney(privacyMode, safetyNetTotal)}
                  </p>
                  <p className="mt-1 text-[12px] font-semibold text-slate-400">
                    {monthlyExpenses > 0
                      ? `${toFiniteNumber(safetyMonths, 0).toFixed(1)} months of spending`
                      : "Add monthly expenses to size coverage"}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-[width]"
                      style={{ width: `${safetyPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
                    {safetyPct}% of the {SAFETY_NET_RECOMMENDED_MONTHS}-month target
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setView("retirement")}
                  className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 text-left transition hover:border-emerald-500/30"
                >
                  <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                    Retirement Age
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-white">
                    {age != null ? `${age} → ${RETIRE_AGE}` : `Target ${RETIRE_AGE}`}
                  </p>
                  <p className="mt-1 text-[12px] font-semibold text-slate-400">
                    {yearsToRetire == null
                      ? "Add your age in Profile to personalize the plan"
                      : yearsToRetire === 0
                        ? "At or past the standard retirement age"
                        : `${yearsToRetire} year${yearsToRetire === 1 ? "" : "s"} remaining`}
                  </p>
                  <p className="mt-3 text-[12px] font-bold text-emerald-300">
                    Plan balance {privacyMoney(privacyMode, retirementBalance)}
                  </p>
                </button>
              </div>
            </main>

            <aside className="matter-dividend-scroll flex h-full w-[300px] flex-shrink-0 flex-col gap-4 overflow-y-auto border-l border-[#1F1F1F] bg-[#050505] px-4 py-6">
              <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/15 to-[#0A0A0A] p-4">
                <p className="m-0 text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-300">
                  Active lesson
                </p>
                <p className="mt-2 text-[15px] font-extrabold leading-snug text-white">{lesson.title}</p>
                <p className="mt-1 text-[12px] font-semibold leading-snug text-slate-400">{lesson.subtitle}</p>
                <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-500">
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{ background: `${lesson.accent}22`, color: lesson.accent }}
                  >
                    {lessonPhase ? `Phase ${lessonPhase.number}` : "Academy"}
                  </span>
                  <span>{lesson.minutes} min</span>
                </div>
                <button
                  type="button"
                  onClick={startLesson}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-[13px] font-extrabold text-[#042F2E] transition hover:bg-emerald-400"
                >
                  <Play size={14} fill="currentColor" />
                  Quick start
                </button>
              </section>

              <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
                <p className="m-0 text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-300">
                  {tip.eyebrow}
                </p>
                <p className="mt-2 text-[14px] font-extrabold leading-snug text-white">{tip.title}</p>
                <p className="mt-1.5 text-[12px] font-semibold leading-relaxed text-slate-400">{tip.body}</p>
              </section>

              <section className="rounded-2xl border border-[#E8C547]/25 bg-[#0A0A0A] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="m-0 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#E8C547]">
                      Gold Certificate
                    </p>
                    <p className="mt-1 text-[13px] font-extrabold text-white">{CERTIFICATE_META.gold.title}</p>
                  </div>
                  <span className="rounded-full border border-[#E8C547]/30 bg-[#E8C547]/10 px-2 py-0.5 text-[11px] font-extrabold text-[#E8C547]">
                    %{gold.pct}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${gold.pct}%`, background: CERTIFICATE_META.gold.accent }}
                  />
                </div>
                <p className="mt-2 text-[11px] font-semibold text-slate-500">
                  {goldEarned
                    ? "Earned — all 5 curriculum phases complete"
                    : `${gold.done} of ${gold.total} lessons · %0 – %100`}
                </p>
                <div className="mt-3 space-y-1.5">
                  {PHASES.map((phase) => {
                    if (!phase) return null;
                    const modules = modulesForPhase(phase.id);
                    const done = modules.filter((moduleDef) => completed.includes(moduleDef.id)).length;
                    const complete = phaseIsComplete(phase.id, Object.fromEntries(completed.map((id) => [id, true])));
                    return (
                      <div key={phase.id} className="flex items-center gap-2 text-[11px] font-semibold">
                        <span className={complete ? "text-emerald-400" : "text-slate-600"}>
                          {complete ? <Check size={12} /> : <span className="inline-block w-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-slate-400">Phase {phase.number}</span>
                        <span className="tabular-nums text-slate-500">
                          {done}/{modules.length}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setView("certificates")}
                  className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-[#E8C547]"
                >
                  View certificate
                  <ChevronRight size={14} />
                </button>
              </section>
            </aside>
          </>
      </div>

      <div className={view === "cashflow" ? "matter-dividend-scroll min-w-0 flex-1 overflow-y-auto px-6 py-6" : "hidden"}>
        <div className="mx-auto w-full max-w-3xl">
          <CashFlowScreen holdings={safeHoldings} privacyMode={privacyMode} />
          {cashFlowExtra}
          <SafetyNetSection
            holdings={safeHoldings}
            monthlyExpenses={monthlyExpenses}
            cash={cashBalance}
            onCashChange={onCashChange}
            config={safetyNet}
            onConfigChange={onSafetyNetChange}
            goldPricePerOz={goldPricePerOz}
            bondPrices={bondPrices}
            quotesLoading={safetyQuotesLoading}
            privacyMode={privacyMode}
          />
        </div>
      </div>

      <div className={view === "certificates" ? "matter-dividend-scroll min-w-0 flex-1 overflow-y-auto px-6 py-6" : "hidden"}>
        <div className="mx-auto w-full max-w-2xl">
          <CertificatesSection userId={user.id} />
        </div>
      </div>

      <div className={view === "settings" ? "matter-dividend-scroll min-w-0 flex-1 overflow-y-auto px-6 py-6" : "hidden"}>
        <div className="mx-auto w-full max-w-2xl">
          <ProfileScreen
            user={user}
            settings={settings}
            onSettingsChange={onSettingsChange}
            onLogout={onLogout}
            holdings={safeHoldings}
            holdingsReady={holdingsReady}
            netWorth={netWorth}
            portfolioValue={stockHoldingsValue}
            safetyNetValue={safetyNetTotal}
            monthlyExpenses={monthlyExpenses}
            onEditFinancialProfile={onEditFinancialProfile}
          />
        </div>
      </div>

      <div className={view === "investments" ? "matter-dividend-scroll min-w-0 flex-1 overflow-y-auto px-6 py-6" : "hidden"}>
        <div className="mx-auto w-full max-w-3xl">
          <InvestmentScreen
            key={user.id}
            holdings={safeHoldings}
            totalPortfolioValue={stockHoldingsValue}
            onHoldingsChange={onHoldingsChange}
            onConsultSocrates={openSprout}
            cashBalance={cashBalance}
            privacyMode={privacyMode}
            onTogglePrivacy={onTogglePrivacy}
          />
        </div>
      </div>

      <div
        className={view === "lessons" ? "matter-dividend-scroll min-w-0 flex-1 overflow-y-auto px-6 py-6" : "hidden"}
        aria-hidden={view !== "lessons"}
      >
        <div className="mx-auto w-full max-w-3xl">
          <LessonsScreen active={view === "lessons"} onOpenPaperPortfolio={() => setView("investments")} />
        </div>
      </div>

      <div
        className={view === "retirement" ? "matter-dividend-scroll min-w-0 flex-1 overflow-y-auto px-6 py-6" : "hidden"}
        aria-hidden={view !== "retirement"}
      >
        <div className="mx-auto w-full max-w-3xl">
          <RetirementScreen
            key={user.id}
            visible={view === "retirement"}
            userId={user.id}
            age={age}
            birthDate={birthDate ?? null}
            onAgeChange={onAgeChange}
            onBalanceChange={onBalanceChange}
          />
        </div>
      </div>

      <div
        className={view === "sprout" ? "flex min-w-0 flex-1 flex-col overflow-hidden px-6 py-6" : "hidden"}
        aria-hidden={view !== "sprout"}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          {sproutExtra ?? (
            <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/15 to-[#0A0A0A] p-6">
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-300">
                Sprout AI
              </p>
              <p className="mt-2 text-2xl font-extrabold text-white">Your educational money coach</p>
              <p className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-400">
                Ask about budgeting, compound interest, debt reduction, or organizing expenses. Sprout teaches
                general concepts — never stock picks or tax advice.
              </p>
              <button
                type="button"
                onClick={onConsultSocrates}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[13px] font-extrabold text-[#042F2E] transition hover:bg-emerald-400"
              >
                <Sparkles size={14} />
                Open Sprout AI
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function BalanceBreakdown({
  slices,
  privacyMode,
  total,
}: {
  slices: BreakdownSlice[];
  privacyMode: boolean;
  total: number;
}) {
  const safeSlices = (slices || []).map((slice) => ({
    ...slice,
    value: toFiniteNumber(slice?.value, 0),
  }));
  const safeTotal = toFiniteNumber(total, 0);
  if (safeSlices.length === 0 || safeTotal <= 0) {
    return (
      <section className="mt-6 rounded-2xl border border-dashed border-[#1F1F1F] bg-[#0A0A0A] px-5 py-8 text-center">
        <Lock size={18} className="mx-auto text-slate-600" />
        <p className="mt-2 text-sm font-extrabold text-white">Balance breakdown</p>
        <p className="mt-1 text-[12px] font-semibold text-slate-500">
          Add cash, investments, or retirement savings and the vault will chart the mix.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5" aria-label="Balance breakdown">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
          Balance Breakdown
        </h2>
        <span className="text-[11px] font-semibold text-slate-500">{safeSlices.length} sleeves</span>
      </div>
      <div className="mt-4 flex flex-col items-center gap-5 xl:flex-row">
        <div className="relative h-44 w-44 flex-shrink-0">
          {safeSlices && safeSlices.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={safeSlices}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={80}
                paddingAngle={2}
                stroke="none"
              >
                {(safeSlices ?? []).map((slice = {} as any) => {
                  if (!slice) return null;
                  return (
                  <Cell key={slice.key} fill={slice.color} />
                  );
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          ) : (
            <EmptyChartPlaceholder heightClassName="h-44 w-44" title="No breakdown" message="Nothing to chart yet." />
          )}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">Total</p>
              <p className="m-0 text-sm font-extrabold text-white">{privacyMoney(privacyMode, safeTotal)}</p>
            </div>
          </div>
        </div>
        <ul className="m-0 w-full list-none space-y-2 p-0">
          {(safeSlices ?? []).map((slice = {} as any) => {
            if (!slice) return null;
            const value = toFiniteNumber(
              (slice as any).price ?? (slice as any).total_value ?? slice.value,
              0
            );
            const pct = safeTotal > 0 ? Math.round((value / safeTotal) * 100) : 0;
            return (
              <li key={slice.key} className="flex items-center gap-2 text-[12px]">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: slice.color }} />
                <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-semibold text-slate-300">
                  <span className="flex-shrink-0 text-slate-400" aria-hidden>
                    {React.createElement(slice.Icon, { size: 13 })}
                  </span>
                  {slice.label}
                </span>
                <span className="tabular-nums font-bold text-white">{privacyMoney(privacyMode, value)}</span>
                <span className="w-9 text-right tabular-nums font-semibold text-slate-500">{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function RoadmapChecklist() {
  const roadmap = useFinancialRoadmap();
  const todoProgress = useRoadmapTodoProgress();
  const completed = new Set(todoProgress.completedIds);
  const todos = roadmap?.todos ?? [];
  const doneCount = todos.filter((todo) => completed.has(todo.id)).length;
  const total = todos.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const handleToggle = (task: RoadmapTask) => {
    const nextComplete = !completed.has(task.id);
    toggleRoadmapTask(task, nextComplete);
    if (!nextComplete) return;
    playSuccessChime();
    if (todos.every((todo) => todo.id === task.id || completed.has(todo.id))) {
      playAchievementFanfare();
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
            Financial Roadmap
          </h2>
          <p className="mt-1 text-[13px] font-extrabold text-white">
            {roadmap ? (
              <span className="inline-flex items-center gap-1.5">
                <RoadmapGlyph archetype={roadmap.archetype} size={15} color={roadmap.accent} />
                {roadmap.title}
              </span>
            ) : (
              "Build a money profile"
            )}
          </p>
        </div>
        {roadmap ? (
          <span className="rounded-full border border-white/10 bg-black px-2 py-0.5 text-[11px] font-extrabold text-slate-300">
            {doneCount}/{total}
          </span>
        ) : null}
      </div>

      {!roadmap ? (
        <div className="mt-4 rounded-2xl border border-dashed border-neutral-800 bg-black/40 px-4 py-5 text-center">
          <Map size={20} className="mx-auto text-emerald-400" />
          <p className="mt-2 text-[12px] font-semibold text-slate-400">
            Connect a demo bank or pick a mock profile to unlock a live checklist.
          </p>
          <button
            type="button"
            onClick={() => requestFinancialOnboarding(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-[13px] font-bold text-[#042F2E]"
          >
            <Sparkles size={14} />
            Build my roadmap
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: roadmap.accent }} />
          </div>
          <ol className="mt-3 m-0 list-none space-y-2 p-0">
            {(todos ?? []).map((todo = {} as any, index) => {
              if (!todo) return null;
              const checked = completed.has(todo.id);
              return (
                <li key={todo.id}>
                  <button
                    type="button"
                    onClick={() => handleToggle(todo)}
                    aria-pressed={checked}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      checked
                        ? "border-emerald-500/35 bg-emerald-500/10"
                        : "border-[#1F1F1F] bg-black/30 hover:border-emerald-500/25"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-md border text-[11px] ${
                        checked
                          ? "border-emerald-400 bg-emerald-500 text-[#042F2E]"
                          : "border-neutral-600 bg-black/40 text-transparent"
                      }`}
                    >
                      {checked ? <Check size={12} strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] font-extrabold ${checked ? "text-emerald-100 line-through decoration-emerald-500/50" : "text-white"}`}>
                        Step {index + 1}: {todo.title}
                      </span>
                      <span className={`mt-0.5 block text-[11px] font-semibold ${checked ? "text-emerald-200/70" : "text-slate-500"}`}>
                        {todo.detail}
                      </span>
                    </span>
                    <span className="flex-shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300">
                      +{todo.xp} XP
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
