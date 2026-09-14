import React from "react";
import { Loader2 } from "lucide-react";

type LoadingSpinnerProps = {
  /** Short status line shown under the spinner. */
  label?: string;
  /** Fill the viewport (auth / bootstrap) vs a local panel. */
  fullScreen?: boolean;
  className?: string;
};

/** Clean loading fallback used while auth or initial data resolve. */
export default function LoadingSpinner({
  label = "Loading…",
  fullScreen = false,
  className = "",
}: LoadingSpinnerProps) {
  return (
    <div
      className={
        fullScreen
          ? `grid min-h-[100dvh] place-items-center bg-black px-6 text-center ${className}`
          : `grid min-h-[40vh] place-items-center px-4 py-10 text-center ${className}`
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div>
        <Loader2
          size={fullScreen ? 28 : 22}
          className="mx-auto animate-spin text-emerald-400"
          aria-hidden
        />
        <p className="mt-3 text-sm font-bold text-slate-400">{label}</p>
      </div>
    </div>
  );
}

type EmptyChartPlaceholderProps = {
  title?: string;
  message?: string;
  className?: string;
  heightClassName?: string;
};

/** Shown instead of Recharts when the series is empty or not ready. */
export function EmptyChartPlaceholder({
  title = "No chart data yet",
  message = "Add holdings or wait for market data to populate this chart.",
  className = "",
  heightClassName = "h-44 sm:h-48",
}: EmptyChartPlaceholderProps) {
  return (
    <div
      className={`grid ${heightClassName} place-items-center rounded-lg border border-dashed border-[#1F2937] bg-black/40 px-4 text-center ${className}`}
      role="status"
    >
      <div>
        <p className="m-0 text-[12px] font-extrabold text-slate-300">{title}</p>
        <p className="mt-1 max-w-[240px] text-[11px] font-semibold leading-snug text-slate-500">
          {message}
        </p>
      </div>
    </div>
  );
}
