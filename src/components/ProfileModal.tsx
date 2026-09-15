import { Award, RefreshCw, Sparkles, Star } from "lucide-react";
import RoadmapGlyph from "./RoadmapGlyph";
import React, { useEffect, useState } from "react";
import { useFinancialRoadmap } from "../hooks/useFinancialRoadmap";
import { getStoredUser } from "../lib/auth";
import { formatCurrencyValue, formatNumber } from "../lib/money";
import {
  GOAL_OPTIONS,
  requestFinancialOnboarding,
  stateByCode,
} from "../lib/roadmapService";
import {
  readUserProgress,
  USER_PROGRESS_UPDATED_EVENT,
  type UserProgressView,
} from "../lib/userProgress";
import { LESSON_PROGRESS_UPDATED_EVENT } from "../lib/lessonProgress";
import { STREAK_UPDATED_EVENT } from "../lib/streakService";
import StreakBadge from "./StreakBadge";

type ProfileModalProps = {
  onRecalculate?: () => void;
};

function usd(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const formatted = formatCurrencyValue(amount, { symbol: true });
  return formatted || "$0";
}

export default function ProfileModal({ onRecalculate }: ProfileModalProps) {
  const roadmap = useFinancialRoadmap();
  const userId = getStoredUser()?.id;
  const [progress, setProgress] = useState<UserProgressView>(() => readUserProgress(userId));

  useEffect(() => {
    const refresh = () => setProgress(readUserProgress(userId));
    refresh();
    window.addEventListener(USER_PROGRESS_UPDATED_EVENT, refresh);
    window.addEventListener(LESSON_PROGRESS_UPDATED_EVENT, refresh);
    window.addEventListener(STREAK_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(USER_PROGRESS_UPDATED_EVENT, refresh);
      window.removeEventListener(LESSON_PROGRESS_UPDATED_EVENT, refresh);
      window.removeEventListener(STREAK_UPDATED_EVENT, refresh);
    };
  }, [userId]);

  const handleRecalculate = () => {
    if (onRecalculate) {
      onRecalculate();
      return;
    }
    requestFinancialOnboarding(true);
  };

  const goal = GOAL_OPTIONS.find((option) => option.id === roadmap?.profile.bottleneck);
  const state = stateByCode(roadmap?.profile.stateCode ?? null);
  const earnedBadges = progress.badges.filter((badge) => badge.unlocked);
  const xpPct = Math.min(100, Math.round((progress.xpIntoLevel / progress.xpPerLevel) * 100));

  return (
    <section
      aria-label="Income profile"
      className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">
            Income profile
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Recalculate anytime — your lessons roadmap updates with it.
          </p>
        </div>
        <Sparkles size={16} className="flex-shrink-0 text-emerald-400" />
      </div>

      {roadmap ? (
        <div className="mt-3 space-y-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-extrabold text-white">
            <RoadmapGlyph archetype={roadmap.archetype} size={15} color={roadmap.accent} />
            {roadmap.title}
          </p>
          <dl className="space-y-1.5 text-xs text-slate-300">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Location</dt>
              <dd className="font-semibold text-slate-200">{state ? state.name : "Not set"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">After-tax income</dt>
              <dd className="font-semibold text-slate-200">{usd(roadmap.profile.monthlyIncome)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Essential expenses</dt>
              <dd className="font-semibold text-slate-200">{usd(roadmap.profile.monthlyEssentialExpenses)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Monthly margin</dt>
              <dd className="font-semibold text-slate-200">{usd(roadmap.profile.monthlyMargin)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Primary goal</dt>
              <dd className="font-semibold text-slate-200">{goal?.label ?? "—"}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-300">
          No income profile yet. Build one to unlock a tailored curriculum.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-[#1F1F1F] bg-black/25 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/15 text-amber-400">
              <Star size={14} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Level {progress.level} · {progress.xpIntoLevel}/{progress.xpPerLevel} XP
              </p>
              <p className="text-sm font-extrabold text-white">{formatNumber(progress.xp)} XP</p>
            </div>
          </div>
          <StreakBadge streak={progress.streak} size="sm" />
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-emerald-400 to-emerald-500 transition-all duration-500"
            style={{ width: `${xpPct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] font-semibold text-slate-500">
          {progress.completedLessons.length} lessons · {progress.completedQuests.length} quests ·{" "}
          {earnedBadges.length} learning badges
        </p>
      </div>

      {earnedBadges.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
            <Award size={12} /> Learning badges
          </p>
          <div className="flex flex-wrap gap-1.5">
            {earnedBadges.map((badge) => (
              <span
                key={badge.id}
                title={badge.requirement}
                className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-200"
              >
                {badge.title}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleRecalculate}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-bold text-[#042F2E] hover:bg-emerald-400"
      >
        <RefreshCw size={14} />
        {roadmap ? "Recalculate income profile" : "Create income profile"}
      </button>
    </section>
  );
}
