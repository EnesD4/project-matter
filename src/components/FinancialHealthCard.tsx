import React, { useEffect, useId, useMemo, useState } from "react";
import { Activity, ChevronRight, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import {
  buildFinancialDiagnostics,
  tenYearWealthProjection,
  type FinancialDiagnostics,
  type FinancialDiagnosticsInput,
  type RankedDiscretionaryCategory,
} from "../lib/financialDiagnostics";
import { formatCurrency, toFiniteNumber } from "../lib/money";
import { privacyMoney } from "../lib/privacy";
import { categoryIcon } from "../lib/categoryIcons";

export type FinancialHealthCardProps = {
  /** Precomputed diagnostics; when omitted, built from `diagnosticsInput`. */
  diagnostics?: FinancialDiagnostics | null;
  diagnosticsInput?: FinancialDiagnosticsInput;
  privacyMode?: boolean;
  /** Optional AI blurb from Gemini (already generated). */
  insight?: string | null;
  className?: string;
};

function money(privacyMode: boolean, value: number): string {
  return privacyMoney(privacyMode, value, 0);
}

function sourceLabel(source: FinancialDiagnostics["source"]): string {
  if (source === "plaid") return "Live from Plaid";
  if (source === "profile") return "From your profile";
  if (source === "mixed") return "Plaid + profile";
  return "Add income or bank link";
}

function FlowTone({
  isSurplus,
  empty,
}: {
  isSurplus: boolean;
  empty: boolean;
}): { chip: string; value: string; Icon: LucideIcon } {
  if (empty) {
    return { chip: "border-[#1F2937] bg-[#0A0A0A] text-[#9CA3AF]", value: "#9CA3AF", Icon: Activity };
  }
  if (isSurplus) {
    return {
      chip: "border-emerald-500/35 bg-emerald-500/12 text-emerald-300",
      value: "#34D399",
      Icon: TrendingUp,
    };
  }
  return {
    chip: "border-rose-500/35 bg-rose-500/12 text-rose-300",
    value: "#FB7185",
    Icon: Activity,
  };
}

function CategoryToggle({
  item,
  selected,
  onSelect,
  privacyMode,
}: {
  item: RankedDiscretionaryCategory;
  selected: boolean;
  onSelect: () => void;
  privacyMode: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-w-0 flex-1 flex-col gap-1 rounded-xl border px-2.5 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
        selected
          ? "border-sky-400/45 bg-sky-500/15 text-white"
          : "border-[#1F2937] bg-[#0A0A0A] text-[#D1D5DB] hover:border-[#374151]"
      }`}
    >
      <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#9CA3AF]">
        <span className="text-sky-300/90" aria-hidden>
          {categoryIcon(item.label, 12)}
        </span>
        <span className="truncate">{item.label}</span>
      </span>
      <span className="text-[13px] font-extrabold tabular-nums text-white">
        {money(privacyMode, item.amount)}
        <span className="ml-0.5 text-[10px] font-semibold text-[#6B7280]">/mo</span>
      </span>
    </button>
  );
}

export default function FinancialHealthCard({
  diagnostics: diagnosticsProp,
  diagnosticsInput,
  privacyMode = false,
  insight = null,
  className = "",
}: FinancialHealthCardProps) {
  const sliderId = useId();
  const diagnostics = useMemo(() => {
    if (diagnosticsProp) return diagnosticsProp;
    return buildFinancialDiagnostics(diagnosticsInput || {});
  }, [diagnosticsProp, diagnosticsInput]);

  const [selectedId, setSelectedId] = useState<string | null>(
    diagnostics.recommendationTarget?.id ?? diagnostics.topDiscretionary[0]?.id ?? null
  );
  const [cutPct, setCutPct] = useState(25);

  useEffect(() => {
    const nextId =
      diagnostics.recommendationTarget?.id ?? diagnostics.topDiscretionary[0]?.id ?? null;
    setSelectedId((prev) => {
      if (prev && diagnostics.topDiscretionary.some((item) => item.id === prev)) return prev;
      return nextId;
    });
  }, [diagnostics.recommendationTarget?.id, diagnostics.topDiscretionary]);

  const selected =
    diagnostics.topDiscretionary.find((item) => item.id === selectedId) ||
    diagnostics.recommendationTarget ||
    diagnostics.topDiscretionary[0] ||
    null;

  const monthlyCut = useMemo(() => {
    if (!selected) return 0;
    const pct = Math.min(100, Math.max(0, cutPct));
    return Math.round(selected.amount * (pct / 100) * 100) / 100;
  }, [selected, cutPct]);

  const projection = useMemo(() => tenYearWealthProjection(monthlyCut), [monthlyCut]);
  const empty = diagnostics.source === "empty" && diagnostics.income <= 0 && diagnostics.recurringExpenses <= 0;
  const tone = FlowTone({ isSurplus: diagnostics.isSurplus, empty });
  const ToneIcon = tone.Icon;

  return (
    <section
      className={`rounded-2xl border border-[#1F2937] bg-[#000000] p-4 ${className}`.trim()}
      aria-label="Financial health diagnostics"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">
            <Sparkles size={12} className="text-sky-300" aria-hidden />
            Financial Diagnostics
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-[#6B7280]">{sourceLabel(diagnostics.source)}</p>
        </div>
        <span
          className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${tone.chip}`}
        >
          <ToneIcon size={11} aria-hidden />
          {empty ? "Waiting" : diagnostics.isSurplus ? "Surplus" : "Deficit"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-[#1F2937] bg-[#0A0A0A] px-3 py-2.5">
          <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">Income</p>
          <p className="mt-1 mb-0 text-[15px] font-extrabold tabular-nums text-emerald-300">
            {money(privacyMode, diagnostics.income)}
          </p>
        </div>
        <div className="rounded-xl border border-[#1F2937] bg-[#0A0A0A] px-3 py-2.5">
          <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">Expenses</p>
          <p className="mt-1 mb-0 text-[15px] font-extrabold tabular-nums text-rose-300">
            {money(privacyMode, diagnostics.recurringExpenses)}
          </p>
        </div>
        <div className="rounded-xl border border-[#1F2937] bg-[#0A0A0A] px-3 py-2.5">
          <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">Net cash flow</p>
          <p className="mt-1 mb-0 text-[15px] font-extrabold tabular-nums" style={{ color: tone.value }}>
            {empty
              ? "—"
              : `${diagnostics.netCashFlow >= 0 ? "+" : "−"}${money(privacyMode, Math.abs(diagnostics.netCashFlow))}`}
          </p>
        </div>
        <div className="rounded-xl border border-[#1F2937] bg-[#0A0A0A] px-3 py-2.5">
          <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">Credit debt</p>
          <p className="mt-1 mb-0 text-[15px] font-extrabold tabular-nums text-amber-200">
            {money(privacyMode, diagnostics.creditDebt)}
          </p>
        </div>
      </div>

      {!empty && diagnostics.topDiscretionary.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">
              Top flexible spend to trim
            </p>
            <p className="m-0 text-[10px] font-semibold text-[#6B7280]">
              Flexible {money(privacyMode, diagnostics.discretionarySpend + diagnostics.flexibleSpend)}/mo
            </p>
          </div>
          <div className="flex gap-2">
            {diagnostics.topDiscretionary.map((item) => (
              <CategoryToggle
                key={item.id}
                item={item}
                selected={selected?.id === item.id}
                onSelect={() => setSelectedId(item.id)}
                privacyMode={privacyMode}
              />
            ))}
          </div>
        </div>
      )}

      {selected && !empty && (
        <div className="mt-4 rounded-xl border border-sky-500/20 bg-gradient-to-b from-sky-500/10 to-transparent px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-extrabold text-white">
                Cut {selected.label}?
              </p>
              <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[#9CA3AF]">
                Slide to choose a monthly cutback, then see a 10-year compounding illustration if that
                amount were invested at ~8–10%.
              </p>
            </div>
            <p className="m-0 flex-shrink-0 text-right text-[15px] font-extrabold tabular-nums text-sky-300">
              {money(privacyMode, monthlyCut)}
              <span className="block text-[10px] font-semibold text-[#6B7280]">/mo saved</span>
            </p>
          </div>

          <label htmlFor={sliderId} className="mt-3 block">
            <span className="sr-only">
              Percent of {selected.label} to cut, currently {cutPct} percent
            </span>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              step={5}
              value={cutPct}
              onChange={(event) => setCutPct(toFiniteNumber(event.target.value, 0))}
              className="matter-diag-slider w-full accent-sky-400"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={cutPct}
              aria-valuetext={`${cutPct}% of ${selected.label}, ${formatCurrency(monthlyCut, { digits: 0 })} per month`}
            />
            <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">
              <span>0%</span>
              <span>{cutPct}% cut</span>
              <span>100%</span>
            </div>
          </label>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-[#1F2937] bg-black/40 px-2.5 py-2">
              <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-[#6B7280]">At 8%</p>
              <p className="mt-1 mb-0 text-[13px] font-extrabold tabular-nums text-emerald-300">
                {money(privacyMode, projection.at8)}
              </p>
            </div>
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-2">
              <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-sky-300/80">At 9%</p>
              <p className="mt-1 mb-0 text-[13px] font-extrabold tabular-nums text-white">
                {money(privacyMode, projection.at9)}
              </p>
            </div>
            <div className="rounded-lg border border-[#1F2937] bg-black/40 px-2.5 py-2">
              <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-[#6B7280]">At 10%</p>
              <p className="mt-1 mb-0 text-[13px] font-extrabold tabular-nums text-emerald-300">
                {money(privacyMode, projection.at10)}
              </p>
            </div>
          </div>
          <p className="mt-2 mb-0 text-[10px] font-semibold leading-snug text-[#6B7280]">
            10-year illustration · {money(privacyMode, projection.totalContributed)} contributed · educational
            only, not advice
          </p>
        </div>
      )}

      {insight ? (
        <p className="mt-3 mb-0 flex gap-2 text-[12px] leading-relaxed text-[#D1D5DB]">
          <ChevronRight size={14} className="mt-0.5 flex-shrink-0 text-sky-400" aria-hidden />
          <span>{insight}</span>
        </p>
      ) : null}

      {empty ? (
        <p className="mt-3 mb-0 text-[12px] font-semibold leading-relaxed text-[#6B7280]">
          Connect a bank with Plaid or add monthly income and expenses to unlock live diagnostics and
          cutback projections.
        </p>
      ) : null}
    </section>
  );
}
