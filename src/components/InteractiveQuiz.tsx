import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { GeminiCoachError, requestGeminiCoach } from "../lib/geminiCoach";
import type { AiScenarioDef, AiScenarioOption } from "../lib/lessonQuests";
import { firstNameOf, withEducationalDisclaimer, type SproutAiFinancialSnapshot } from "../lib/sproutAi";
import { isScenarioComplete, markScenarioComplete, SCENARIO_XP } from "../lib/userProgress";

const EMPTY_SNAPSHOT: SproutAiFinancialSnapshot = {
  userName: "Investor",
  cash: {
    liquidCash: 0,
    hysaCash: 0,
    safetyNetTotal: 0,
    safetyNetMonths: null,
    starterCashGoal: 3000,
    starterMonths: 3,
    recommendedMonths: 6,
    recommendedGoal: 6000,
  },
  debt: { total: 0, count: 0, highestApr: null, focusTitle: null, summary: "No debt snapshot loaded." },
  spending: {
    monthlyIncome: 0,
    monthlyExpenses: 0,
    netCashFlow: 0,
    isSurplus: true,
    categories: [],
    summary: "No spending snapshot loaded.",
  },
};

const STANCE_FALLBACK: Record<AiScenarioOption["stance"], string> = {
  hold: "Holding a written long-term plan through Mr. Market's mood swings is classic Graham — temporary price noise is not the same as permanent capital loss.",
  "buy-dip":
    "Buying a boring, diversified index on a schedule (especially after a dip) leans on Bogle and Graham: you purchase more ownership when prices are lower, without pretending you can time the bottom.",
  sell: "Selling a long-horizon plan because of a short headline usually locks in a paper loss — Graham warned that the investor's chief problem is likely themselves.",
  rebalance:
    "Rebalancing back to a written allocation is disciplined risk control — trim what ran hot, refill the core — not a prediction about next week.",
  speculate:
    "Chasing heat or concentrating in one story trades a margin of safety for excitement. Value-minded investors demand a business they understand at a sensible price.",
  plan: "A written rule (budget, match, shield, or automatic invest) beats a vibe. Philosophies from Graham to Bogle reward process over prediction.",
};

function localFeedback(option: AiScenarioOption, philosophies: string[]): string {
  const lens = philosophies.slice(0, 2).join(" · ") || "sound investing habits";
  return withEducationalDisclaimer(
    `Sprout take: ${STANCE_FALLBACK[option.stance]} Grounded in ${lens}.`
  );
}

type InteractiveQuizProps = {
  scenario: AiScenarioDef;
  userId?: string;
  userName?: string;
  accent?: string;
  onComplete?: (awardedXp: number) => void;
};

export default function InteractiveQuiz({
  scenario,
  userId,
  userName,
  accent = "#34D399",
  onComplete,
}: InteractiveQuizProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awarded, setAwarded] = useState(() => isScenarioComplete(scenario.id, userId));
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setFeedback(null);
    setLoading(false);
    setAwarded(isScenarioComplete(scenario.id, userId));
  }, [scenario.id, userId]);

  const finish = (option: AiScenarioOption, text: string) => {
    setFeedback(text);
    setLoading(false);
    let awardedXp = 0;
    if (!awarded) {
      markScenarioComplete(scenario.id, userId, SCENARIO_XP);
      setAwarded(true);
      awardedXp = SCENARIO_XP;
    }
    onComplete?.(awardedXp);
  };

  const pick = async (option: AiScenarioOption) => {
    if (loading || selectedId) return;
    setSelectedId(option.id);
    setLoading(true);
    setFeedback(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const name = firstNameOf(userName || "Investor");
    const conversation = [
      `Lesson micro-scenario for ${name}:`,
      scenario.scenario,
      `Question: ${scenario.question}`,
      `Learner chose: "${option.label}" (stance: ${option.stance}).`,
      `Respond as Sprout AI with 2–4 short sentences of educational feedback.`,
      `Ground the reply in: ${scenario.philosophies.join("; ")}.`,
      `Reference Benjamin Graham / value investing or other proven philosophies when relevant.`,
      `Do NOT give trade signals, tickers to buy/sell, or tax advice.`,
      `If the choice is weak, correct gently. If strong, reinforce why.`,
    ].join("\n");

    try {
      const text = await requestGeminiCoach(
        {
          snapshot: { ...EMPTY_SNAPSHOT, userName: name },
          conversation,
          portfolioContext: "Lesson micro-quiz — no live portfolio required.",
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      finish(option, withEducationalDisclaimer(text));
    } catch (error) {
      if (controller.signal.aborted) return;
      const fallback = localFeedback(option, scenario.philosophies);
      if (error instanceof GeminiCoachError && error.code === "rate_limit") {
        finish(option, withEducationalDisclaimer(`${fallback}\n\n(Sprout AI is busy — showing offline coaching.)`));
        return;
      }
      finish(option, fallback);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <span
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: `${accent}22`, color: accent }}
        >
          <Sparkles size={15} />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Sprout AI scenario</p>
          <p className="text-xs font-semibold text-slate-400">Real-world decision · instant coaching</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[#1F1F1F] bg-black/25 p-3">
        <p className="text-xs leading-relaxed text-slate-300">{scenario.scenario}</p>
      </div>
      <p className="mt-3 text-sm font-extrabold text-white">{scenario.question}</p>

      <div className="mt-3 space-y-2">
        {scenario.options.map((option) => {
          const chosen = selectedId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={Boolean(selectedId) || loading}
              onClick={() => void pick(option)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition active:scale-[0.99] disabled:cursor-default ${
                chosen
                  ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-50"
                  : "border-[#1F1F1F] bg-black/20 text-slate-200 hover:border-emerald-500/40"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300" role="status">
          <Loader2 size={14} className="animate-spin" />
          Sprout is coaching…
        </p>
      )}

      {feedback && (
        <div className="lesson-card-glow-ok mt-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3" role="status">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 size={16} />
            <p className="text-sm font-extrabold">Sprout AI feedback</p>
            {awarded && (
              <span className="ml-auto rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                +{SCENARIO_XP} XP
              </span>
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{feedback}</p>
        </div>
      )}
    </div>
  );
}
