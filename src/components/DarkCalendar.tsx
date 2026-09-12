import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { parseISODate, toISODate, todayISODate } from "../lib/age";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type DarkCalendarProps = {
  value: string;
  min?: string;
  max?: string;
  onChange: (iso: string) => void;
  labelledBy?: string;
};

type CalendarCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

function clampDate(date: Date, min: Date, max: Date) {
  if (date < min) return new Date(min);
  if (date > max) return new Date(max);
  return date;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildCells(view: Date): CalendarCell[] {
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    const day = daysInPrev - firstWeekday + 1 + i;
    const date = new Date(year, month - 1, day);
    cells.push({ iso: toISODate(date), day, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ iso: toISODate(new Date(year, month, day)), day, inMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const day = cells.length - firstWeekday - daysInMonth + 1;
    const date = new Date(year, month + 1, day);
    cells.push({ iso: toISODate(date), day, inMonth: false });
  }
  return cells;
}

export default function DarkCalendar({
  value,
  min = "1970-01-01",
  max,
  onChange,
  labelledBy,
}: DarkCalendarProps) {
  const today = todayISODate();
  const maxIso = max && max < today ? max : today;
  const minDate = parseISODate(min) ?? new Date(1970, 0, 1);
  const maxDate = parseISODate(maxIso) ?? new Date();
  const selected = parseISODate(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfMonth(clampDate(selected ?? new Date(), minDate, maxDate)));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  const cells = useMemo(() => buildCells(view), [view]);
  const minMonth = startOfMonth(minDate);
  const maxMonth = startOfMonth(maxDate);
  const canPrevMonth = view > minMonth;
  const canNextMonth = view < maxMonth;
  const canPrevYear = canPrevMonth;
  const canNextYear = canNextMonth;

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    setView(startOfMonth(clampDate(selected ?? new Date(), minDate, maxDate)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- sync view when the popover opens

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const position = () => {
      const rect = trigger.getBoundingClientRect();
      const gap = 8;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      let top = rect.bottom + gap;
      let right = window.innerWidth - rect.right;

      if (window.innerWidth - right - width < 8) {
        right = Math.max(8, window.innerWidth - width - 8);
      }
      if (top + height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - gap - height);
      }

      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = `${Math.round(right)}px`;
      panel.style.left = "auto";
    };

    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const pick = (iso: string) => {
    if (iso < min || iso > maxIso) return;
    onChange(iso);
    close();
  };

  const jumpMonth = (delta: number) => {
    setView((current) => startOfMonth(clampDate(shiftMonth(current, delta), minDate, maxDate)));
  };

  const jumpYear = (delta: number) => {
    setView((current) =>
      startOfMonth(clampDate(new Date(current.getFullYear() + delta, current.getMonth(), 1), minDate, maxDate))
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Choose purchase date from calendar"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-md transition ${
          open ? "bg-emerald-500/15 text-emerald-300" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
        }`}
      >
        <CalendarDays size={14} aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={dialogId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              className="matter-calendar"
            >
              <div className="matter-calendar__nav">
                <button
                  type="button"
                  className="matter-calendar__nav-btn"
                  aria-label="Previous year"
                  disabled={!canPrevYear}
                  onClick={() => jumpYear(-1)}
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  className="matter-calendar__nav-btn"
                  aria-label="Previous month"
                  disabled={!canPrevMonth}
                  onClick={() => jumpMonth(-1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <p className="matter-calendar__title">
                  {MONTHS[view.getMonth()]} {view.getFullYear()}
                </p>
                <button
                  type="button"
                  className="matter-calendar__nav-btn"
                  aria-label="Next month"
                  disabled={!canNextMonth}
                  onClick={() => jumpMonth(1)}
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  className="matter-calendar__nav-btn"
                  aria-label="Next year"
                  disabled={!canNextYear}
                  onClick={() => jumpYear(1)}
                >
                  <ChevronsRight size={14} />
                </button>
              </div>

              <div className="matter-calendar__grid">
                {WEEKDAYS.map((label) => (
                  <span key={label} className="matter-calendar__dow">
                    {label}
                  </span>
                ))}
                {cells.map((cell, index) => {
                  const disabled = cell.iso < min || cell.iso > maxIso;
                  const selectedDay = cell.iso === value;
                  const isToday = cell.iso === today;
                  return (
                    <button
                      key={`${cell.iso}-${index}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(cell.iso)}
                      className={`matter-calendar__day${cell.inMonth ? "" : " matter-calendar__day--muted"}${
                        selectedDay ? " matter-calendar__day--selected" : ""
                      }${isToday && !selectedDay ? " matter-calendar__day--today" : ""}`}
                      aria-pressed={selectedDay}
                      aria-current={isToday ? "date" : undefined}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
