/** Strip currency formatting and parse a typed money string into a finite number. */
export function parseCurrency(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "" || cleaned === ".") return 0;
  const firstDot = cleaned.indexOf(".");
  const normalized =
    firstDot === -1
      ? cleaned
      : `${cleaned.slice(0, firstDot) || "0"}.${cleaned.slice(firstDot + 1).replace(/\./g, "")}`;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Live-format a typed money string with thousand separators.
 * Keeps a trailing decimal point and fractional digits while the user is typing.
 */
export function formatCurrencyInput(raw: string, options?: { symbol?: boolean }): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return "";

  const firstDot = cleaned.indexOf(".");
  const hasDot = firstDot !== -1;
  const intRaw = hasDot ? cleaned.slice(0, firstDot) : cleaned;
  const fracRaw = hasDot ? cleaned.slice(firstDot + 1).replace(/\./g, "") : "";
  const intNum = intRaw === "" ? 0 : Number(intRaw);
  const formattedInt = Number.isFinite(intNum) ? intNum.toLocaleString("en-US") : "0";
  const formatted = hasDot ? `${formattedInt}.${fracRaw}` : formattedInt;

  if (options?.symbol) return `$${formatted}`;
  return formatted;
}

/** Display a stored number as a formatted input value (empty when zero). */
export function formatCurrencyValue(amount: number, options?: { symbol?: boolean }): string {
  if (!Number.isFinite(amount) || amount === 0) return "";
  const formatted = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (options?.symbol) return `$${formatted}`;
  return formatted;
}
