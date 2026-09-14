import { Check, FlaskConical, Landmark, TrendingUp, Wallet } from "lucide-react";
import React, { useEffect, useState } from "react";
import {
  applyDemoScenario,
  DEMO_SCENARIO_APPLIED_EVENT,
  DEMO_SCENARIO_LIST,
  readActiveDemoScenario,
  type DemoScenarioId,
} from "../lib/demoScenarios";
import { formatNumber, toFiniteNumber } from "../lib/money";
import DemoAccountBuilder from "./DemoAccountBuilder";

type DemoScenarioSwitcherProps = {
  compact?: boolean;
  className?: string;
  onApplied?: (id: DemoScenarioId) => void;
};

function formatUsd(amount: unknown) {
  return `$${formatNumber(Math.round(toFiniteNumber(amount, 0)))}`;
}

export default function DemoScenarioSwitcher({
  compact = false,
  className = "",
  onApplied,
}: DemoScenarioSwitcherProps) {
  const [active, setActive] = useState<DemoScenarioId | null>(() => readActiveDemoScenario());

  useEffect(() => {
    const sync = (event?: Event) => {
      const id = (event as CustomEvent<{ id?: DemoScenarioId }> | undefined)?.detail?.id;
      setActive(id ?? readActiveDemoScenario());
    };
    window.addEventListener(DEMO_SCENARIO_APPLIED_EVENT, sync);
    return () => window.removeEventListener(DEMO_SCENARIO_APPLIED_EVENT, sync);
  }, []);

  const pick = (id: DemoScenarioId) => {
    applyDemoScenario(id);
    setActive(id);
    onApplied?.(id);
  };

  return (
    <section
      aria-label="Demo bank scenarios"
      className={`rounded-2xl border border-emerald-500/25 bg-[#0A0A0A] ${compact ? "p-3.5" : "p-4"} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">
            <FlaskConical size={12} />
            Demo Bank
          </p>
          <p className={`m-0 mt-1 font-semibold text-slate-400 ${compact ? "text-[11px]" : "text-xs"}`}>
            Switch mock profiles. Roadmap and Sprout AI update instantly.
          </p>
        </div>
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
        {DEMO_SCENARIO_LIST.map((scenario) => {
          const selected = active === scenario.id;
          const Icon =
            scenario.id === "starter" ? Wallet : scenario.id === "balanced" ? Landmark : TrendingUp;
          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => pick(scenario.id)}
              aria-pressed={selected}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                selected
                  ? "border-emerald-500/55 bg-emerald-500/12"
                  : "border-[#1F1F1F] bg-black/30 hover:border-emerald-500/30"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-white">
                  <Icon size={14} className={selected ? "text-emerald-300" : "text-slate-400"} />
                  {scenario.label}
                </span>
                {selected ? <Check size={14} className="text-emerald-400" /> : null}
              </span>
              <span className="mt-1 block text-[11px] font-semibold text-slate-400">{scenario.blurb}</span>
              <span className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                <span className="rounded-md bg-white/5 px-1.5 py-0.5">{formatUsd(scenario.cash)} cash</span>
                {scenario.hysa > 0 ? (
                  <span className="rounded-md bg-white/5 px-1.5 py-0.5">{formatUsd(scenario.hysa)} HYSA</span>
                ) : null}
                {scenario.investments > 0 ? (
                  <span className="rounded-md bg-white/5 px-1.5 py-0.5">
                    {formatUsd(scenario.investments)} stocks
                  </span>
                ) : null}
                {scenario.debts[0] ? (
                  <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-300">
                    {formatUsd(scenario.debts[0].balance)} debt
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <DemoAccountBuilder compact={compact} onApplied={onApplied} />
      </div>
    </section>
  );
}
