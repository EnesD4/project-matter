import { getStoredUser } from "./auth";
import { readLocalItem, readSessionItem } from "./storage";

export const XP_PER_LEVEL = 100;
export const CARD_XP = 10;
export const QUIZ_XP = 20;

export type LessonProgress = {
  xp: number;
  streak: number;
  /** Best consecutive lesson-day count; survives a later streak reset. */
  longestStreak: number;
  lastActiveDate: string | null;
  completed: string[];
};

export type PaperTickerIntent = {
  symbol: string;
  description: string;
  /** Optional DCA / quest monthly dollar amount to prefill Paper Trading */
  monthlyAmount?: number;
  /** Quest id so Paper Trading can show a banner and complete the quest on save */
  questId?: string;
  questLabel?: string;
};

export const PAPER_TICKER_INTENT_KEY = "sprout_paper_ticker_intent";
const LEGACY_PAPER_TICKER_INTENT_KEY = "matterpro:paper-ticker-intent";

function storageKey(userId?: string) {
  return `sprout_lessons_progress_${userId || getStoredUser()?.id || "anon"}`;
}

function legacyStorageKey(userId?: string) {
  return `matterpro_lessons_progress_${userId || getStoredUser()?.id || "anon"}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function localDateKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function emptyLessonProgress(): LessonProgress {
  return { xp: 0, streak: 0, longestStreak: 0, lastActiveDate: null, completed: [] };
}

function isProgress(value: unknown): value is Omit<LessonProgress, "longestStreak"> & {
  longestStreak?: number;
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LessonProgress>;
  return (
    typeof record.xp === "number" &&
    typeof record.streak === "number" &&
    (record.lastActiveDate === null || typeof record.lastActiveDate === "string") &&
    Array.isArray(record.completed)
  );
}

export function readLessonProgress(userId?: string): LessonProgress {
  try {
    const raw = readLocalItem(storageKey(userId), legacyStorageKey(userId));
    if (!raw) return emptyLessonProgress();
    const parsed = JSON.parse(raw) as unknown;
    if (!isProgress(parsed)) return emptyLessonProgress();
    const streak = Math.max(0, Math.round(parsed.streak));
    const longestRaw =
      typeof parsed.longestStreak === "number" ? Math.max(0, Math.round(parsed.longestStreak)) : streak;
    return {
      xp: Math.max(0, Math.round(parsed.xp)),
      streak,
      longestStreak: Math.max(longestRaw, streak),
      lastActiveDate: parsed.lastActiveDate,
      completed: parsed.completed.filter((id): id is string => typeof id === "string"),
    };
  } catch {
    return emptyLessonProgress();
  }
}

export const LESSON_PROGRESS_UPDATED_EVENT = "matterpro:lesson-progress-updated";

export function writeLessonProgress(progress: LessonProgress, userId?: string) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(progress));
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works this session.
  }
}

export function awardLessonXp(amount: number, userId?: string): LessonProgress {
  const awarded = Math.max(0, Math.round(amount));
  const progress = readLessonProgress(userId);
  if (awarded <= 0) return progress;
  const next = { ...progress, xp: progress.xp + awarded };
  writeLessonProgress(next, userId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LESSON_PROGRESS_UPDATED_EVENT));
    window.dispatchEvent(new Event("matterpro:lesson-streak-updated"));
  }
  return next;
}

export function touchStreak(progress: LessonProgress, today = localDateKey()): LessonProgress {
  if (progress.lastActiveDate === today) {
    return {
      ...progress,
      longestStreak: Math.max(progress.longestStreak, progress.streak),
    };
  }
  const yesterday = shiftDateKey(today, -1);
  const streak = progress.lastActiveDate === yesterday && progress.streak > 0 ? progress.streak + 1 : 1;
  return {
    ...progress,
    streak,
    longestStreak: Math.max(progress.longestStreak, progress.streak, streak),
    lastActiveDate: today,
  };
}

export function levelFromXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

export function xpIntoLevel(xp: number): number {
  return Math.max(0, xp) % XP_PER_LEVEL;
}

export function requestPaperTicker(intent: PaperTickerIntent) {
  try {
    sessionStorage.setItem(PAPER_TICKER_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function peekPaperTickerIntent(): PaperTickerIntent | null {
  try {
    const raw = readSessionItem(PAPER_TICKER_INTENT_KEY, LEGACY_PAPER_TICKER_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PaperTickerIntent>;
    if (typeof parsed.symbol !== "string" || typeof parsed.description !== "string") return null;
    const symbol = parsed.symbol.trim().toUpperCase();
    if (!symbol) return null;
    const monthlyRaw = Number(parsed.monthlyAmount);
    const monthlyAmount =
      Number.isFinite(monthlyRaw) && monthlyRaw > 0 ? Math.round(monthlyRaw) : undefined;
    const questId = typeof parsed.questId === "string" && parsed.questId.trim() ? parsed.questId.trim() : undefined;
    const questLabel =
      typeof parsed.questLabel === "string" && parsed.questLabel.trim() ? parsed.questLabel.trim() : undefined;
    return { symbol, description: parsed.description, monthlyAmount, questId, questLabel };
  } catch {
    return null;
  }
}

export function clearPaperTickerIntent() {
  try {
    sessionStorage.removeItem(PAPER_TICKER_INTENT_KEY);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function consumePaperTickerIntent(): PaperTickerIntent | null {
  const intent = peekPaperTickerIntent();
  if (intent) clearPaperTickerIntent();
  return intent;
}
