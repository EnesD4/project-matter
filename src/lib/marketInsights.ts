/**
 * US equity market session helpers (America/New_York) and daily-report title helpers.
 */

/** Rough fixed US market holidays (month is 1-based). Year-agnostic common dates. */
const US_MARKET_HOLIDAYS: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 1, day: 19, name: "Martin Luther King Jr. Day" },
  { month: 2, day: 16, name: "Presidents' Day" },
  { month: 4, day: 18, name: "Good Friday" },
  { month: 5, day: 25, name: "Memorial Day" },
  { month: 6, day: 19, name: "Juneteenth" },
  { month: 7, day: 4, name: "Independence Day" },
  { month: 9, day: 7, name: "Labor Day" },
  { month: 11, day: 26, name: "Thanksgiving" },
  { month: 12, day: 25, name: "Christmas Day" },
];

function getNyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday"); // Mon, Tue, ...
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour") === "24" ? "0" : get("hour"));
  const minute = Number(get("minute"));

  return { weekday, month, day, hour, minute, minutes: hour * 60 + minute };
}

function isWeekend(weekday: string) {
  return weekday === "Sat" || weekday === "Sun";
}

function isHoliday(month: number, day: number) {
  return US_MARKET_HOLIDAYS.some((h) => h.month === month && h.day === day);
}

/** True when NYSE/Nasdaq regular session is open (Mon–Fri 9:30–16:00 ET, non-holiday). */
export function isUsMarketOpen(date = new Date()): boolean {
  const { weekday, month, day, minutes } = getNyParts(date);
  if (isWeekend(weekday) || isHoliday(month, day)) return false;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return minutes >= open && minutes < close;
}

export function getMarketStatusHeader(date = new Date()): {
  marketOpen: boolean;
  title: string;
  subtitle: string;
} {
  const open = isUsMarketOpen(date);
  if (open) {
    return {
      marketOpen: true,
      title: "Today's US Market Overview",
      subtitle: "Live session · US equities",
    };
  }
  return {
    marketOpen: false,
    title: "Latest Market Wrap & Macro Outlook",
    subtitle: "After-hours / weekend summary",
  };
}
