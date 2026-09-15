import { ArrowRight, PieChart, Sparkles, TrendingUp, Wallet, X } from "lucide-react";
import React, { useEffect, useMemo } from "react";
import {
  buildFinancialDiagnostics,
  tenYearWealthProjection,
  type FinancialDiagnostics,
} from "../lib/financialDiagnostics";
import { formatCurrency } from "../lib/money";
import { firstNameOf } from "../lib/sproutAi";
import { loadFinancialProfile } from "../lib/roadmapService";

export type OnboardingModalProps = {
  open: boolean;
  userName?: string;
  diagnostics?: FinancialDiagnostics | null;
  /** Optional brokerage diversification label from portfolio health. */
  diversificationLabel?: string | null;
  diversificationDetail?: string | null;
  onClose?: () => void;
  onExploreRoadmap?: () => void;
};

function money(value: number): string {
  return formatCurrency(value, { digits: 0 });
}

export default function OnboardingModal({
  open,
  userName = "there",
  diagnostics: diagnosticsProp,
  diversificationLabel,
  diversificationDetail,
  onClose,
  onExploreRoadmap,
}: OnboardingModalProps) {
  const diagnostics = useMemo(() => {
    if (diagnosticsProp) return diagnosticsProp;
    const profile = loadFinancialProfile();
    return buildFinancialDiagnostics({
      income: profile?.monthlyIncome,
      creditDebt: 0,
      profile: profile
        ? {
            monthlyIncome: profile.monthlyIncome,
            monthlyEssentialExpenses: profile.monthlyEssentialExpenses,
          }
        : null,
    });
  }, [diagnosticsProp]);

  const firstName = firstNameOf(userName);
  const target = diagnostics.recommendationTarget || diagnostics.topDiscretionary[0] || null;
  const suggestedCut = target ? Math.round(target.amount * 0.25) : Math.round(diagnostics.flexibleSpend * 0.2);
  const projection = useMemo(() => tenYearWealthProjection(Math.max(0, suggestedCut)), [suggestedCut]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const net = diagnostics.netCashFlow;
  const flowPhrase =
    net > 0
      ? `a surplus of ${money(net)}/mo`
      : net < 0
        ? `a deficit of ${money(Math.abs(net))}/mo`
        : "break-even cash flow";

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="matter-pop my-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sprout-welcome-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#1F1F1F] px-5 pt-5 pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-800 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]"
              aria-hidden
            >
              <Sparkles size={18} color="#ECFDF5" />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">
                Sprout AI
              </p>
              <h2 id="sprout-welcome-title" className="mt-1 text-lg font-extrabold tracking-tight text-white">
                Hi {firstName}, I analyzed your data!
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-[#1F1F1F] bg-[#121212] text-slate-200"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <p className="m-0 text-[14px] font-medium leading-relaxed text-slate-300">
            Here&apos;s a quick read on where you stand — educational only, not advice.
          </p>

          <div className="rounded-2xl border border-[#1F1F1F] bg-black/40 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
              <Wallet size={13} className="text-emerald-400" aria-hidden />
              Net cash flow
            </div>
            <p className="mt-2 mb-0 text-[14px] font-semibold leading-snug text-white">
              Income {money(diagnostics.income)} minus recurring expenses {money(diagnostics.recurringExpenses)}{" "}
              leaves you with{" "}
              <span className={net >= 0 ? "text-emerald-300" : "text-rose-300"}>{flowPhrase}</span>
              {diagnostics.creditDebt > 0
                ? `, with ${money(diagnostics.creditDebt)} in credit / revolving debt still in play.`
                : "."}
            </p>
          </div>

          <div className="rounded-2xl border border-[#1F1F1F] bg-black/40 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
              <Sparkles size={13} className="text-sky-300" aria-hidden />
              Flexible spend opportunity
            </div>
            <p className="mt-2 mb-0 text-[14px] font-semibold leading-snug text-white">
              {target ? (
                <>
                  Your biggest flexible line is <span className="text-sky-300">{target.label}</span> at{" "}
                  {money(target.amount)}/mo. Trimming about 25% ({money(suggestedCut)}/mo) is a realistic starter
                  cut.
                </>
              ) : (
                <>
                  I don&apos;t see a clear discretionary category yet — once spending syncs, I&apos;ll flag the best
                  trim target.
                </>
              )}
            </p>
          </div>

          {diversificationLabel ? (
            <div className="rounded-2xl border border-[#1F1F1F] bg-black/40 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                <PieChart size={13} className="text-violet-300" aria-hidden />
                Brokerage diversification
              </div>
              <p className="mt-2 mb-0 text-[14px] font-semibold leading-snug text-white">
                Portfolio read: <span className="text-violet-300">{diversificationLabel}</span>
                {diversificationDetail ? ` — ${diversificationDetail}` : "."}
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/12 to-transparent px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-emerald-400/90">
              <TrendingUp size={13} aria-hidden />
              10-year wealth illustration
            </div>
            <p className="mt-2 mb-0 text-[14px] font-semibold leading-snug text-emerald-50">
              {suggestedCut > 0 ? (
                <>
                  If that {money(suggestedCut)}/mo were invested instead, a ~8–10% educational illustration grows to
                  roughly {money(projection.at8)}–{money(projection.at10)} over 10 years (
                  {money(projection.totalContributed)} contributed).
                </>
              ) : (
                <>
                  Connect spending data or pick a cutback in your roadmap to unlock a personalized compounding
                  illustration.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="border-t border-[#1F1F1F] px-5 py-4">
          <button
            type="button"
            onClick={onExploreRoadmap}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-extrabold text-[#042F2E] shadow-[0_10px_28px_rgba(16,185,129,0.22)] transition hover:bg-emerald-400"
          >
            Explore My Personal Roadmap
            <ArrowRight size={16} strokeWidth={2.75} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-xl px-4 py-2.5 text-[12px] font-bold text-slate-500 transition hover:text-slate-300"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
