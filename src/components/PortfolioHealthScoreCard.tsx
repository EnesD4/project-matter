import React, { useEffect, useId, useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { analyzePortfolioHealth, type HealthTone, type PortfolioHealthReport } from "../lib/portfolioHealth";
import type { Holding } from "./InvestmentPortfolioCard";

type PortfolioHealthScoreCardProps = {
  holdings: Holding[];
  cashBalance?: number;
};

const TONE_BADGE: Record<HealthTone, string> = {
  good: "border-emerald-500/35 bg-emerald-500/12 text-emerald-300",
  moderate: "border-amber-500/40 bg-amber-500/12 text-amber-300",
  elevated: "border-orange-500/40 bg-orange-500/12 text-orange-300",
  high: "border-red-500/40 bg-red-500/12 text-red-300",
};

function HealthGauge({
  score,
  color,
  empty,
  size = 108,
}: {
  score: number;
  color: string;
  empty: boolean;
  size?: number;
}) {
  const stroke = size >= 140 ? 12 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = empty ? 0 : score / 100;
  const dash = c * filled;
  const large = size >= 140;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1F2937" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`${large ? "text-4xl" : "text-2xl"} font-extrabold tabular-nums leading-none`}
          style={{ color }}
        >
          {empty ? "—" : score}
        </span>
        <span
          className={`mt-0.5 font-bold uppercase tracking-wide text-[#6B7280] ${
            large ? "text-[10px]" : "text-[9px]"
          }`}
        >
          / 100
        </span>
      </div>
    </div>
  );
}

function StatusMeter({
  emoji,
  title,
  label,
  detail,
  meter,
  color,
  invertRisk,
}: {
  emoji: string;
  title: string;
  label: string;
  detail: string;
  meter: number;
  color: string;
  invertRisk?: boolean;
}) {
  const fill = invertRisk
    ? meter >= 70
      ? "#EF4444"
      : meter >= 50
        ? "#F97316"
        : meter >= 35
          ? "#F59E0B"
          : "#10B981"
    : color;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold text-white">
          <span aria-hidden="true">{emoji}</span> {title}
        </p>
        <p className="truncate text-[11px] font-extrabold tabular-nums" style={{ color: fill }}>
          {label}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#1F2937]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(4, meter)}%`, background: fill }}
        />
      </div>
      <p className="mt-1 text-[10px] font-semibold leading-snug text-[#6B7280]">{detail}</p>
    </div>
  );
}

function HealthBreakdownModal({
  report,
  dialogId,
  titleId,
  onClose,
}: {
  report: PortfolioHealthReport;
  dialogId: string;
  titleId: string;
  onClose: () => void;
}) {
  const statusTag = report.empty
    ? "Waiting on holdings"
    : `${report.score}/100 — ${report.rating}`;
  const badgeClass = report.empty
    ? "border-[#1F2937] bg-[#0A0A0A] text-[#9CA3AF]"
    : TONE_BADGE[report.tone];

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/75 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        id={dialogId}
        className="matter-pop flex max-h-[min(88vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1F2937] px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-extrabold text-white">
              Portfolio Health Breakdown
            </h3>
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
              Diversification, beta, and defensive coverage
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close health breakdown"
            className="flex-shrink-0 rounded-lg p-1 text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col items-center text-center">
            <HealthGauge
              score={report.score}
              color={report.empty ? "#6B7280" : report.color}
              empty={report.empty}
              size={148}
            />
            <span
              className={`mt-3 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${badgeClass}`}
            >
              {statusTag}
            </span>
            <p className="mt-2 max-w-[280px] text-[11px] leading-relaxed text-[#9CA3AF]">
              Weighted from sector concentration, estimated beta vs the S&amp;P 500, and ETF vs
              single-stock mix.
            </p>
          </div>

          <div className="mt-5 grid gap-3.5">
            <StatusMeter
              emoji="🎯"
              title="Diversification Metric"
              label={report.diversification.label}
              detail={report.diversification.detail}
              meter={report.diversification.meter}
              color="#10B981"
            />
            <StatusMeter
              emoji="⚡"
              title="Volatility / Beta Exposure"
              label={report.volatility.label}
              detail={report.volatility.detail}
              meter={report.volatility.meter}
              color={report.color}
              invertRisk
            />
            <StatusMeter
              emoji="🛡️"
              title="Defensive Cushion"
              label={
                report.empty
                  ? report.defensive.label
                  : `${report.defensive.label} · ${report.defensive.cushionPct.toFixed(0)}%`
              }
              detail={report.defensive.detail}
              meter={report.defensive.meter}
              color="#06B6D4"
            />
          </div>

          <div className="mt-5 border-t border-[#1F2937] pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">
              Actionable AI Recommendations
            </p>
            <ul className="mt-2 space-y-2">
              {report.insights.map((insight) => (
                <li key={insight} className="flex gap-2 text-[12px] leading-relaxed text-[#D1D5DB]">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioHealthScoreCard({
  holdings,
  cashBalance = 0,
}: PortfolioHealthScoreCardProps) {
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const titleId = useId();
  const report = useMemo(
    () => analyzePortfolioHealth(holdings, cashBalance),
    [holdings, cashBalance]
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const scoreLabel = report.empty ? "— / 100" : `${report.score} / 100`;
  const badgeClass = report.empty
    ? "border-[#1F2937] bg-[#0A0A0A] text-[#9CA3AF] hover:border-[#374151] hover:text-white"
    : `${TONE_BADGE[report.tone]} hover:brightness-125`;

  return (
    <section
      className="mt-4 rounded-2xl border border-[#1F2937] bg-[#000000] p-4"
      aria-label="Sprout AI portfolio health score"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">
            Sprout AI Health Score
          </h2>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-[#6B7280]">
            {report.empty ? "Add holdings to score risk" : report.rating}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          aria-label={`Open portfolio health breakdown, score ${scoreLabel}`}
          className={`inline-flex flex-shrink-0 items-center gap-0.5 rounded-full border py-1 pl-2.5 pr-1.5 text-[11px] font-extrabold tabular-nums transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${badgeClass}`}
        >
          {scoreLabel}
          <ChevronRight size={12} aria-hidden="true" className="opacity-70" />
        </button>
      </div>

      {open && (
        <HealthBreakdownModal
          report={report}
          dialogId={dialogId}
          titleId={titleId}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
