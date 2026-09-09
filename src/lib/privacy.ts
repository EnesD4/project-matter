/** Masked stand-ins used when privacy mode is on. */
export const MASK_MONEY = "$••••••";
export const MASK_SHARES = "•••• shares";
export const MASK_COMPACT = "••••";

export function formatMoney(amount: number, digits = 2) {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** `$1,234.56` or `$••••••` when hidden. */
export function privacyMoney(hidden: boolean, amount: number, digits = 2): string {
  if (hidden) return MASK_MONEY;
  return `$${formatMoney(amount, digits)}`;
}

/** `+$12.00` / `-$12.00` / `$0.00`, or a masked bullet string. */
export function privacySignedMoney(hidden: boolean, amount: number, digits = 2): string {
  if (hidden) return MASK_COMPACT;
  const abs = formatMoney(Math.abs(amount), digits);
  if (amount > 0) return `+$${abs}`;
  if (amount < 0) return `-$${abs}`;
  return `$${abs}`;
}

/** `12.5 sh` or `•••• shares` when hidden. */
export function privacyShares(hidden: boolean, quantity: number): string {
  if (hidden) return MASK_SHARES;
  const q = quantity.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return `${q} sh`;
}

export function privacyAxis(hidden: boolean, formatted: string): string {
  return hidden ? MASK_COMPACT : formatted;
}
