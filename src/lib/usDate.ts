const pad = (n: number) => String(n).padStart(2, "0");

export function isoToUsDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

export function todayUsDate(now = new Date()): string {
  return `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`;
}

/** Display any accepted date as MM/DD/YYYY. */
export function toUsDateDisplay(raw: string): string {
  const iso = parseToIsoDate(raw);
  return iso ? isoToUsDate(iso) : raw;
}

/** Keep YYYY-MM-DD internally; show and accept MM/DD/YYYY in the UI. */
export function parseToIsoDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = Number(us[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Insert slashes while typing digits; convert a pasted ISO date to US format. */
export function maskUsDateInput(raw: string): string {
  const trimmed = raw.trim();
  const iso = parseToIsoDate(trimmed);
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return isoToUsDate(iso);

  if (raw.includes("/")) {
    return raw.replace(/[^\d/]/g, "").slice(0, 10);
  }

  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
