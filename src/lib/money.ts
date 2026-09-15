import { safeToLocaleString } from "../utils/formatters";

/** Coerce unknown input into a finite number, falling back when invalid. */
export function toFiniteNumber(val: unknown, fallback = 0): number {
  const resolveFallback = (): number => {
    if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
    const n = Number(fallback);
    return Number.isFinite(n) ? n : 0;
  };

  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return resolveFallback();
}

/**
 * Mandatory safe locale number formatting for display.
 * Never throws on `undefined`, `null`, NaN, non-finite, or non-numeric values.
 * Delegates to the central `safeToLocaleString` helper.
 */
export function safeFormatNumber(
  val: any,
  options?: Intl.NumberFormatOptions
): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return safeToLocaleString(0, "en-US", options);
  }
  const num = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return safeToLocaleString(0, "en-US", options);
  }
  return safeToLocaleString(num, "en-US", options);
}

/**
 * @deprecated Prefer `safeFormatNumber` — kept as an alias for existing call sites.
 */
export function formatNumber(
  val: unknown,
  options?: Intl.NumberFormatOptions
): string {
  if (val === undefined || val === null || isNaN(Number(val))) {
    return safeFormatNumber(0, options);
  }
  return safeFormatNumber(val, options);
}

/**
 * Safe currency display (`$1,234.56` by default).
 * Pass `{ symbol: false }` for the numeric portion only.
 */
export function formatCurrency(
  val: any,
  options?: { digits?: number; symbol?: boolean }
): string {
  if (val === undefined || val === null || isNaN(Number(val))) {
    return options?.symbol === false ? "0.00" : "$0.00";
  }
  const digits = options?.digits ?? 2;
  const formatted = safeToLocaleString(val, "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (options?.symbol === false) {
    return formatted.replace(/^\$/, "");
  }
  return formatted;
}

/** Safe percent display (`12.34%`). Never throws on undefined/null/NaN. */
export function formatPercent(val: any, digits = 2): string {
  if (val === undefined || val === null || isNaN(Number(val))) {
    return `${(0).toFixed(digits)}%`;
  }
  const n = toFiniteNumber(val, 0);
  return `${safeToLocaleString(n, "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** Signed change percent (`+12.34%` / `-12.34%`) for gains/losses. */
export function formatSignedPercent(val: any, digits = 2): string {
  if (val === undefined || val === null || isNaN(Number(val))) {
    return `${(0).toFixed(digits)}%`;
  }
  const n = toFiniteNumber(val, 0);
  const abs = Math.abs(n).toFixed(digits);
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `-${abs}%`;
  return `${abs}%`;
}

/** Strip currency formatting and parse a typed money string into a finite number. */
export function parseCurrency(raw: string): number {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
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
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  if (cleaned === "") return "";

  const firstDot = cleaned.indexOf(".");
  const hasDot = firstDot !== -1;
  const intRaw = hasDot ? cleaned.slice(0, firstDot) : cleaned;
  const fracRaw = hasDot ? cleaned.slice(firstDot + 1).replace(/\./g, "") : "";
  const intNum = intRaw === "" ? 0 : Number(intRaw);
  const formattedInt = Number.isFinite(intNum) ? safeFormatNumber(intNum) : "0";
  const formatted = hasDot ? `${formattedInt}.${fracRaw}` : formattedInt;

  if (options?.symbol) return `$${formatted}`;
  return formatted;
}

/** Display a stored number as a formatted input value (empty when zero). */
export function formatCurrencyValue(amount: unknown, options?: { symbol?: boolean }): string {
  const n = toFiniteNumber(amount, 0);
  if (n === 0) return "";
  const formatted = safeFormatNumber(n, { maximumFractionDigits: 2 });
  if (options?.symbol) return `$${formatted}`;
  return formatted;
}

export { safeToLocaleString } from "../utils/formatters";
