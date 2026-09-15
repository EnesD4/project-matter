import { getStoredUser } from "./auth";
import { readLocalItem } from "./storage";

export const PAPER_STARTING_CASH = 100_000;
export const PAPER_ACCOUNT_CREATED_EVENT = "matterpro:paper-account-created";

function cashKey(userId?: string) {
  return `sprout_paper_cash_${userId ?? getStoredUser()?.id ?? "anon"}`;
}

function createdKey(userId?: string) {
  return `sprout_paper_account_${userId ?? getStoredUser()?.id ?? "anon"}`;
}

export function hasPaperAccount(userId?: string): boolean {
  try {
    return readLocalItem(createdKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markPaperAccountCreated(userId?: string): void {
  try {
    const id = userId ?? getStoredUser()?.id ?? "anon";
    localStorage.setItem(createdKey(id), "1");
    if (readLocalItem(cashKey(id)) == null) {
      localStorage.setItem(cashKey(id), String(PAPER_STARTING_CASH));
    }
  } catch {
    // ignore quota
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PAPER_ACCOUNT_CREATED_EVENT));
  }
}

export function loadPaperCash(userId?: string): number {
  try {
    const raw = readLocalItem(cashKey(userId));
    if (raw == null) return hasPaperAccount(userId) ? PAPER_STARTING_CASH : 0;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, value) : PAPER_STARTING_CASH;
  } catch {
    return hasPaperAccount(userId) ? PAPER_STARTING_CASH : 0;
  }
}

export function savePaperCash(amount: number, userId?: string): number {
  const next = Math.max(0, Number.isFinite(amount) ? amount : 0);
  try {
    localStorage.setItem(cashKey(userId), String(next));
  } catch {
    // ignore
  }
  return next;
}

export function adjustPaperCash(delta: number, userId?: string): number {
  return savePaperCash(loadPaperCash(userId) + delta, userId);
}
