const pad = (n: number) => String(n).padStart(2, "0");

export type DateDisplayOrder = "MDY" | "DMY";

function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function isoToDisplayDate(iso: string, order: DateDisplayOrder = "MDY"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  const year = match[1];
  const month = match[2];
  const day = match[3];
  return order === "DMY" ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

export function isoToUsDate(iso: string): string {
  return isoToDisplayDate(iso, "MDY");
}

export function todayUsDate(now = new Date()): string {
  return `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`;
}

export function toDisplayDate(raw: string, order: DateDisplayOrder = "MDY"): string {
  const iso = parseToIsoDate(raw, order);
  return iso ? isoToDisplayDate(iso, order) : raw;
}

/** Display any accepted date as MM/DD/YYYY. */
export function toUsDateDisplay(raw: string): string {
  return toDisplayDate(raw, "MDY");
}

/**
 * Keep YYYY-MM-DD internally.
 * Slash dates: if one side is > 12 it is unambiguous; otherwise honor `order`.
 */
export function parseToIsoDate(raw: string, order: DateDisplayOrder = "MDY"): string | null {
  const text = raw.trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return buildIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!slashed) return null;

  const first = Number(slashed[1]);
  const second = Number(slashed[2]);
  const year = Number(slashed[3]);

  if (first > 12 && second <= 12) return buildIso(year, second, first);
  if (second > 12 && first <= 12) return buildIso(year, first, second);
  return order === "DMY" ? buildIso(year, second, first) : buildIso(year, first, second);
}

/**
 * Insert '/' immediately after month and day digits (MM/DD/YYYY by default).
 * Pass the previous field value so backspace can remove a trailing slash.
 */
export function maskDateInput(raw: string, order: DateDisplayOrder = "MDY", previous = ""): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const iso = parseToIsoDate(trimmed, order);
    if (iso) return isoToDisplayDate(iso, order);
  }

  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const deleting = raw.length < previous.length;

  if (digits.length === 0) return "";
  if (digits.length < 2) return digits;
  if (digits.length === 2) return deleting ? digits : `${digits}/`;
  if (digits.length < 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length === 4) {
    const monthDay = `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
    return deleting ? monthDay : `${monthDay}/`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Insert slashes while typing digits; convert a pasted ISO date to US format. */
export function maskUsDateInput(raw: string): string {
  return maskDateInput(raw, "MDY");
}
