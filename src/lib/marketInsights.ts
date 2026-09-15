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

/** Regular session open (ET minutes from midnight): 09:30. */
const SESSION_OPEN_MINUTES = 9 * 60 + 30;
/** Regular session close (ET minutes from midnight): 16:00. */
const SESSION_CLOSE_MINUTES = 16 * 60;
/**
 * First hour of the cash session is for tape to establish.
 * Daily report generation unlocks at 10:30 ET (17:30 TRT).
 */
const REPORT_UNLOCK_MINUTES = 10 * 60 + 30;

function isRegularTradingDay(date = new Date()): boolean {
  const { weekday, month, day } = getNyParts(date);
  return !isWeekend(weekday) && !isHoliday(month, day);
}

/** True when NYSE/Nasdaq regular session is open (Mon–Fri 9:30–16:00 ET / 16:30–23:00 TRT, non-holiday). */
export function isUsMarketOpen(date = new Date()): boolean {
  if (!isRegularTradingDay(date)) return false;
  const { minutes } = getNyParts(date);
  return minutes >= SESSION_OPEN_MINUTES && minutes < SESSION_CLOSE_MINUTES;
}

/**
 * Daily report may be generated only while the US cash session is open
 * and after the first trading hour (from 10:30 ET / 17:30 TRT onward).
 */
export function canGenerateDailyReport(date = new Date()): boolean {
  if (!isRegularTradingDay(date)) return false;
  const { minutes } = getNyParts(date);
  return minutes >= REPORT_UNLOCK_MINUTES && minutes < SESSION_CLOSE_MINUTES;
}

export type DailyReportAvailability = {
  marketOpen: boolean;
  /** True when the Get Daily Report control should render (market open). */
  showButton: boolean;
  /** True when generation is allowed (open + after 10:30 ET). */
  canGenerate: boolean;
  /** Short UI hint when the button is visible but generation is still locked. */
  lockReason: string | null;
};

export function getDailyReportAvailability(date = new Date()): DailyReportAvailability {
  const marketOpen = isUsMarketOpen(date);
  const canGenerate = canGenerateDailyReport(date);
  return {
    marketOpen,
    showButton: marketOpen,
    canGenerate,
    lockReason:
      marketOpen && !canGenerate
        ? "Reports unlock at 10:30 ET (after the first hour of trading)."
        : null,
  };
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
