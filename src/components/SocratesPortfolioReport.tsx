import React, { useEffect, useId, useState } from "react";
import { Briefcase, Globe2, ScrollText, X } from "lucide-react";

export type DailyReportMode = "general" | "specialized";

type SocratesPortfolioReportProps = {
  /** Opens the full-screen Daily Report screen for the chosen mode. */
  onOpenReport: (mode: DailyReportMode) => void;
  /** When false, specialized option is shown but disabled with a hint. */
  hasHoldings?: boolean;
};

/**
 * Clickable card that opens a mode-selection modal, then navigates to the
 * full-screen AI daily report.
 */
export default function SocratesPortfolioReport({
  onOpenReport,
  hasHoldings = true,
}: SocratesPortfolioReportProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-[#10B981]/35 bg-[#000000] px-4 py-3.5 text-left transition hover:border-[#10B981]/55 hover:bg-[#0A0A0A] active:scale-[0.995]"
      >
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-[#10B981]/15 text-[#10B981]">
          <ScrollText size={16} />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-white">Get the daily report</span>
        <span className="text-[#10B981]" aria-hidden>
          →
        </span>
      </button>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#1F2937] bg-[#0A0A0A] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)] sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  AI Daily Report
                </p>
                <h3
                  id={titleId}
                  className="mt-1 text-[16px] font-extrabold tracking-tight text-white"
                >
                  Choose your briefing
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-[#9CA3AF]">
                  Pick a quick market wrap or a personalized look at your holdings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-[#1F2937] text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  onOpenReport("general");
                }}
                className="group flex w-full items-start gap-3 rounded-2xl border border-[#1F2937] bg-[#111827] px-3.5 py-3.5 text-left transition hover:border-emerald-500/45 hover:bg-[#0F172A] active:scale-[0.995]"
              >
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400 transition group-hover:bg-emerald-500/20">
                  <Globe2 size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">General Market Report</span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-[#9CA3AF]">
                    Quick macro-economic &amp; broad market summary powered directly by Gemini AI.
                  </span>
                </span>
                <span className="mt-1 text-emerald-400 opacity-0 transition group-hover:opacity-100" aria-hidden>
                  →
                </span>
              </button>

              <button
                type="button"
                disabled={!hasHoldings}
                onClick={() => {
                  if (!hasHoldings) return;
                  setPickerOpen(false);
                  onOpenReport("specialized");
                }}
                className="group flex w-full items-start gap-3 rounded-2xl border border-[#1F2937] bg-[#111827] px-3.5 py-3.5 text-left transition hover:border-emerald-500/45 hover:bg-[#0F172A] active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#1F2937] disabled:hover:bg-[#111827] disabled:active:scale-100"
              >
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400 transition group-hover:bg-emerald-500/20 group-disabled:bg-white/5 group-disabled:text-[#6B7280]">
                  <Briefcase size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">Specialized Portfolio Report</span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-[#9CA3AF]">
                    In-depth personalized breakdown based on your portfolio holdings.
                  </span>
                  {!hasHoldings && (
                    <span className="mt-1.5 block text-[11px] font-semibold text-amber-200/80">
                      Add a holding first to unlock this report.
                    </span>
                  )}
                </span>
                {hasHoldings && (
                  <span className="mt-1 text-emerald-400 opacity-0 transition group-hover:opacity-100" aria-hidden>
                    →
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
