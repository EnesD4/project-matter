import { Star } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { XP_PER_LEVEL, levelFromXp, xpIntoLevel } from "../lib/lessonProgress";
import StreakBadge from "./StreakBadge";

type LessonsHeaderProps = {
  xp: number;
  streak: number;
  compact?: boolean;
};

export default function LessonsHeader({ xp, streak, compact = false }: LessonsHeaderProps) {
  const prevXp = useRef(xp);
  const prevStreak = useRef(streak);
  const [floatKey, setFloatKey] = useState(0);
  const [floatAmount, setFloatAmount] = useState(0);
  const [streakBump, setStreakBump] = useState(false);

  useEffect(() => {
    const delta = xp - prevXp.current;
    prevXp.current = xp;
    if (delta <= 0) return;
    setFloatAmount(delta);
    setFloatKey((key) => key + 1);
  }, [xp]);

  useEffect(() => {
    const rose = streak > prevStreak.current;
    prevStreak.current = streak;
    if (!rose) return;
    setStreakBump(true);
    const timer = window.setTimeout(() => setStreakBump(false), 1400);
    return () => window.clearTimeout(timer);
  }, [streak]);

  const level = levelFromXp(xp);
  const into = xpIntoLevel(xp);
  const pct = Math.min(100, Math.round((into / XP_PER_LEVEL) * 100));

  return (
    <div
      className={`rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`grid flex-shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400 ${
              compact ? "h-8 w-8" : "h-9 w-9"
            }`}
          >
            <Star size={compact ? 14 : 16} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Level {level} · {into}/{XP_PER_LEVEL} XP
            </p>
            <div className="relative mt-1">
              <p className={`font-extrabold leading-tight text-white ${compact ? "text-sm" : "text-base"}`}>
                {xp.toLocaleString("en-US")} XP
              </p>
              {floatKey > 0 && floatAmount > 0 && (
                <span key={floatKey} className="lesson-xp-float absolute -right-1 -top-3 text-[11px] font-extrabold text-emerald-400">
                  +{floatAmount} XP
                </span>
              )}
            </div>
          </div>
        </div>

        <StreakBadge streak={streak} size={compact ? "sm" : "md"} bump={streakBump} />
      </div>

      <div className={`relative ${compact ? "mt-2" : "mt-2.5"}`}>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-emerald-400 to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
