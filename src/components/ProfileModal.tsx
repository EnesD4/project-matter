import { RefreshCw, Sparkles } from "lucide-react";
import RoadmapGlyph from "./RoadmapGlyph";
import React from "react";
import { useFinancialRoadmap } from "../hooks/useFinancialRoadmap";
import { formatCurrencyValue } from "../lib/money";
import {
  GOAL_OPTIONS,
  requestFinancialOnboarding,
  stateByCode,
} from "../lib/roadmapService";

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

  const handleRecalculate = () => {
    if (onRecalculate) {
      onRecalculate();
      return;
    }
    requestFinancialOnboarding(true);
  };

  const goal = GOAL_OPTIONS.find((option) => option.id === roadmap?.profile.bottleneck);
  const state = stateByCode(roadmap?.profile.stateCode ?? null);

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
