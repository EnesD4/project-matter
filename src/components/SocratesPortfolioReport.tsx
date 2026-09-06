import React, { useState } from "react";
import {
  Brain,
  Landmark,
  LucideIcon,
  MessageCircle,
  ScrollText,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";

type Insight = {
  label: string;
  question: string;
  icon: LucideIcon;
};

const INSIGHTS: Insight[] = [
  {
    label: "Portfolio Risk",
    question:
      "Over half your portfolio sits in stocks. If the market dropped 20% tomorrow, would you hold — or panic-sell?",
    icon: ShieldAlert,
  },
  {
    label: "Asset Allocation",
    question:
      "Gold makes up just 15% of your mix. Is that enough ballast, or are you leaning entirely on stocks and funds to carry you?",
    icon: Landmark,
  },
  {
    label: "Market Considerations",
    question:
      "You're up 101% since you started, but only 4.9% this month. Which number should actually guide your next move?",
    icon: TrendingUp,
  },
];

type SocratesPortfolioReportProps = {
  /** Called when the user wants to keep talking this through in the Socrates AI chat tab. */
  onConsultSocrates?: () => void;
};

export default function SocratesPortfolioReport({ onConsultSocrates }: SocratesPortfolioReportProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-[#111827] to-[#111827] p-4 shadow-[0_0_28px_rgba(16,185,129,0.16)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.35)]">
            <Brain size={18} />
            <Sparkles size={11} className="absolute -right-1 -top-1 text-emerald-300" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Socrates AI Portfolio Report
            </p>
            <h3 className="truncate text-sm font-extrabold text-white">Sokrates Portföy Analizi</h3>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-95"
        >
          <ScrollText size={14} />
          Yatırım Raporu Al
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-4 sm:items-center"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="matter-pop w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-[#111827] p-5 shadow-[0_0_32px_rgba(16,185,129,0.18)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="socrates-report-title"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Brain size={18} />
                </span>
                <div>
                  <h3 id="socrates-report-title" className="text-base font-extrabold text-white">
                    Sokrates'in Görüşleri
                  </h3>
                  <p className="text-[11px] text-slate-500">3 quick questions on your portfolio</p>
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

            <div className="mt-4 space-y-3">
              {INSIGHTS.map((insight) => {
                const Icon = insight.icon;
                return (
                  <div
                    key={insight.label}
                    className="rounded-xl border border-[#1F2937] bg-black/20 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                        <Icon size={13} />
                      </span>
                      <span className="text-xs font-bold text-white">{insight.label}</span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-300">{insight.question}</p>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onConsultSocrates?.();
              }}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
            >
              <MessageCircle size={15} />
              Sokrates'e Danış
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
