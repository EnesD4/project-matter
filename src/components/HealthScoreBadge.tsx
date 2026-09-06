import React, { useState } from "react";
import { ChevronRight, Gauge, LucideIcon, ShieldCheck, TrendingUp, Wallet, X } from "lucide-react";

type ScoreFactor = {
  label: string;
  score: number;
  max: number;
  icon: LucideIcon;
  note: string;
};

const SCORE_FACTORS: ScoreFactor[] = [
  { label: "Payment History", score: 88, max: 100, icon: ShieldCheck, note: "On-time payments, tracked automatically." },
  { label: "Debt-to-Income", score: 66, max: 100, icon: TrendingUp, note: "How much of your income goes to debt." },
  { label: "Savings Rate", score: 78, max: 100, icon: Wallet, note: "Share of income you're setting aside." },
  { label: "Emergency Fund", score: 81, max: 100, icon: Gauge, note: "Progress toward your safety-net goal." },
];

type HealthScoreBadgeProps = {
  score: number;
  scoreMax: number;
};

export default function HealthScoreBadge({ score, scoreMax }: HealthScoreBadgeProps) {
  const [open, setOpen] = useState(false);
  const pct = Math.round((score / scoreMax) * 100);
  const tier = pct >= 80 ? "Excellent" : pct >= 65 ? "Strong" : pct >= 45 ? "Fair" : "Needs Work";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-3 rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-3 text-left transition hover:border-emerald-500/40 active:scale-[0.99]"
      >
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
          <Gauge size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Financial Health
          </span>
          <span className="block text-sm font-extrabold text-white">
            {score}
            <span className="font-semibold text-slate-500"> / {scoreMax}</span>
            <span className="ml-1.5 text-emerald-400">· {tier}</span>
          </span>
        </span>
        <ChevronRight size={16} className="flex-shrink-0 text-slate-500" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-4 sm:items-center"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="matter-pop w-full max-w-sm rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="health-score-title"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Gauge size={18} />
                </span>
                <div>
                  <h3 id="health-score-title" className="text-base font-extrabold text-white">
                    Financial Health Score
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {score} / {scoreMax} · {tier}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-slate-400 transition hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Your score blends a few habits into one number. Here's roughly how each piece is
              tracking right now:
            </p>

            <div className="mt-4 space-y-3">
              {SCORE_FACTORS.map((factor) => {
                const Icon = factor.icon;
                const factorPct = Math.round((factor.score / factor.max) * 100);
                return (
                  <div key={factor.label} className="rounded-xl border border-[#1F1F1F] bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-[#3B82F6]/15 text-[#60A5FA]">
                          <Icon size={13} />
                        </span>
                        <span className="text-xs font-bold text-white">{factor.label}</span>
                      </div>
                      <span className="text-xs font-extrabold text-emerald-400">{factorPct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${factorPct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">{factor.note}</p>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
