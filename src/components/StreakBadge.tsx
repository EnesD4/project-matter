import { Flame } from "lucide-react";
import React from "react";

type StreakBadgeSize = "sm" | "md" | "lg";

export default function StreakBadge({
  streak,
  size = "md",
  showCaption = true,
  bump = false,
}: {
  streak: number;
  size?: StreakBadgeSize;
  showCaption?: boolean;
  bump?: boolean;
}) {
  const hot = streak > 0;
  const flameSize = size === "lg" ? 22 : size === "sm" ? 14 : 18;
  const countClass =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-xl";
  const padClass = size === "lg" ? "px-3 py-1.5" : size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const label = showCaption ? `${streak}D` : String(streak);

  return (
    <div
      className={`relative flex flex-shrink-0 items-center gap-1 rounded-full border ${padClass} ${
        hot
          ? "border-orange-500/40 bg-orange-500/12 text-orange-200"
          : "border-[#1F1F1F] bg-black/30 text-slate-500"
      }`}
      aria-label={hot ? `${streak}-day learning streak` : "No learning streak yet"}
    >
      <Flame
        size={flameSize}
        className={hot ? "lesson-flame-pulse text-orange-400" : "text-slate-600"}
        fill={hot ? "currentColor" : "none"}
        aria-hidden="true"
      />
      <span
        className={`whitespace-nowrap font-extrabold tabular-nums leading-none tracking-tight ${countClass} ${
          hot ? "text-white" : ""
        }`}
      >
        {label}
      </span>
      {bump ? (
        <span className="lesson-streak-plus pointer-events-none absolute -right-1 -top-3 text-[11px] font-extrabold text-orange-300">
          +1 Day!
        </span>
      ) : null}
    </div>
  );
}
