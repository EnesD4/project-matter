export const safeToLocaleString = (
  val: any,
  locale: string = 'en-US',
  options?: Intl.NumberFormatOptions
): string => {
  const num = Number(val) || 0;
  if (!Number.isFinite(num)) return '0';
  return (Number(num) || 0).toLocaleString(locale, options);
};

export const formatCurrency = (val: any): string => {
  return safeToLocaleString(val, 'en-US', { style: 'currency', currency: 'USD' });
};

/** Signed day/total change for watchlists and portfolio rows (`+1.23%` / `-1.23%`). */
export const formatPercent = (val: any, digits = 2): string => {
  if (val === null || val === undefined) return `${(0).toFixed(digits)}%`;
  const num = Number(val);
  if (isNaN(num)) return `${(0).toFixed(digits)}%`;
  const abs = Math.abs(num).toFixed(digits);
  if (num > 0) return `+${abs}%`;
  if (num < 0) return `-${abs}%`;
  return `${abs}%`;
};

/** Tailwind / hex pair for % change chips. */
export function percentChangeTone(val: unknown): { color: string; className: string } {
  const num = Number(val);
  if (!Number.isFinite(num) || num === 0) {
    return { color: "#9CA3AF", className: "text-slate-400" };
  }
  if (num > 0) return { color: "#10B981", className: "text-emerald-400" };
  return { color: "#EF4444", className: "text-rose-400" };
}
