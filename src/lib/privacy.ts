import { safeFormatNumber, toFiniteNumber } from "./money";

/** Masked stand-ins used when privacy mode is on. */
export const MASK_MONEY = "$••••••";
export const MASK_SHARES = "•••• shares";
export const MASK_COMPACT = "••••";

export function formatMoney(amount: unknown, digits = 2) {
  if (!amount && amount !== 0) return "0";
  return safeFormatNumber(amount, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** `$1,234.56` or `$••••••` when hidden. */
export function privacyMoney(hidden: boolean, amount: unknown, digits = 2): string {
  if (hidden) return MASK_MONEY;
  if (!amount && amount !== 0) return "$0";
  return `$${formatMoney(amount, digits)}`;
}

/** `+$12.00` / `-$12.00` / `$0.00`, or a masked bullet string. */
export function privacySignedMoney(hidden: boolean, amount: unknown, digits = 2): string {
  if (hidden) return MASK_COMPACT;
  const n = toFiniteNumber(amount, 0);
  const abs = formatMoney(Math.abs(n), digits);
  if (n > 0) return `+$${abs}`;
  if (n < 0) return `-$${abs}`;
  return `$${abs}`;
}

/** `12.5 sh` or `•••• shares` when hidden. */
export function privacyShares(hidden: boolean, quantity: unknown): string {
  if (hidden) return MASK_SHARES;
  const q = safeFormatNumber(quantity, { maximumFractionDigits: 4 });
  return `${q} sh`;
}

export function privacyAxis(hidden: boolean, formatted: string): string {
  return hidden ? MASK_COMPACT : formatted;
}
