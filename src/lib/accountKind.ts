export const ACCOUNT_KINDS = ["paper", "verified"] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export function parseAccountKind(value: unknown): AccountKind {
  return value === "verified" ? "verified" : "paper";
}

export function isVerifiedAccount(kind?: AccountKind | null): boolean {
  return kind === "verified";
}

export function holdingAccount(holding: { account?: AccountKind | null }): AccountKind {
  return holding.account === "verified" ? "verified" : "paper";
}
