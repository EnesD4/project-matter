import { getStoredUser } from "./auth";
import {
  CARD_XP,
  LESSON_PROGRESS_UPDATED_EVENT,
  QUIZ_XP,
  XP_PER_LEVEL,
  awardLessonXp,
  emptyLessonProgress,
  levelFromXp,
  localDateKey,
  readLessonProgress,
  writeLessonProgress,
  xpIntoLevel,
  type LessonProgress,
} from "./lessonProgress";
import { LESSON_MODULES, modulesForPhase, type PhaseId } from "./lessons";
import { getLessonStreak } from "./streakService";
import { readLocalItem } from "./storage";

export { CARD_XP, QUIZ_XP, XP_PER_LEVEL, levelFromXp, xpIntoLevel, LESSON_PROGRESS_UPDATED_EVENT };
export const QUEST_XP = 15;
export const SCENARIO_XP = 10;

export const USER_PROGRESS_UPDATED_EVENT = "matterpro:user-progress-updated";

export const LEARNING_BADGE_IDS = [
  "cashFlowPioneer",
  "debtSlayer",
  "shieldBuilder",
  "compoundGardener",
  "taxAwareSaver",
  "indexApprentice",
  "valueInvestor",
  "dcaDisciplinarian",
  "calmUnderFire",
  "questRunner",
] as const;

export type LearningBadgeId = (typeof LEARNING_BADGE_IDS)[number];

export type LearningBadge = {
  id: LearningBadgeId;
  title: string;
  requirement: string;
  unlocked: boolean;
  unlockedAt?: string;
};

export type UserProgressView = {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  streak: number;
  longestStreak: number;
  completedLessons: string[];
  completedQuests: string[];
  completedScenarios: string[];
  badges: LearningBadge[];
};

type QuestPersist = {
  completedQuests: string[];
  completedScenarios: string[];
  badgeUnlockedAt: Partial<Record<LearningBadgeId, string>>;
};

const BADGE_CATALOG: Record<
  LearningBadgeId,
  { title: string; requirement: string; lessonIds?: string[]; questCount?: number; phaseId?: PhaseId }
> = {
  cashFlowPioneer: {
    title: "Cash Flow Pioneer",
    requirement: "Complete Cash Flow & Budgeting Mastery",
    lessonIds: ["cash-flow-budget"],
  },
  debtSlayer: {
    title: "Debt Slayer",
    requirement: "Complete Debt Payoff",
    lessonIds: ["debt-battles"],
  },
  shieldBuilder: {
    title: "Shield Builder",
    requirement: "Complete HYSA Emergency Fund",
    lessonIds: ["emergency-fund"],
  },
  compoundGardener: {
    title: "Compound Gardener",
    requirement: "Complete The Compound Engine",
    lessonIds: ["compound"],
  },
  taxAwareSaver: {
    title: "Tax-Aware Saver",
    requirement: "Finish Phase 2 retirement lessons",
    phaseId: "phase-2",
  },
  indexApprentice: {
    title: "Index Apprentice",
    requirement: "Complete ETFs, Index Funds & Fees",
    lessonIds: ["etfs"],
  },
  valueInvestor: {
    title: "Value Investor",
    requirement: "Complete P/E & EPS plus Free Cash Flow",
    lessonIds: ["pe-eps", "fcf-dividends"],
  },
  dcaDisciplinarian: {
    title: "DCA Disciplinarian",
    requirement: "Complete Dollar-Cost Averaging",
    lessonIds: ["dca"],
  },
  calmUnderFire: {
    title: "Calm Under Fire",
    requirement: "Complete FOMO & Panic Selling",
    lessonIds: ["fomo-panic"],
  },
  questRunner: {
    title: "Quest Runner",
    requirement: "Execute 3 practical paper-trading quests",
    questCount: 3,
  },
};

function questStorageKey(userId?: string) {
  return `sprout_user_quests_${userId || getStoredUser()?.id || "anon"}`;
}

function legacyQuestStorageKey(userId?: string) {
  return `matterpro_user_quests_${userId || getStoredUser()?.id || "anon"}`;
}

function emptyQuestPersist(): QuestPersist {
  return { completedQuests: [], completedScenarios: [], badgeUnlockedAt: {} };
}

function readQuestPersist(userId?: string): QuestPersist {
  try {
    const raw = readLocalItem(questStorageKey(userId), legacyQuestStorageKey(userId));
    if (!raw) return emptyQuestPersist();
    const parsed = JSON.parse(raw) as Partial<QuestPersist>;
    return {
      completedQuests: Array.isArray(parsed.completedQuests)
        ? parsed.completedQuests.filter((id): id is string => typeof id === "string")
        : [],
      completedScenarios: Array.isArray(parsed.completedScenarios)
        ? parsed.completedScenarios.filter((id): id is string => typeof id === "string")
        : [],
      badgeUnlockedAt:
        parsed.badgeUnlockedAt && typeof parsed.badgeUnlockedAt === "object" ? parsed.badgeUnlockedAt : {},
    };
  } catch {
    return emptyQuestPersist();
  }
}

function writeQuestPersist(state: QuestPersist, userId?: string) {
  try {
    localStorage.setItem(questStorageKey(userId), JSON.stringify(state));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function emitProgressUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(USER_PROGRESS_UPDATED_EVENT));
  window.dispatchEvent(new Event(LESSON_PROGRESS_UPDATED_EVENT));
}

function phaseLessonsDone(phaseId: PhaseId, completed: Set<string>): boolean {
  const modules = modulesForPhase(phaseId);
  return modules.length > 0 && modules.every((moduleDef) => completed.has(moduleDef.id));
}

function evaluateBadges(
  lessonProgress: LessonProgress,
  questPersist: QuestPersist,
  nowISO: string
): { badges: LearningBadge[]; persist: QuestPersist } {
  const completed = new Set(lessonProgress.completed);
  const unlockedAt = { ...questPersist.badgeUnlockedAt };
  const badges: LearningBadge[] = LEARNING_BADGE_IDS.map((id) => {
    const meta = BADGE_CATALOG[id];
    let earned = false;
    if (meta.lessonIds?.length) {
      earned = meta.lessonIds.every((lessonId) => completed.has(lessonId));
    } else if (meta.phaseId) {
      earned = phaseLessonsDone(meta.phaseId, completed);
    } else if (meta.questCount) {
      earned = questPersist.completedQuests.length >= meta.questCount;
    }
    if (earned && !unlockedAt[id]) unlockedAt[id] = nowISO;
    if (!earned && unlockedAt[id] && (meta.lessonIds || meta.phaseId)) {
      // Lesson badges stay once earned; quest count badges can stay too.
    }
    return {
      id,
      title: meta.title,
      requirement: meta.requirement,
      unlocked: Boolean(unlockedAt[id]),
      unlockedAt: unlockedAt[id],
    };
  });
  return {
    badges,
    persist: { ...questPersist, badgeUnlockedAt: unlockedAt },
  };
}

export function readUserProgress(userId?: string): UserProgressView {
  const lesson = readLessonProgress(userId);
  const streak = getLessonStreak(userId);
  const questPersist = readQuestPersist(userId);
  const { badges, persist } = evaluateBadges(
    { ...lesson, streak: streak.current, longestStreak: streak.longest },
    questPersist,
    new Date().toISOString()
  );
  if (JSON.stringify(persist) !== JSON.stringify(questPersist)) {
    writeQuestPersist(persist, userId);
  }
  return {
    xp: lesson.xp,
    level: levelFromXp(lesson.xp),
    xpIntoLevel: xpIntoLevel(lesson.xp),
    xpPerLevel: XP_PER_LEVEL,
    streak: streak.current,
    longestStreak: streak.longest,
    completedLessons: lesson.completed,
    completedQuests: persist.completedQuests,
    completedScenarios: persist.completedScenarios,
    badges,
  };
}

export function markQuestComplete(questId: string, userId?: string, xp = QUEST_XP): UserProgressView {
  const id = questId.trim();
  if (!id) return readUserProgress(userId);
  const persist = readQuestPersist(userId);
  if (!persist.completedQuests.includes(id)) {
    persist.completedQuests = [...persist.completedQuests, id];
    writeQuestPersist(persist, userId);
    awardLessonXp(xp, userId);
  }
  const view = readUserProgress(userId);
  emitProgressUpdated();
  return view;
}

export function markScenarioComplete(scenarioId: string, userId?: string, xp = SCENARIO_XP): UserProgressView {
  const id = scenarioId.trim();
  if (!id) return readUserProgress(userId);
  const persist = readQuestPersist(userId);
  if (!persist.completedScenarios.includes(id)) {
    persist.completedScenarios = [...persist.completedScenarios, id];
    writeQuestPersist(persist, userId);
    awardLessonXp(xp, userId);
  }
  const view = readUserProgress(userId);
  emitProgressUpdated();
  return view;
}

export function isQuestComplete(questId: string, userId?: string): boolean {
  return readQuestPersist(userId).completedQuests.includes(questId);
}

export function isScenarioComplete(scenarioId: string, userId?: string): boolean {
  return readQuestPersist(userId).completedScenarios.includes(scenarioId);
}

export function emptyUserProgress(): UserProgressView {
  const lesson = emptyLessonProgress();
  return {
    xp: 0,
    level: 1,
    xpIntoLevel: 0,
    xpPerLevel: XP_PER_LEVEL,
    streak: 0,
    longestStreak: 0,
    completedLessons: [],
    completedQuests: [],
    completedScenarios: [],
    badges: LEARNING_BADGE_IDS.map((id) => ({
      id,
      title: BADGE_CATALOG[id].title,
      requirement: BADGE_CATALOG[id].requirement,
      unlocked: false,
    })),
  };
}

export function lessonModuleCount(): number {
  return LESSON_MODULES.length;
}

export function progressPct(completedCount: number): number {
  const total = lessonModuleCount();
  if (total <= 0) return 0;
  return Math.round((Math.min(completedCount, total) / total) * 100);
}

export function touchLearningDay(userId?: string): LessonProgress {
  const progress = readLessonProgress(userId);
  if (progress.lastActiveDate === localDateKey()) return progress;
  return progress;
}
