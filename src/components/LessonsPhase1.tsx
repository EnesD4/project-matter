import React, { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  CreditCard,
  Flame,
  HelpCircle,
  Lightbulb,
  Lock,
  LucideIcon,
  ShieldCheck,
  Star,
  Swords,
  Trophy,
  X,
  XCircle,
} from "lucide-react";

type ModuleId = "cashflow" | "credit" | "debt-battles" | "emergency-fund";

type QuizOption = {
  id: string;
  label: string;
  correct: boolean;
  explanation: string;
};

type QuizQuestion = {
  scenario: string;
  question: string;
  options: QuizOption[];
};

type KnowledgeCard = {
  title: string;
  body: string;
};

type LessonModuleDef = {
  id: ModuleId;
  index: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
  knowledge: KnowledgeCard;
  quiz: [QuizQuestion, QuizQuestion];
  actionCard: string;
  xpReward: number;
};

const MODULES: LessonModuleDef[] = [
  {
    id: "cashflow",
    index: 1,
    title: "Module 1: Mapping Your Money",
    subtitle: "Cash Flow & Income vs. Expenses",
    icon: Compass,
    accent: "#10B981",
    knowledge: {
      title: "What is Cash Flow?",
      body: "Cash flow is simply: Income − Expenses = What's Left. If that number is positive, you have room to save or pay down debt. If it's negative, you're spending more than you earn — and that gap usually gets covered by debt. Tracking it every month is the first step to taking control of your money.",
    },
    quiz: [
      {
        scenario:
          "Maya earns $3,000 a month. Her rent is $1,200, bills are $400, groceries are $600, and she spends $500 going out.",
        question: "What is Maya's monthly cash flow, and what does it tell her?",
        options: [
          {
            id: "a",
            label: "+$300 — she has a positive cash flow",
            correct: true,
            explanation:
              "$3,000 − ($1,200 + $400 + $600 + $500) = $300. A positive cash flow means she's earning more than she spends — that extra $300 can go toward debt payoff or savings.",
          },
          {
            id: "b",
            label: "−$300 — she's running a deficit",
            correct: false,
            explanation:
              "Subtract her expenses from her income again: she actually has $300 left over, not a deficit.",
          },
          {
            id: "c",
            label: "$3,000 — as if she spent nothing",
            correct: false,
            explanation: "Cash flow means income minus ALL expenses, not just the income by itself.",
          },
        ],
      },
      {
        scenario: "Maya wants to save $1,800 for a trip in 6 months, using only her leftover cash flow.",
        question: "At her current $300/month cash flow, will she hit her goal?",
        options: [
          {
            id: "a",
            label: "Yes — $300 × 6 months = $1,800, right on target",
            correct: true,
            explanation:
              "$300 × 6 = $1,800 exactly. If she keeps her spending steady, she's on pace — no changes needed.",
          },
          {
            id: "b",
            label: "No — she needs to cut $100/month more",
            correct: false,
            explanation: "Do the math again: $300 × 6 = $1,800, which already matches her goal.",
          },
          {
            id: "c",
            label: "It doesn't matter — she should just use a credit card",
            correct: false,
            explanation: "Charging the trip means paying interest later — better to reach the goal with cash she already has.",
          },
        ],
      },
    ],
    actionCard: "Today, write down everything you earned and spent this month — even loosely. See what your real cash flow number is.",
    xpReward: 30,
  },
  {
    id: "credit",
    index: 2,
    title: "Module 2: The Credit Score Game",
    subtitle: "FICO 101, APR & Credit Utilization",
    icon: CreditCard,
    accent: "#3B82F6",
    knowledge: {
      title: "How APR Quietly Grows Your Balance",
      body: "APR (Annual Percentage Rate) is the yearly cost of carrying a balance, but it's charged monthly. Carry $1,000 at 24% APR and that's roughly 2% a month — about $20 added to your balance before you even make a payment. Two habits move your FICO score the most: paying on time, and keeping your credit utilization (balance ÷ limit) under 30%.",
    },
    quiz: [
      {
        scenario: "Alex has a $10,000 credit limit and carries an $8,000 balance, but always pays on time.",
        question: "What's most likely to boost Alex's FICO score fastest?",
        options: [
          {
            id: "a",
            label: "Paying down the balance to get utilization under 30%",
            correct: true,
            explanation:
              "Alex's utilization is 80% — way too high. Getting the balance under $3,000 (30% of $10,000) is one of the fastest ways to raise a score.",
          },
          {
            id: "b",
            label: "Closing the card since it's almost maxed out",
            correct: false,
            explanation:
              "Closing a card lowers your total available credit, which can actually push utilization higher and hurt your score.",
          },
          {
            id: "c",
            label: "Applying for a second credit card immediately",
            correct: false,
            explanation: "A new application triggers a hard inquiry, which can ding your score short-term.",
          },
        ],
      },
      {
        scenario: "Alex's card charges 24% APR. He carries that $8,000 balance and only pays the $160 minimum payment each month.",
        question: "What happens to Alex's balance if he keeps paying only the minimum?",
        options: [
          {
            id: "a",
            label: "It barely shrinks — most of the payment covers interest, not the balance",
            correct: true,
            explanation:
              "At 24% APR, $8,000 accrues about $160/month in interest alone. Paying just the minimum means he's mostly treading water.",
          },
          {
            id: "b",
            label: "It disappears within a year automatically",
            correct: false,
            explanation: "Balances don't vanish — without extra payments above the minimum, high-APR debt can take years to clear.",
          },
          {
            id: "c",
            label: "APR doesn't matter as long as he pays on time",
            correct: false,
            explanation: "APR charges interest regardless of whether you pay on time — paying on time protects your score, not your balance.",
          },
        ],
      },
    ],
    actionCard: "Check your credit card statement for your current APR and utilization (balance ÷ limit). Is your utilization under 30%?",
    xpReward: 30,
  },
  {
    id: "debt-battles",
    index: 3,
    title: "Module 3: Debt Wars",
    subtitle: "Snowball vs. Avalanche Strategies",
    icon: Swords,
    accent: "#F59E0B",
    knowledge: {
      title: "Snowball vs. Avalanche",
      body: "Both strategies have you pay minimums on everything, then throw extra cash at one target debt. Snowball targets the smallest balance first — fast wins that build motivation. Avalanche targets the highest interest rate first — the mathematically optimal path that saves the most money. Neither is \"wrong\"; pick the one you'll actually stick with.",
    },
    quiz: [
      {
        scenario: "John has $5,000 in credit card debt at 22% APR and $1,000 in student loan debt at 4% APR.",
        question: "Which method saves John the most money in total interest?",
        options: [
          {
            id: "a",
            label: "Avalanche — pay off the 22% APR debt first",
            correct: true,
            explanation:
              "Avalanche targets the highest interest rate first, which is mathematically optimal and minimizes total interest paid over time.",
          },
          {
            id: "b",
            label: "Snowball — pay off the $1,000 loan first",
            correct: false,
            explanation:
              "Snowball feels motivating since the small balance disappears fast, but that 22% APR debt keeps racking up interest while it waits.",
          },
          {
            id: "c",
            label: "They save the exact same amount",
            correct: false,
            explanation: "Since the interest rates are so different (22% vs. 4%), the order you pay them off in changes your total interest significantly.",
          },
        ],
      },
      {
        scenario: "John decides to pay off his student loan first (Snowball) instead of the credit card.",
        question: "What's the real trade-off he's making?",
        options: [
          {
            id: "a",
            label: "A fast psychological win, but more total interest paid",
            correct: true,
            explanation:
              "Snowball isn't \"wrong\" — the quick win keeps many people motivated to keep going. The trade-off is a higher total interest cost compared to Avalanche.",
          },
          {
            id: "b",
            label: "He actually saves more money than Avalanche would",
            correct: false,
            explanation: "Since the credit card's 22% APR is much higher, delaying it costs more in interest, not less.",
          },
          {
            id: "c",
            label: "There's no trade-off at all",
            correct: false,
            explanation: "Every extra month the 22% APR debt lingers, it accrues more interest than the 4% loan would.",
          },
        ],
      },
    ],
    actionCard: "Pull up your credit card statement today and write down your highest-APR balance. That's your Avalanche target.",
    xpReward: 35,
  },
  {
    id: "emergency-fund",
    index: 4,
    title: "Module 4: The Safety Net",
    subtitle: "Emergency Fund Essentials",
    icon: ShieldCheck,
    accent: "#8B5CF6",
    knowledge: {
      title: "Why 3–6 Months?",
      body: "An emergency fund is cash set aside for the unexpected — job loss, medical bills, car repairs — so a surprise expense doesn't turn into new debt. Most experts recommend saving 3 to 6 months of essential expenses (rent, food, utilities — not takeout). It's not about being rich; it's about buying yourself time when life gets messy.",
    },
    quiz: [
      {
        scenario: "Zoe's essential monthly expenses are $2,000. She currently has $2,000 saved.",
        question: "What should Zoe's emergency fund target be?",
        options: [
          {
            id: "a",
            label: "$6,000 – $12,000 (3–6 months of expenses)",
            correct: true,
            explanation:
              "3–6 months of essential expenses gives Zoe a real cushion if she loses income or faces a big unexpected cost.",
          },
          {
            id: "b",
            label: "$2,000 is already enough",
            correct: false,
            explanation: "One month covers a small hiccup, but most financial emergencies (like job loss) last longer than that.",
          },
          {
            id: "c",
            label: "$20,000 (10 months of expenses)",
            correct: false,
            explanation: "That's overly cautious — money beyond 6 months is usually better off invested or growing elsewhere.",
          },
        ],
      },
      {
        scenario: "Zoe gets a $1,000 bonus at work.",
        question: "What's the smartest first move for that bonus, given she's still building her emergency fund?",
        options: [
          {
            id: "a",
            label: "Add it to her emergency fund until she hits 3–6 months",
            correct: true,
            explanation:
              "Until your safety net is fully funded, extra cash is best used to close that gap — it protects you from going into debt later.",
          },
          {
            id: "b",
            label: "Invest all of it in stocks right away",
            correct: false,
            explanation: "Investments can lose value short-term — not ideal for money you might need on short notice.",
          },
          {
            id: "c",
            label: "Spend it since it's \"bonus\" money",
            correct: false,
            explanation: "Bonus money is still money — it can meaningfully speed up reaching your safety net goal.",
          },
        ],
      },
    ],
    actionCard: "Calculate your essential monthly expenses and multiply by 3 to find your emergency fund starter goal.",
    xpReward: 35,
  },
];

type PhaseId = "phase-1" | "phase-2";

type PhaseDef = {
  id: PhaseId;
  title: string;
  subtitle: string;
  locked?: boolean;
};

const PHASES: PhaseDef[] = [
  { id: "phase-1", title: "Phase 1: Put Out the Fire", subtitle: "Core Literacy & Debt Basics" },
  { id: "phase-2", title: "Phase 2: Build Momentum", subtitle: "Coming soon — unlocks after Phase 1", locked: true },
];

type Phase = "knowledge" | "q1" | "q1-feedback" | "q2" | "q2-feedback" | "complete";

type Answer = { optionId: string; correct: boolean };

export default function LessonsPhase1() {
  const [completed, setCompleted] = useState<Record<ModuleId, boolean>>({
    cashflow: false,
    credit: false,
    "debt-battles": false,
    "emergency-fund": false,
  });
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);

  const [activeModuleId, setActiveModuleId] = useState<ModuleId | null>(null);
  const [phase, setPhase] = useState<Phase>("knowledge");
  const [answer1, setAnswer1] = useState<Answer | null>(null);
  const [answer2, setAnswer2] = useState<Answer | null>(null);

  // Accordion: the current active (next-up) module starts expanded; others start collapsed.
  const [expandedModuleId, setExpandedModuleId] = useState<ModuleId | null>(MODULES[0]?.id ?? null);

  // Accordion: Phase 1 starts expanded; future phases start collapsed.
  const [expandedPhaseId, setExpandedPhaseId] = useState<PhaseId | null>("phase-1");

  const completedCount = MODULES.filter((m) => completed[m.id]).length;
  const phasePct = Math.round((completedCount / MODULES.length) * 100);

  const isUnlocked = (index: number) => index === 0 || completed[MODULES[index - 1].id];

  const activeModule = useMemo(
    () => MODULES.find((m) => m.id === activeModuleId) ?? null,
    [activeModuleId]
  );

  const stepIndex =
    phase === "knowledge" ? 0 : phase === "q1" || phase === "q1-feedback" ? 1 : phase === "q2" || phase === "q2-feedback" ? 2 : 3;

  const openModule = (moduleDef: LessonModuleDef, index: number) => {
    if (!isUnlocked(index)) return;
    setActiveModuleId(moduleDef.id);
    setPhase("knowledge");
    setAnswer1(null);
    setAnswer2(null);
  };

  const closeModal = () => {
    setActiveModuleId(null);
  };

  const toggleExpand = (id: ModuleId, unlocked: boolean) => {
    if (!unlocked) return;
    setExpandedModuleId((prev) => (prev === id ? null : id));
  };

  const togglePhase = (id: PhaseId, locked?: boolean) => {
    if (locked) return;
    setExpandedPhaseId((prev) => (prev === id ? null : id));
  };

  const selectOption = (questionNumber: 1 | 2, option: QuizOption) => {
    const result: Answer = { optionId: option.id, correct: option.correct };
    if (questionNumber === 1) {
      setAnswer1(result);
      setPhase("q1-feedback");
    } else {
      setAnswer2(result);
      setPhase("q2-feedback");
    }
  };

  const finishModule = () => {
    if (!activeModule) return;
    const correctCount = (answer1?.correct ? 1 : 0) + (answer2?.correct ? 1 : 0);
    const bonus = correctCount * 10;
    setXp((prev) => prev + activeModule.xpReward + bonus);
    setStreak((prev) => prev + 1);
    setCompleted((prev) => ({ ...prev, [activeModule.id]: true }));

    // Auto-advance the accordion to the next module so it becomes the new "active" one.
    const currentIdx = MODULES.findIndex((m) => m.id === activeModule.id);
    const nextModule = MODULES[currentIdx + 1];
    setExpandedModuleId(nextModule ? nextModule.id : activeModule.id);

    closeModal();
  };

  const correctCount = (answer1?.correct ? 1 : 0) + (answer2?.correct ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
            <Star size={16} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Daily XP Earned</p>
            <p className="text-base font-extrabold leading-tight text-white">{xp} XP</p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-300">
          <span aria-hidden="true">🔥</span>
          {streak}-day streak
        </div>
      </div>

      {PHASES.map((phaseDef) => {
        const isPhase1 = phaseDef.id === "phase-1";
        const phaseExpanded = expandedPhaseId === phaseDef.id;

        return (
          <div
            key={phaseDef.id}
            className={`overflow-hidden rounded-2xl border transition-colors ${
              phaseDef.locked
                ? "border-[#1F1F1F]/60 bg-[#0A0A0A]/50"
                : "border-[#1F1F1F] bg-gradient-to-br from-orange-500/10 via-[#0A0A0A] to-[#0A0A0A]"
            }`}
          >
            <button
              type="button"
              onClick={() => togglePhase(phaseDef.id, phaseDef.locked)}
              disabled={phaseDef.locked}
              aria-expanded={phaseExpanded}
              className={`flex w-full items-start justify-between gap-3 p-4 text-left sm:p-5 ${
                phaseDef.locked ? "cursor-default opacity-60" : "cursor-pointer"
              }`}
            >
              <div>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wider ${
                    phaseDef.locked ? "text-slate-500" : "text-orange-400"
                  }`}
                >
                  {phaseDef.title}
                </p>
                <h2 className="mt-1 text-lg font-extrabold tracking-tight text-white">{phaseDef.subtitle}</h2>
                {isPhase1 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {completedCount} / {MODULES.length} modules completed
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <div
                  className={`grid h-11 w-11 place-items-center rounded-xl ${
                    phaseDef.locked ? "bg-black/20 text-slate-500" : "bg-orange-500/15 text-orange-400"
                  }`}
                >
                  {phaseDef.locked ? <Lock size={18} /> : <Flame size={22} />}
                </div>
                {!phaseDef.locked &&
                  (phaseExpanded ? (
                    <ChevronUp size={18} className="text-slate-400 transition-transform duration-300" />
                  ) : (
                    <ChevronDown size={18} className="text-slate-400 transition-transform duration-300" />
                  ))}
              </div>
            </button>

            {isPhase1 && (
              <div className="px-4 pb-4 sm:px-5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${phasePct}%` }}
                  />
                </div>
              </div>
            )}

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                phaseExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="space-y-3 px-4 pb-4 sm:px-5">
                {isPhase1 ? (
                  MODULES.map((moduleDef, idx) => {
                    const unlocked = isUnlocked(idx);
                    const done = completed[moduleDef.id];
                    const Icon = moduleDef.icon;
                    const pct = done ? 100 : 0;
                    const expanded = expandedModuleId === moduleDef.id;

                    return (
                      <div
                        key={moduleDef.id}
                        className={`rounded-2xl border transition-colors ${
                          unlocked ? "border-[#1F1F1F] bg-[#0A0A0A]" : "border-[#1F1F1F]/60 bg-[#0A0A0A]/50 opacity-60"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleExpand(moduleDef.id, unlocked)}
                          disabled={!unlocked}
                          aria-expanded={expanded}
                          className={`flex w-full items-start justify-between gap-3 p-4 pb-0 text-left ${
                            unlocked ? "cursor-pointer" : "cursor-default"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl"
                              style={{ background: `${moduleDef.accent}26`, color: moduleDef.accent }}
                            >
                              {done ? <CheckCircle2 size={20} /> : unlocked ? <Icon size={20} /> : <Lock size={18} />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold leading-snug text-white">{moduleDef.title}</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">{moduleDef.subtitle}</p>
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 flex-col items-end gap-2">
                            <span
                              className="rounded-full px-2 py-1 text-[10px] font-bold"
                              style={{ background: `${moduleDef.accent}22`, color: moduleDef.accent }}
                            >
                              +{moduleDef.xpReward} XP
                            </span>
                            {unlocked &&
                              (expanded ? (
                                <ChevronUp size={16} className="text-slate-500 transition-transform duration-300" />
                              ) : (
                                <ChevronDown size={16} className="text-slate-500 transition-transform duration-300" />
                              ))}
                          </div>
                        </button>

                        <div className="px-4 pt-3">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/30">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: moduleDef.accent }}
                            />
                          </div>
                          <p className="mt-1.5 pb-3 text-[11px] font-semibold text-slate-400">
                            {done ? "Completed ✓" : unlocked ? "Start → 3 min" : "Complete the previous module"}
                          </p>
                        </div>

                        <div
                          className={`overflow-hidden transition-all duration-300 ease-in-out ${
                            expanded ? "max-h-[480px] opacity-100" : "max-h-0 opacity-0"
                          }`}
                        >
                          <div className="space-y-3 border-t border-[#1F1F1F] px-4 py-3">
                            <div className="flex items-start gap-2">
                              <Lightbulb size={13} className="mt-0.5 flex-shrink-0 text-amber-400" />
                              <p className="text-[11px] leading-relaxed text-slate-400">{moduleDef.knowledge.title}</p>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <HelpCircle size={12} /> 2 scenario questions
                              </span>
                              <span className="flex items-center gap-1">
                                <Trophy size={12} /> +{moduleDef.xpReward} XP
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openModule(moduleDef, idx)}
                              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                            >
                              {done ? "Review Lesson" : "Start Lesson"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-2 text-center text-[11px] font-semibold text-slate-500">
                    New modules unlock here once you complete Phase 1. 🚀
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {activeModule && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/75 p-4 sm:items-center"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="matter-pop w-full max-w-sm rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lesson-modal-title"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="grid h-9 w-9 place-items-center rounded-lg"
                  style={{ background: `${activeModule.accent}26`, color: activeModule.accent }}
                >
                  <activeModule.icon size={17} />
                </span>
                <h3 id="lesson-modal-title" className="text-sm font-extrabold leading-snug text-white">
                  {activeModule.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="text-slate-400 transition hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              {["Concept", "Q1", "Q2", "Reward"].map((label, i) => (
                <span
                  key={label}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    i <= stepIndex ? "bg-emerald-500" : "bg-black/30"
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>

            {phase === "knowledge" && (
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-400">
                    <Lightbulb size={14} />
                  </span>
                  <p className="text-sm font-bold text-white">{activeModule.knowledge.title}</p>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-slate-300">{activeModule.knowledge.body}</p>

                <button
                  type="button"
                  onClick={() => setPhase("q1")}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                >
                  Let's Practice
                </button>
              </div>
            )}

            {(phase === "q1" || phase === "q1-feedback") && (
              <QuestionStep
                quiz={activeModule.quiz[0]}
                phase={phase === "q1" ? "question" : "feedback"}
                answer={answer1}
                onSelect={(option) => selectOption(1, option)}
                onContinue={() => setPhase("q2")}
                continueLabel="Next Question →"
              />
            )}

            {(phase === "q2" || phase === "q2-feedback") && (
              <QuestionStep
                quiz={activeModule.quiz[1]}
                phase={phase === "q2" ? "question" : "feedback"}
                answer={answer2}
                onSelect={(option) => selectOption(2, option)}
                onContinue={() => setPhase("complete")}
                continueLabel="See Your Reward"
              />
            )}

            {phase === "complete" && (
              <div className="mt-4">
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <Trophy size={16} className="text-amber-400" />
                  <p className="text-xs font-bold text-amber-300">
                    +{activeModule.xpReward} XP earned
                    {correctCount > 0 ? ` + ${correctCount * 10} Bonus XP (${correctCount}/2 correct!)` : ""}
                  </p>
                </div>

                <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Real-World Action
                </p>
                <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-sm leading-relaxed text-emerald-100">{activeModule.actionCard}</p>
                </div>

                <button
                  type="button"
                  onClick={finishModule}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                >
                  <Check size={15} />
                  Complete Challenge
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionStep({
  quiz,
  phase,
  answer,
  onSelect,
  onContinue,
  continueLabel,
}: {
  quiz: QuizQuestion;
  phase: "question" | "feedback";
  answer: Answer | null;
  onSelect: (option: QuizOption) => void;
  onContinue: () => void;
  continueLabel: string;
}) {
  const chosen = answer ? quiz.options.find((o) => o.id === answer.optionId) ?? null : null;

  return (
    <div className="mt-4">
      <div className="rounded-xl border border-[#1F1F1F] bg-black/20 p-3">
        <p className="text-xs leading-relaxed text-slate-300">{quiz.scenario}</p>
      </div>
      <p className="mt-3 text-sm font-bold text-white">{quiz.question}</p>

      {phase === "question" && (
        <div className="mt-3 space-y-2">
          {quiz.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option)}
              className="w-full rounded-xl border border-[#1F1F1F] bg-black/20 px-3 py-2.5 text-left text-xs font-semibold text-slate-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/5 active:scale-[0.99]"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {phase === "feedback" && chosen && (
        <div className="mt-3">
          <div
            className={`rounded-xl border p-3 ${
              answer?.correct ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10"
            }`}
          >
            <div className="flex items-center gap-2">
              {answer?.correct ? (
                <CheckCircle2 size={16} className="text-emerald-400" />
              ) : (
                <XCircle size={16} className="text-rose-400" />
              )}
              <p className={`text-sm font-extrabold ${answer?.correct ? "text-emerald-300" : "text-rose-300"}`}>
                {answer?.correct ? "Correct! Here's why:" : "Not quite! Remember:"}
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{chosen.explanation}</p>
            {!answer?.correct && (
              <p className="mt-2 text-xs leading-relaxed text-emerald-300">
                Correct answer: {quiz.options.find((o) => o.correct)?.label}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
          >
            {continueLabel}
          </button>
        </div>
      )}
    </div>
  );
}
