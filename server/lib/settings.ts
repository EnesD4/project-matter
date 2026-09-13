import type { UserSettings } from '@prisma/client';
import { parseFlexibleDate } from './dates';

export type PublicSettings = {
  hasCompletedOnboarding: boolean;
  hasCompletedBankSetup: boolean;
  hasActiveInvestments: boolean;
  hasActiveDebts: boolean;
  wantsCapitalGrowth: boolean;
  wantsFinancialLiteracy: boolean;
  riskTolerance: string;
  investmentGoal: string;
  experienceLevel: string;
  age: number | null;
  birthDate: string | null;
};

export function publicSettings(settings: UserSettings): PublicSettings {
  const hasCompletedOnboarding = settings.hasCompletedOnboarding;
  const rawBank = (settings as UserSettings & { hasCompletedBankSetup?: boolean }).hasCompletedBankSetup;
  return {
    hasCompletedOnboarding,
    hasCompletedBankSetup: rawBank === true || (rawBank == null && hasCompletedOnboarding),
    hasActiveInvestments: settings.hasActiveInvestments,
    hasActiveDebts: settings.hasActiveDebts,
    wantsCapitalGrowth: settings.wantsCapitalGrowth,
    wantsFinancialLiteracy: settings.wantsFinancialLiteracy,
    riskTolerance: settings.riskTolerance,
    investmentGoal: settings.investmentGoal,
    experienceLevel: settings.experienceLevel,
    age: settings.age ?? null,
    birthDate: settings.birthDate ?? null,
  };
}

export function parseAge(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(13, Math.round(n)));
}

export function parseBirthDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  return parseFlexibleDate(value) ?? undefined;
}

export function parseBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'yes') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'no') return false;
  return undefined;
}
