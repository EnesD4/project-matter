import { Check, Rocket, TrendingUp } from "lucide-react";
import React, { useMemo } from "react";
import { monthlyCompoundFuture, type PracticalQuestDef } from "../lib/lessonQuests";
import { formatNumber } from "../lib/money";
import { isQuestComplete, QUEST_XP } from "../lib/userProgress";

function formatUsd(value: number): string {
  return formatNumber(value, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

type PracticalQuestProps = {
  quest: PracticalQuestDef;
  userId?: string;
  accent?: string;
  onExecute: (quest: PracticalQuestDef) => void;
  onSkip?: () => void;
};

export default function PracticalQuest({
  quest,
  userId,
  accent = "#22D3EE",
  onExecute,
  onSkip,
}: PracticalQuestProps) {
  const done = isQuestComplete(quest.id, userId);
  const impact = useMemo(() => {
    if (!quest.monthlyAmount) return null;
    return monthlyCompoundFuture(quest.monthlyAmount, quest.years ?? 20, quest.annualReturn ?? 0.07);
  }, [quest.annualReturn, quest.monthlyAmount, quest.years]);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <span
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: `${accent}22`, color: accent }}
        >
          <Rocket size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
            {quest.title}
          </p>
          <p className="text-xs font-semibold text-slate-400">Turn the lesson into a move</p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          +{QUEST_XP} XP
        </span>
      </div>

      <div
        className="mt-3 rounded-xl border p-3"
        style={{ borderColor: `${accent}40`, background: `${accent}12` }}
      >
        <p className="text-sm leading-relaxed text-slate-100">{quest.blurb}</p>

        {impact && quest.monthlyAmount && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
              <TrendingUp size={12} />
              Simulated impact · {quest.years ?? 20} yrs @ {((quest.annualReturn ?? 0.07) * 100).toFixed(0)}%
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[9px] font-semibold uppercase text-slate-500">Monthly</p>
                <p className="text-xs font-extrabold text-white">{formatUsd(quest.monthlyAmount)}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase text-slate-500">You put in</p>
                <p className="text-xs font-extrabold text-white">{formatUsd(impact.invested)}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase text-slate-500">Projected</p>
                <p className="text-xs font-extrabold text-emerald-300">{formatUsd(impact.projected)}</p>
              </div>
            </div>
            {quest.symbol && (
              <p className="mt-2 text-center text-[10px] font-semibold text-slate-400">
                Paper habit ticker · {quest.symbol}
                {quest.description ? ` · ${quest.description}` : ""}
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => onExecute(quest)}
          disabled={done && quest.kind === "checklist"}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.99] disabled:opacity-70"
          style={{ background: accent, color: "#042F2E" }}
        >
          {done && quest.kind === "checklist" ? (
            <>
              <Check size={15} />
              Quest complete
            </>
          ) : (
            quest.actionLabel
          )}
        </button>

        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-2 w-full text-center text-[11px] font-semibold text-slate-500 transition hover:text-slate-300"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}
