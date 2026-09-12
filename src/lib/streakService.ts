import {
  localDateKey,
  readLessonProgress,
  writeLessonProgress,
  type LessonProgress,
} from "./lessonProgress";

export const STREAK_UPDATED_EVENT = "matterpro:lesson-streak-updated";

export const STREAK_MILESTONES = [
  { days: 3, trophyId: "consistentLearner", title: "Consistent Learner" },
  { days: 7, trophyId: "financeScholar", title: "Finance Scholar" },
  { days: 30, trophyId: "marketStrategist", title: "Market Strategist" },
] as const;

export type LessonStreak = {
  current: number;
  longest: number;
  lastCompletedDate: string | null;
};

export type StreakRecordResult = {
  streak: LessonStreak;
  incremented: boolean;
  alreadyCountedToday: boolean;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toView(progress: LessonProgress): LessonStreak {
  return {
    current: progress.streak,
    longest: Math.max(progress.longestStreak, progress.streak),
    lastCompletedDate: progress.lastActiveDate,
  };
}

function emitUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STREAK_UPDATED_EVENT));
}

/** Zero the live streak when a full local calendar day was missed. Longest streak is kept. */
export function resolveStreak(progress: LessonProgress, today = localDateKey()): LessonProgress {
  const longest = Math.max(progress.longestStreak, progress.streak);
  const last = progress.lastActiveDate;
  let streak = progress.streak;
  if (!last) {
    streak = 0;
  } else if (last !== today && last !== shiftDateKey(today, -1)) {
    streak = 0;
  }
  if (streak === progress.streak && longest === progress.longestStreak) return progress;
  return { ...progress, streak, longestStreak: longest };
}

export function getLessonStreak(userId?: string, now = new Date()): LessonStreak {
  const progress = readLessonProgress(userId);
  const resolved = resolveStreak(progress, localDateKey(now));
  if (resolved !== progress) {
    writeLessonProgress(resolved, userId);
  }
  return toView(resolved);
}

/** Record that the user finished a lesson module today. One increment per calendar day. */
export function recordLessonCompletion(userId?: string, now = new Date()): StreakRecordResult {
  const today = localDateKey(now);
  const progress = resolveStreak(readLessonProgress(userId), today);
  if (progress.lastActiveDate === today && progress.streak > 0) {
    return {
      streak: toView(progress),
      incremented: false,
      alreadyCountedToday: true,
    };
  }
  const yesterday = shiftDateKey(today, -1);
  const nextCurrent =
    progress.lastActiveDate === yesterday && progress.streak > 0 ? progress.streak + 1 : 1;
  const next: LessonProgress = {
    ...progress,
    streak: nextCurrent,
    longestStreak: Math.max(progress.longestStreak, progress.streak, nextCurrent),
    lastActiveDate: today,
  };
  writeLessonProgress(next, userId);
  emitUpdated();
  return {
    streak: toView(next),
    incremented: true,
    alreadyCountedToday: false,
  };
}

export function msUntilNextLocalMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(250, next.getTime() - now.getTime());
}
