/** Coerce unknown input into a finite number, falling back when invalid. */
export function toFiniteNumber(val: unknown, fallback = 0): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Mandatory safe locale number formatting for display.
 * Never throws on `undefined`, `null`, NaN, non-finite, or non-numeric values.
 */
export function safeFormatNumber(
  val: any,
  options?: Intl.NumberFormatOptions
): string {
  const fallback = (): string => {
    try {
      return (0).toLocaleString(undefined, options);
    } catch {
      return "0";
    }
  };

  if (val === null || val === undefined) return fallback();
  const num = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num)) return fallback();
  try {
    return num.toLocaleString(undefined, options);
  } catch {
    return fallback();
  }
}

/**
 * @deprecated Prefer `safeFormatNumber` — kept as an alias for existing call sites.
 */
export function formatNumber(
  val: unknown,
  options?: Intl.NumberFormatOptions
): string {
  return safeFormatNumber(val, options);
}

/**
 * Safe currency display (`$1,234.56` by default).
 * Pass `{ symbol: false }` for the numeric portion only.
 */
export function formatCurrency(
  val: unknown,
  options?: { digits?: number; symbol?: boolean }
): string {
  const digits = options?.digits ?? 2;
  const formatted = safeFormatNumber(val, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (options?.symbol === false) return formatted;
  return `$${formatted}`;
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
