import React from "react";
import { ScrollText } from "lucide-react";

type SocratesPortfolioReportProps = {
  /** Opens the full-screen Daily Report screen. */
  onOpenReport: () => void;
};

/**
 * Single clickable card that navigates to the full-screen AI daily report.
 */
export default function SocratesPortfolioReport({ onOpenReport }: SocratesPortfolioReportProps) {
  return (
    <button
      type="button"
      onClick={onOpenReport}
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
  );
}
