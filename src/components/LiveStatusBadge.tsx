import React from "react";

type LiveStatusBadgeProps = {
  marketOpen: boolean;
  className?: string;
};

export default function LiveStatusBadge({
  marketOpen,
  className = "",
}: LiveStatusBadgeProps) {
  return (
    <div
      className={`inline-flex items-center ${className}`.trim()}
      title={marketOpen ? "US market open · live quotes" : "US market closed"}
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
          marketOpen
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-[#1F2937] bg-[#111827]/50"
        }`}
      >
        {marketOpen ? (
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-[#6B7280]" aria-hidden />
        )}
        <span
          className={`text-[10px] font-extrabold uppercase ${
            marketOpen
              ? "tracking-[0.14em] text-emerald-400"
              : "tracking-[0.08em] text-[#9CA3AF]"
          }`}
        >
          {marketOpen ? "Live" : "Market Closed"}
        </span>
      </span>
    </div>
  );
}
