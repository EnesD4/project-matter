import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  acknowledgeTrophyUnlock,
  subscribeTrophyUnlocks,
  trophyUnlockMessage,
  type Trophy,
} from "../lib/achievements";
import { BadgeDisk } from "./TrophyCabinet";

const AUTO_DISMISS_MS = 15_000;
const EXIT_MS = 280;
const SWIPE_LOCK_PX = 10;
const SWIPE_DISMISS_PX = 80;
const SWIPE_VELOCITY = 0.55;

type ExitDir = "up" | "left" | "right";

type AchievementBannerProps = {
  userName: string;
};

export default function AchievementBanner({ userName }: AchievementBannerProps) {
  const [current, setCurrent] = useState<Trophy | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [snapBack, setSnapBack] = useState(false);
  const [exitDir, setExitDir] = useState<ExitDir>("up");
  const queueRef = useRef<Trophy[]>([]);
  const currentRef = useRef<Trophy | null>(null);
  const leavingRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const showNextRef = useRef<() => void>(() => {});
  const dismissRef = useRef<(dir?: ExitDir) => void>(() => {});
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    axis: "pending" | "x" | "y";
  } | null>(null);

  currentRef.current = current;
  leavingRef.current = leaving;

  const clearTimers = () => {
    if (dismissTimerRef.current != null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  };

  const resetDrag = () => {
    dragSessionRef.current = null;
    setDragX(0);
    setDragging(false);
    setSnapBack(false);
  };

  showNextRef.current = () => {
    const next = queueRef.current.shift() ?? null;
    setLeaving(false);
    setExitDir("up");
    resetDrag();
    setCurrent(next);
    if (!next) return;
    dismissTimerRef.current = window.setTimeout(() => dismissRef.current("up"), AUTO_DISMISS_MS);
  };

  dismissRef.current = (dir: ExitDir = "up") => {
    if (!currentRef.current || leavingRef.current) return;
    const dismissed = currentRef.current;
    clearTimers();
    dragSessionRef.current = null;
    setDragging(false);
    setSnapBack(false);
    setDragX(0);
    acknowledgeTrophyUnlock(dismissed.id);
    setExitDir(dir);
    setLeaving(true);
    exitTimerRef.current = window.setTimeout(() => {
      setCurrent(null);
      setLeaving(false);
      setExitDir("up");
      showNextRef.current();
    }, EXIT_MS);
  };

  useEffect(() => {
    const ingest = (trophies: Trophy[]) => {
      const seen = new Set(queueRef.current.map((trophy) => trophy.id));
      if (currentRef.current) seen.add(currentRef.current.id);
      for (const trophy of trophies) {
        if (!trophy?.id || seen.has(trophy.id)) continue;
        queueRef.current.push(trophy);
        seen.add(trophy.id);
      }
      if (!currentRef.current && !leavingRef.current) showNextRef.current();
    };
    return subscribeTrophyUnlocks(ingest);
  }, []);

  useEffect(() => () => clearTimers(), []);

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragSessionRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    if (cancelled || session.axis !== "x") {
      setDragging(false);
      setSnapBack(false);
      setDragX(0);
      return;
    }
    const elapsed = Math.max(1, event.timeStamp - session.lastT);
    const velocity = (event.clientX - session.lastX) / elapsed;
    const offset = event.clientX - session.startX;
    const shouldDismiss =
      Math.abs(offset) >= SWIPE_DISMISS_PX || Math.abs(velocity) >= SWIPE_VELOCITY;
    if (shouldDismiss) {
      dismissRef.current(offset > 0 || velocity > 0 ? "right" : "left");
      return;
    }
    setDragging(false);
    setSnapBack(true);
    setDragX(0);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (leaving || event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest("button")) return;
    setSnapBack(false);
    dragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastT: event.timeStamp,
      axis: "pending",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId || leaving) return;
    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    if (session.axis === "pending") {
      if (Math.abs(dx) < SWIPE_LOCK_PX && Math.abs(dy) < SWIPE_LOCK_PX) return;
      session.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (session.axis === "y") return;
      setDragging(true);
    }
    if (session.axis !== "x") return;
    event.preventDefault();
    session.lastX = event.clientX;
    session.lastT = event.timeStamp;
    setDragX(dx);
  };

  if (!current || typeof document === "undefined") return null;

  const swipeExit = leaving && exitDir !== "up";
  const cardClass = [
    "achievement-banner__card",
    swipeExit ? "achievement-banner__card--out-x" : "",
    dragging ? "achievement-banner__card--dragging" : "",
    snapBack && !leaving ? "achievement-banner__card--snap" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const fade = dragging ? Math.max(0.4, 1 - Math.abs(dragX) / 280) : 1;
  const cardStyle = swipeExit
    ? {
        transform: exitDir === "left" ? "translateX(-120%)" : "translateX(120%)",
        opacity: 0,
      }
    : dragging || dragX !== 0
      ? { transform: `translateX(${dragX}px)`, opacity: fade }
      : undefined;

  return createPortal(
    <div className="achievement-banner" role="status" aria-live="polite">
      <div
        className={`achievement-banner__stage${
          leaving && exitDir === "up" ? " achievement-banner__stage--out" : ""
        }`}
      >
        <div
          className={cardClass}
          style={cardStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endDrag(event, false)}
          onPointerCancel={(event) => endDrag(event, true)}
        >
          <BadgeDisk trophy={current} size="banner" />
          <p className="min-w-0 flex-1 pt-0.5 text-[15px] font-semibold leading-snug text-[#E5E7EB]">
            {trophyUnlockMessage(current, userName)}
          </p>
          <button
            type="button"
            onClick={() => dismissRef.current("up")}
            aria-label="Dismiss achievement"
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[#9CA3AF] transition hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
