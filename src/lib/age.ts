import { parseToIsoDate } from "./usDate";

const MIN_AGE = 13;
const MAX_AGE = 100;

export function clampAge(n: number, min = MIN_AGE, max = MAX_AGE) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Accepts YYYY-MM-DD or US MM/DD/YYYY so age math always reads month/day/year. */
export function parseISODate(value: string): Date | null {
  const iso = parseToIsoDate(value);
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day);
}

export function ageFromBirthDate(iso: string, now = new Date()): number | null {
  const birth = parseISODate(iso);
  if (!birth || birth > now) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  if (age < 0) return null;
  return age;
}

export function birthDateFromAge(age: number, now = new Date()): string {
  const clamped = clampAge(age);
  const date = new Date(now.getFullYear() - clamped, now.getMonth(), now.getDate());
  return toISODate(date);
}

/** Keep month/day when possible so editing age in Profile does not reset the birthday. */
export function applyAgeToBirthDate(age: number, existing?: string | null, now = new Date()): string {
  const clamped = clampAge(age);
  const current = existing ? parseISODate(existing) : null;
  if (!current) return birthDateFromAge(clamped, now);

  const next = new Date(current);
  next.setFullYear(now.getFullYear() - clamped);
  if (ageFromBirthDate(toISODate(next), now) !== clamped) {
    next.setFullYear(next.getFullYear() - 1);
  }
  return toISODate(next);
}

export function todayISODate(now = new Date()) {
  return toISODate(now);
}

export function minBirthDateISO(now = new Date()) {
  return toISODate(new Date(now.getFullYear() - MAX_AGE, now.getMonth(), now.getDate()));
}

/** Latest allowed birthday so the user is at least MIN_AGE. */
export function maxBirthDateISO(now = new Date()) {
  return toISODate(new Date(now.getFullYear() - MIN_AGE, now.getMonth(), now.getDate()));
}

/** Resolve the user's current age from saved profile fields. Never prompt for it again. */
export function resolveUserAge(age?: number | null, birthDate?: string | null): number | null {
  const fromBirth = birthDate ? ageFromBirthDate(birthDate) : null;
  const candidates = [fromBirth, age];
  for (const value of candidates) {
    if (value != null && Number.isFinite(value) && value > 0) {
      return clampAge(value);
    }
  }
  return null;
}

export function hasSavedUserAge(age?: number | null, birthDate?: string | null): boolean {
  return resolveUserAge(age, birthDate) != null;
}
