import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Building2,
  Calculator,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Compass,
  FileText,
  HeartPulse,
  HelpCircle,
  Landmark,
  Layers,
  Lock,
  type LucideIcon,
  Percent,
  PieChart,
  Scale,
  ScrollText,
  Search,
  Sparkles,
  Sprout,
  Swords,
  ShieldCheck,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { playSuccessChime } from "../lib/audioService";
import { getStoredUser } from "../lib/auth";
import { maybeAwardGoldMasterCertificate } from "../lib/certificates";
import {
  CARD_XP,
  QUIZ_XP,
  readLessonProgress,
  requestPaperTicker,
  writeLessonProgress,
  type LessonProgress,
} from "../lib/lessonProgress";
import {
  getLessonStreak,
  msUntilNextLocalMidnight,
  recordLessonCompletion,
  STREAK_UPDATED_EVENT,
} from "../lib/streakService";
import {
  LESSON_MODULES,
  OPEN_LESSON_EVENT,
  PHASES,
  PHASE_ORDER,
  curriculumIsComplete,
  isPhaseUnlocked,
  lessonXpPossible,
  modulesForPhase,
  nextPhaseId,
  phaseIsComplete,
  previousPhaseId,
  type LessonIconName,
  type LessonModuleDef,
  type OpenLessonDetail,
  type PhaseIconName,
  type PhaseId,
} from "../lib/lessons";
import { LessonDeck, LessonQuiz } from "./LessonCard";
import InteractiveQuiz from "./InteractiveQuiz";
import LessonsHeader from "./LessonsHeader";
import PracticalQuest from "./PracticalQuest";
import StreakBadge from "./StreakBadge";
import { questForModule, scenarioForModule, type PracticalQuestDef } from "../lib/lessonQuests";
import { markQuestComplete, QUEST_XP, SCENARIO_XP, isQuestComplete } from "../lib/userProgress";

export type { PhaseId };

const ICONS: Record<LessonIconName, LucideIcon> = {
  swords: Swords,
  percent: Percent,
  shield: ShieldCheck,
  sprout: Sprout,
  building: Building2,
  scale: Scale,
  heart: HeartPulse,
  landmark: Landmark,
  layers: Layers,
  scroll: ScrollText,
  "file-text": FileText,
  calculator: Calculator,
  coins: Coins,
  calendar: CalendarDays,
  "pie-chart": PieChart,
  brain: Brain,
  wallet: Wallet,
};

const PHASE_ICONS: Record<PhaseIconName, LucideIcon> = {
  shield: ShieldCheck,
  landmark: Landmark,
  layers: Layers,
  search: Search,
  compass: Compass,
};

type PlayerPhase = "cards" | "quiz" | "scenario" | "quest" | "complete";

type LessonCelebration = {
  xpEarned: number;
  streak: number;
  incremented: boolean;
};

function hydrateProgress(userId?: string): LessonProgress {
  const streak = getLessonStreak(userId);
  const progress = readLessonProgress(userId);
  return {
    ...progress,
    streak: streak.current,
    longestStreak: streak.longest,
    lastActiveDate: streak.lastCompletedDate,
  };
}

function progressToCompleted(progress: LessonProgress): Record<string, boolean> {
  return Object.fromEntries(progress.completed.map((id) => [id, true]));
}

export default function LessonsPhase1({
  recommendedPhaseId,
  phaseOrder,
  lockedPhaseIds,
  lockReason,
  unlockAllPhases,
  userId,
  userName,
  onOpenPaperPortfolio,
}: {
  recommendedPhaseId?: PhaseId;
  phaseOrder?: PhaseId[];
  lockedPhaseIds?: PhaseId[];
  lockReason?: string | null;
  unlockAllPhases?: boolean;
  userId?: string;
  userName?: string;
  onOpenPaperPortfolio?: () => void;
}) {
  const [progress, setProgress] = useState<LessonProgress>(() => hydrateProgress(userId));
  const completed = useMemo(() => progressToCompleted(progress), [progress.completed]);

  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [playerPhase, setPlayerPhase] = useState<PlayerPhase>("cards");
  const [cardIndex, setCardIndex] = useState(0);
  const [quizSolved, setQuizSolved] = useState(false);
  const [scenarioDone, setScenarioDone] = useState(false);
  const [celebration, setCelebration] = useState<LessonCelebration | null>(null);
  const awardedCardsRef = useRef<Set<string>>(new Set());
  const quizAwardedRef = useRef(false);
  const sessionXpRef = useRef(0);
  const finishingRef = useRef(false);

  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(
    () => modulesForPhase(recommendedPhaseId ?? "phase-1")[0]?.id ?? null
  );
  const [expandedPhaseId, setExpandedPhaseId] = useState<PhaseId | null>(recommendedPhaseId ?? "phase-1");

  const grantXp = (amount: number) => {
    if (amount <= 0) return;
    sessionXpRef.current += amount;
    setProgress((prev) => {
      const next = { ...prev, xp: prev.xp + amount };
      writeLessonProgress(next, userId);
      return next;
    });
  };

  useEffect(() => {
    let midnightTimer = 0;
    const refresh = () => {
      window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(refresh, msUntilNextLocalMidnight());
      if (finishingRef.current) return;
      setProgress(hydrateProgress(userId));
    };
    refresh();
    window.addEventListener(STREAK_UPDATED_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(STREAK_UPDATED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearTimeout(midnightTimer);
    };
  }, [userId]);

  useEffect(() => {
    if (!recommendedPhaseId) return;
    setExpandedPhaseId(recommendedPhaseId);
    setExpandedModuleId(modulesForPhase(recommendedPhaseId)[0]?.id ?? null);
  }, [recommendedPhaseId]);

  useEffect(() => {
    const onOpenLesson = (event: Event) => {
      const detail = (event as CustomEvent<OpenLessonDetail>).detail ?? {};
      const moduleDef = detail.moduleId
        ? LESSON_MODULES.find((item) => item.id === detail.moduleId)
        : undefined;
      const phaseId = moduleDef?.phaseId ?? detail.phaseId;
      if (phaseId) setExpandedPhaseId(phaseId);
      if (!moduleDef) return;
      setExpandedModuleId(moduleDef.id);

      awardedCardsRef.current = new Set();
      quizAwardedRef.current = false;
      sessionXpRef.current = 0;
      finishingRef.current = false;
      setCelebration(null);
      setActiveModuleId(moduleDef.id);
      setPlayerPhase("cards");
      setCardIndex(0);
      setQuizSolved(false);
      setScenarioDone(false);
    };
    window.addEventListener(OPEN_LESSON_EVENT, onOpenLesson);
    return () => window.removeEventListener(OPEN_LESSON_EVENT, onOpenLesson);
  }, []);

  const unlockOptions = { recommendedPhaseId, lockedPhaseIds, phaseOrder, unlockAllPhases };
  const orderedPhases = useMemo(() => {
    if (unlockAllPhases && phaseOrder?.length) {
      return [...PHASES].sort((a, b) => phaseOrder.indexOf(a.id) - phaseOrder.indexOf(b.id));
    }
    return PHASES;
  }, [phaseOrder, unlockAllPhases]);

  const isModuleUnlocked = (moduleDef: LessonModuleDef, siblings: LessonModuleDef[]) => {
    if (!isPhaseUnlocked(moduleDef.phaseId, completed, recommendedPhaseId, unlockOptions)) return false;
    const index = siblings.findIndex((item) => item.id === moduleDef.id);
    return index === 0 || Boolean(completed[siblings[index - 1]?.id]);
  };

  const activeModule = useMemo(
    () => LESSON_MODULES.find((moduleDef) => moduleDef.id === activeModuleId) ?? null,
    [activeModuleId]
  );

  const openModule = (moduleDef: LessonModuleDef, unlocked: boolean) => {
    if (!unlocked) return;
    awardedCardsRef.current = new Set();
    quizAwardedRef.current = false;
    sessionXpRef.current = 0;
    finishingRef.current = false;
    setCelebration(null);
    setActiveModuleId(moduleDef.id);
    setPlayerPhase("cards");
    setCardIndex(0);
    setQuizSolved(false);
    setScenarioDone(false);
  };

  const closeModal = () => {
    finishingRef.current = false;
    setCelebration(null);
    setActiveModuleId(null);
  };

  const onCardAdvance = (fromIndex: number) => {
    if (!activeModule || completed[activeModule.id]) return;
    const card = activeModule.cards[fromIndex];
    if (!card || awardedCardsRef.current.has(card.id)) return;
    awardedCardsRef.current.add(card.id);
    grantXp(CARD_XP);
  };

  const onQuizSolved = () => {
    if (!activeModule || quizAwardedRef.current) {
      setQuizSolved(true);
      return;
    }
    quizAwardedRef.current = true;
    setQuizSolved(true);
    playSuccessChime();
    if (!completed[activeModule.id]) grantXp(QUIZ_XP);
  };

  const persistCompletion = () => {
    if (!activeModule || finishingRef.current) return null;
    finishingRef.current = true;
    const alreadyDone = completed[activeModule.id];
    const nextCompleted = alreadyDone || progress.completed.includes(activeModule.id)
      ? progress.completed
      : [...progress.completed, activeModule.id];
    const result = recordLessonCompletion(userId);

    setProgress((prev) => {
      const completedIds = alreadyDone || prev.completed.includes(activeModule.id)
        ? prev.completed
        : [...prev.completed, activeModule.id];
      const next = {
        ...prev,
        completed: completedIds,
        streak: result.streak.current,
        longestStreak: result.streak.longest,
        lastActiveDate: result.streak.lastCompletedDate,
      };
      writeLessonProgress(next, userId);
      return next;
    });

    const siblings = modulesForPhase(activeModule.phaseId);
    const currentIdx = siblings.findIndex((item) => item.id === activeModule.id);
    const nextModule = siblings[currentIdx + 1];
    setExpandedModuleId(nextModule ? nextModule.id : activeModule.id);

    const completedMap = Object.fromEntries(nextCompleted.map((lessonId) => [lessonId, true]));
    const user = getStoredUser();
    const id = userId || user?.id || "anon";
    const name = userName || user?.name || "Investor";
    maybeAwardGoldMasterCertificate(id, name, completedMap);
    if (phaseIsComplete(activeModule.phaseId, completedMap)) {
      const upcoming = nextPhaseId(activeModule.phaseId, unlockAllPhases ? phaseOrder : PHASE_ORDER);
      if (upcoming) setExpandedPhaseId(upcoming);
    }

    return result;
  };

  const finishModule = () => {
    if (!activeModule) return;
    if (celebration) {
      closeModal();
      return;
    }
    playSuccessChime();
    const result = persistCompletion();
    if (!result) {
      closeModal();
      return;
    }
    setCelebration({
      xpEarned: sessionXpRef.current,
      streak: result.streak.current,
      incremented: result.incremented,
    });
    setPlayerPhase("complete");
  };

  const revealReward = () => {
    if (celebration) {
      setPlayerPhase("complete");
      return;
    }
    finishModule();
  };

  const openPaperCta = () => {
    if (!activeModule?.cta) return;
    requestPaperTicker({ symbol: activeModule.cta.symbol, description: activeModule.cta.description });
    persistCompletion();
    closeModal();
    onOpenPaperPortfolio?.();
  };

  const advanceAfterQuiz = () => {
    if (!activeModule) return;
    if (scenarioForModule(activeModule.id)) {
      setPlayerPhase("scenario");
      return;
    }
    if (questForModule(activeModule.id)) {
      setPlayerPhase("quest");
      return;
    }
    revealReward();
  };

  const advanceAfterScenario = (awardedXp = 0) => {
    if (awardedXp > 0) sessionXpRef.current += awardedXp;
    setScenarioDone(true);
    setProgress(hydrateProgress(userId));
  };

  const goToQuestOrComplete = () => {
    if (!activeModule) return;
    if (questForModule(activeModule.id)) {
      setPlayerPhase("quest");
      return;
    }
    revealReward();
  };

  const executeQuest = (quest: PracticalQuestDef) => {
    const already = isQuestComplete(quest.id, userId);
    if (quest.kind === "paper-trade" && quest.symbol) {
      requestPaperTicker({
        symbol: quest.symbol,
        description: quest.description || quest.symbol,
        monthlyAmount: quest.monthlyAmount,
        questId: quest.id,
        questLabel: quest.actionLabel,
      });
      markQuestComplete(quest.id, userId, QUEST_XP);
      if (!already) sessionXpRef.current += QUEST_XP;
      setProgress(hydrateProgress(userId));
      persistCompletion();
      closeModal();
      onOpenPaperPortfolio?.();
      return;
    }
    markQuestComplete(quest.id, userId, QUEST_XP);
    if (!already) sessionXpRef.current += QUEST_XP;
    setProgress(hydrateProgress(userId));
    revealReward();
  };

  const activeQuest = activeModule ? questForModule(activeModule.id) : null;
  const activeScenario = activeModule ? scenarioForModule(activeModule.id) : null;

  const playerSteps = activeModule
    ? activeModule.cards.length + 1 + (activeScenario ? 1 : 0) + (activeQuest ? 1 : 0) + 1
    : 0;
  const playerStep = (() => {
    if (!activeModule) return 0;
    const cards = activeModule.cards.length;
    if (playerPhase === "cards") return cardIndex;
    if (playerPhase === "quiz") return cards;
    let step = cards + 1;
    if (playerPhase === "scenario") return step;
    if (activeScenario) step += 1;
    if (playerPhase === "quest") return step;
    if (activeQuest) step += 1;
    return step; // complete
  })();

  return (
    <div className="space-y-4">
      <LessonsHeader xp={progress.xp} streak={progress.streak} />

      {orderedPhases.map((phaseDef) => {
        const unlockedPhase = isPhaseUnlocked(phaseDef.id, completed, recommendedPhaseId, unlockOptions);
        const locked = !unlockedPhase;
        const phaseExpanded = expandedPhaseId === phaseDef.id;
        const siblings = modulesForPhase(phaseDef.id);
        const doneCount = siblings.filter((moduleDef) => completed[moduleDef.id]).length;
        const phasePct = siblings.length ? Math.round((doneCount / siblings.length) * 100) : 0;
        const PhaseIcon = PHASE_ICONS[phaseDef.icon];
        const previous = previousPhaseId(phaseDef.id, PHASE_ORDER);
        const previousTitle = previous ? `Phase ${PHASES.find((item) => item.id === previous)?.number}` : "the previous phase";
        const profileLocked = Boolean(lockedPhaseIds?.includes(phaseDef.id) && !unlockedPhase);
        const progressLabel = locked
          ? `Phase ${phaseDef.number}: Locked`
          : `Phase ${phaseDef.number}: ${doneCount}/${siblings.length} Completed`;
        const certificateNote =
          phaseDef.id === "phase-5" && curriculumIsComplete(completed)
            ? " · Sprout Gold Financial Master Certificate unlocked"
            : "";

        return (
          <div
            key={phaseDef.id}
            className="overflow-hidden rounded-2xl border transition-colors"
            style={
              locked
                ? { borderColor: "rgba(31,31,31,0.6)", background: "rgba(10,10,10,0.5)" }
                : {
                    borderColor: "#1F1F1F",
                    background: `linear-gradient(to bottom right, ${phaseDef.accent}1A, #0A0A0A 42%, #0A0A0A)`,
                  }
            }
          >
            <button
              type="button"
              onClick={() => {
                if (locked) return;
                setExpandedPhaseId((prev) => (prev === phaseDef.id ? null : phaseDef.id));
              }}
              disabled={locked}
              aria-expanded={phaseExpanded}
              className={`flex w-full items-start justify-between gap-3 p-4 text-left sm:p-5 ${
                locked ? "cursor-default opacity-60" : "cursor-pointer"
              }`}
            >
              <div className="min-w-0">
                <p
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: locked ? "#64748B" : phaseDef.accent }}
                >
                  {phaseDef.title}
                </p>
                <h2 className="mt-1 text-lg font-extrabold tracking-tight text-white">{phaseDef.subtitle}</h2>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {phaseOrder?.[0] === phaseDef.id && (
                    <span className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      Top priority
                    </span>
                  )}
                  {recommendedPhaseId === phaseDef.id && (
                    <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      Recommended for you
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-400">
                  {progressLabel}
                  {!locked ? certificateNote : ""}
                </p>
                {locked && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {profileLocked && lockReason
                      ? lockReason
                      : `Complete ${previousTitle} to unlock.`}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <div
                  className="grid h-11 w-11 place-items-center rounded-xl"
                  style={
                    locked
                      ? { background: "rgba(0,0,0,0.2)", color: "#64748B" }
                      : { background: `${phaseDef.accent}26`, color: phaseDef.accent }
                  }
                >
                  {locked ? <Lock size={18} /> : <PhaseIcon size={22} />}
                </div>
                {!locked &&
                  (phaseExpanded ? (
                    <ChevronUp size={18} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={18} className="text-slate-400" />
                  ))}
              </div>
            </button>

            {!locked && siblings.length > 0 && (
              <div className="px-4 pb-4 sm:px-5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${phasePct}%`,
                      background: `linear-gradient(to right, ${phaseDef.accent}, #10B981)`,
                    }}
                  />
                </div>
              </div>
            )}

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                phaseExpanded ? "max-h-[5200px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="space-y-3 px-4 pb-4 sm:px-5">
                {locked ? (
                  <p className="py-2 text-center text-[11px] font-semibold text-slate-500">
                    Complete {previousTitle} to unlock these lessons.
                  </p>
                ) : (
                  siblings.map((moduleDef) => {
                    const unlocked = isModuleUnlocked(moduleDef, siblings);
                    const done = Boolean(completed[moduleDef.id]);
                    const Icon = ICONS[moduleDef.icon];
                    const expanded = expandedModuleId === moduleDef.id;
                    const hasQuest = Boolean(questForModule(moduleDef.id));
                    const hasScenario = Boolean(scenarioForModule(moduleDef.id));
                    const xpPossible =
                      lessonXpPossible(moduleDef) +
                      (hasQuest ? QUEST_XP : 0) +
                      (hasScenario ? SCENARIO_XP : 0);

                    return (
                      <div
                        key={moduleDef.id}
                        className={`rounded-2xl border transition-colors ${
                          unlocked
                            ? done
                              ? "border-emerald-500/35 bg-emerald-500/[0.06]"
                              : "border-[#1F1F1F] bg-[#0A0A0A]"
                            : "border-[#1F1F1F]/60 bg-[#0A0A0A]/50 opacity-60"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!unlocked) return;
                            setExpandedModuleId((prev) => (prev === moduleDef.id ? null : moduleDef.id));
                          }}
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
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {done && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                                    <Check size={10} /> Done
                                  </span>
                                )}
                                {hasQuest && (
                                  <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300">
                                    Quest
                                  </span>
                                )}
                                {hasScenario && (
                                  <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-300">
                                    AI scenario
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 flex-col items-end gap-2">
                            <span
                              className="rounded-full px-2 py-1 text-[10px] font-bold"
                              style={{ background: `${moduleDef.accent}22`, color: moduleDef.accent }}
                            >
                              +{xpPossible} XP
                            </span>
                            {unlocked &&
                              (expanded ? (
                                <ChevronUp size={16} className="text-slate-500" />
                              ) : (
                                <ChevronDown size={16} className="text-slate-500" />
                              ))}
                          </div>
                        </button>

                        <div className="px-4 pt-3">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/30">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${done ? 100 : unlocked ? 8 : 0}%`, background: moduleDef.accent }}
                            />
                          </div>
                          <p className="mt-1.5 pb-3 text-[11px] font-semibold text-slate-400">
                            {done
                              ? "Completed ✓ · review anytime"
                              : unlocked
                                ? `${moduleDef.cards.length} cards · quiz · ${hasScenario ? "scenario · " : ""}${
                                    hasQuest ? "quest · " : ""
                                  }${moduleDef.minutes} min`
                                : "Complete the previous lesson"}
                          </p>
                        </div>

                        <div
                          className={`overflow-hidden transition-all duration-300 ease-in-out ${
                            expanded ? "max-h-[480px] opacity-100" : "max-h-0 opacity-0"
                          }`}
                        >
                          <div className="space-y-3 border-t border-[#1F1F1F] px-4 py-3">
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <Sparkles size={12} /> {moduleDef.cards.length} story cards
                              </span>
                              <span className="flex items-center gap-1">
                                <HelpCircle size={12} /> check + scenario
                              </span>
                              <span className="flex items-center gap-1">
                                <Trophy size={12} /> +{xpPossible} XP
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openModule(moduleDef, unlocked)}
                              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                            >
                              {done ? "Review Lesson" : "Start Lesson"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })}

      {activeModule && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="matter-pop flex max-h-[min(94vh,820px)] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 sm:p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lesson-modal-title"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg"
                  style={{ background: `${activeModule.accent}26`, color: activeModule.accent }}
                >
                  {React.createElement(ICONS[activeModule.icon], { size: 17 })}
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

            <div className="mt-3">
              <LessonsHeader xp={progress.xp} streak={progress.streak} compact />
            </div>

            <div className="mt-3 flex items-center gap-1">
              {Array.from({ length: playerSteps }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    i <= playerStep ? "bg-emerald-500" : "bg-black/30"
                  }`}
                />
              ))}
            </div>

            {playerPhase === "cards" && (
              <>
                <LessonDeck
                  cards={activeModule.cards}
                  index={cardIndex}
                  accent={activeModule.accent}
                  onIndexChange={setCardIndex}
                  onCardAdvance={onCardAdvance}
                  onComplete={() => setPlayerPhase("quiz")}
                />
                {cardIndex === activeModule.cards.length - 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onCardAdvance(cardIndex);
                      setPlayerPhase("quiz");
                    }}
                    className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                  >
                    Check the idea
                  </button>
                )}
              </>
            )}

            {playerPhase === "quiz" && (
              <>
                <LessonQuiz key={activeModule.id} quiz={activeModule.quiz} onSolved={onQuizSolved} />
                {quizSolved && (
                  <button
                    type="button"
                    onClick={advanceAfterQuiz}
                    className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                  >
                    {activeScenario ? "Real-world scenario" : activeQuest ? "Practical Quest" : "See your reward"}
                  </button>
                )}
              </>
            )}

            {playerPhase === "scenario" && activeScenario && (
              <>
                <InteractiveQuiz
                  key={activeScenario.id}
                  scenario={activeScenario}
                  userId={userId}
                  userName={userName}
                  accent={activeModule.accent}
                  onComplete={advanceAfterScenario}
                />
                {scenarioDone && (
                  <button
                    type="button"
                    onClick={goToQuestOrComplete}
                    className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                  >
                    {activeQuest ? "Practical Quest" : "See your reward"}
                  </button>
                )}
              </>
            )}

            {playerPhase === "quest" && activeQuest && (
              <PracticalQuest
                key={activeQuest.id}
                quest={activeQuest}
                userId={userId}
                accent={activeModule.accent}
                onExecute={executeQuest}
                onSkip={revealReward}
              />
            )}

            {playerPhase === "complete" && celebration && (
              <div className="lesson-celebrate mt-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Lesson complete</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className="lesson-celebrate-xp rounded-full border border-emerald-500/35 bg-emerald-500/12 px-3 py-1 text-sm font-extrabold text-emerald-300">
                    {celebration.xpEarned > 0 ? `+${celebration.xpEarned} XP` : "XP already earned"}
                  </span>
                </div>
                <div className="relative mx-auto mt-5 flex flex-col items-center">
                  <StreakBadge streak={celebration.streak} size="lg" bump={celebration.incremented} />
                  {celebration.incremented ? (
                    <p className="lesson-streak-plus-lg mt-3 text-base font-extrabold text-orange-300">+1 Day!</p>
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-slate-400">
                      {celebration.streak > 0 ? "Streak already counted today" : "Start your streak"}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Keep a lesson going tomorrow to protect the flame.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                >
                  <Check size={15} />
                  Continue
                </button>
              </div>
            )}

            {playerPhase === "complete" && !celebration && (
              <div className="mt-4">
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <Trophy size={16} className="text-amber-400" />
                  <p className="text-xs font-bold text-amber-300">
                    +{lessonXpPossible(activeModule)} XP path
                    {completed[activeModule.id] ? " · review, no extra XP" : " · finish to update your streak"}
                  </p>
                </div>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">Real-world action</p>
                <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-sm leading-relaxed text-emerald-100">{activeModule.actionCard}</p>
                </div>

                {activeModule.cta && (
                  <div className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.07] p-3">
                    <p className="text-sm font-semibold leading-relaxed text-cyan-50">{activeModule.cta.prompt}</p>
                    <button
                      type="button"
                      onClick={openPaperCta}
                      className="mt-3 flex w-full items-center justify-center rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-[#082F49] transition hover:bg-cyan-300 active:scale-[0.99]"
                    >
                      Add {activeModule.cta.symbol} to Paper Portfolio
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={finishModule}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                >
                  <Check size={15} />
                  {activeModule.cta ? "Maybe later" : "Complete lesson"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
