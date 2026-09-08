import type { UserSettings } from '@prisma/client';

export type PublicSettings = {
  hasCompletedOnboarding: boolean;
  hasActiveInvestments: boolean;
  hasActiveDebts: boolean;
  wantsCapitalGrowth: boolean;
  wantsFinancialLiteracy: boolean;
  riskTolerance: string;
  investmentGoal: string;
  experienceLevel: string;
};

export function publicSettings(settings: UserSettings): PublicSettings {
  return {
    hasCompletedOnboarding: settings.hasCompletedOnboarding,
    hasActiveInvestments: settings.hasActiveInvestments,
    hasActiveDebts: settings.hasActiveDebts,
    wantsCapitalGrowth: settings.wantsCapitalGrowth,
    wantsFinancialLiteracy: settings.wantsFinancialLiteracy,
    riskTolerance: settings.riskTolerance,
    investmentGoal: settings.investmentGoal,
    experienceLevel: settings.experienceLevel,
  };
}

export function parseBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'yes') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'no') return false;
  return undefined;
}
