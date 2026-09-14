import { Check, ChevronLeft, Map, Sparkles, Trophy } from "lucide-react";
import RoadmapGlyph from "./RoadmapGlyph";
import React, { useEffect, useMemo, useState } from "react";
import { useFinancialRoadmap, useRoadmapTodoProgress } from "../hooks/useFinancialRoadmap";
import { playAchievementFanfare, playSuccessChime } from "../lib/audioService";
import { getStoredUser } from "../lib/auth";
import { type FinanceTerm } from "../lib/financeTerms";
import { LESSON_PROGRESS_UPDATED_EVENT, levelFromXp, readLessonProgress } from "../lib/lessonProgress";
import {
  requestFinancialOnboarding,
  toggleRoadmapTask,
  type RoadmapTask,
} from "../lib/roadmapService";
import { formatNumber } from "../lib/money";
import { TermInfoPopover, TermRichText } from "./TermInfoPopover";

const BURST_COLORS = ["#10B981", "#34D399", "#F59E0B", "#FBBF24", "#38BDF8", "#F472B6"];

type FinancialRoadmapPanelProps = {
  open: boolean;
  onClose: () => void;
};

function Burst({ seed }: { seed: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => {
        const angle = (index / 16) * Math.PI * 2 + (seed % 7) * 0.15;
        const dist = 42 + ((seed + index * 13) % 28);
        return {
          id: index,
          dx: `${Math.cos(angle) * dist}px`,
          dy: `${Math.sin(angle) * dist}px`,
          color: BURST_COLORS[index % BURST_COLORS.length],
          delay: `${(index % 6) * 18}ms`,
        };
      }),
    [seed]
  );

  return (
    <div className="roadmap-burst" aria-hidden>
      {bits.map((bit) => (
        <span
          key={bit.id}
          className="roadmap-burst__bit"
          style={
            {
              background: bit.color,
              animationDelay: bit.delay,
              "--dx": bit.dx,
              "--dy": bit.dy,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default function FinancialRoadmapPanel({ open, onClose }: FinancialRoadmapPanelProps) {
  const roadmap = useFinancialRoadmap();
  const todoProgress = useRoadmapTodoProgress();
  const [xp, setXp] = useState(() => readLessonProgress(getStoredUser()?.id).xp);
  const [burstId, setBurstId] = useState<string | null>(null);
  const [floatXp, setFloatXp] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [openTerm, setOpenTerm] = useState<FinanceTerm | null>(null);

  useEffect(() => {
    if (!open) {
      setOpenTerm(null);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openTerm) {
        setOpenTerm(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, openTerm]);

  useEffect(() => {
    const refresh = () => setXp(readLessonProgress(getStoredUser()?.id).xp);
    refresh();
    window.addEventListener(LESSON_PROGRESS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(LESSON_PROGRESS_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!burstId) return;
    const timer = window.setTimeout(() => setBurstId(null), 780);
    return () => window.clearTimeout(timer);
  }, [burstId]);

  if (!open) return null;

  const completed = new Set(todoProgress.completedIds);
  const todos = roadmap?.todos ?? [];
  const doneCount = todos.filter((todo) => completed.has(todo.id)).length;
  const total = todos.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const handleToggle = (task: RoadmapTask) => {
    const nextComplete = !completed.has(task.id);
    const { awardedXp } = toggleRoadmapTask(task, nextComplete, getStoredUser()?.id);
    if (!nextComplete) return;
    playSuccessChime();
    setBurstId(task.id);
    if (awardedXp > 0) {
      setFloatXp(awardedXp);
      setFloatKey((key) => key + 1);
      setXp(readLessonProgress(getStoredUser()?.id).xp);
    }
    const willCompleteAll = todos.every((todo) => todo.id === task.id || completed.has(todo.id));
    if (willCompleteAll) playAchievementFanfare();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="matter-pop flex max-h-[min(92vh,760px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="financial-roadmap-panel-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to cash flow"
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-[#1F1F1F] bg-[#121212] text-slate-200"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-0">
              <h3 id="financial-roadmap-panel-title" className="m-0 text-sm font-extrabold text-white">
                Financial Roadmap
              </h3>
              <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                {roadmap ? (
                  <span className="inline-flex items-center gap-1">
                    <RoadmapGlyph archetype={roadmap.archetype} size={12} color={roadmap.accent} />
                    {roadmap.modeLabel}
                  </span>
                ) : (
                  "Build a money profile to unlock tasks"
                )}
              </p>
            </div>
          </div>
          <div className="relative flex-shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-extrabold text-amber-300">
            Lv {levelFromXp(xp)} · {formatNumber(xp)} XP
            {floatKey > 0 && floatXp > 0 && (
              <span key={floatKey} className="lesson-xp-float absolute -top-3 right-0 text-[11px] font-extrabold text-emerald-400">
                +{floatXp} XP
              </span>
            )}
          </div>
        </div>

        <div className="matter-dividend-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!roadmap ? (
            <div className="rounded-2xl border border-dashed border-neutral-800 bg-black/30 px-4 py-5 text-center">
              <Map size={22} className="mx-auto text-emerald-400" />
              <p className="mt-2 text-sm font-extrabold text-white">No roadmap yet</p>
              <p className="mt-1 text-[12px] font-semibold leading-snug text-neutral-500">
                Connect a demo bank or pick a mock profile to unlock a live to-do list.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  requestFinancialOnboarding(true);
                }}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-bold text-[#042F2E]"
              >
                <Sparkles size={14} />
                Build my roadmap
              </button>
            </div>
          ) : (
            <>
              <div
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: `${roadmap.accent}40`, background: roadmap.accentSoft }}
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: roadmap.accent }}>
                  Your archetype
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-base font-extrabold text-white">
                  <RoadmapGlyph archetype={roadmap.archetype} size={16} color={roadmap.accent} />
                  {roadmap.title}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-slate-200">{roadmap.summary}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/40">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${pct}%`, background: roadmap.accent }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-slate-400">
                  {doneCount} of {total} real-life tasks complete
                </p>
              </div>

              <ol className="mt-3 m-0 list-none space-y-2 p-0">
                {todos.map((todo, index) => {
                  const checked = completed.has(todo.id);
                  return (
                    <li key={todo.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleToggle(todo)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleToggle(todo);
                          }
                        }}
                        aria-pressed={checked}
                        className={`relative w-full cursor-pointer overflow-hidden rounded-2xl border px-3 py-3 text-left transition ${
                          checked
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : "border-[#1F1F1F] bg-black/30 hover:border-emerald-500/30"
                        }`}
                      >
                        {burstId === todo.id && <Burst seed={index + floatKey} />}
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggle(todo);
                            }}
                            aria-pressed={checked}
                            aria-label={`${checked ? "Uncomplete" : "Complete"} ${todo.title}`}
                            className={`mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-md border text-[12px] font-extrabold ${
                              checked
                                ? "border-emerald-400 bg-emerald-500 text-[#042F2E]"
                                : "border-neutral-600 bg-black/40 text-transparent"
                            }`}
                          >
                            {checked ? <Check size={14} strokeWidth={3} /> : "X"}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`m-0 text-[13px] font-extrabold leading-snug ${checked ? "text-emerald-100" : "text-white"}`}>
                                <span className={checked ? "line-through decoration-emerald-500/60" : undefined}>
                                  Step {index + 1}:{" "}
                                </span>
                                <TermRichText text={todo.title} onOpenTerm={setOpenTerm} strike={checked} />
                              </p>
                              <span className="flex-shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300">
                                +{todo.xp} XP
                              </span>
                            </div>
                            <p className={`mt-1 mb-0 text-[11px] font-semibold leading-snug ${checked ? "text-emerald-200/70" : "text-neutral-500"}`}>
                              <TermRichText text={todo.detail} onOpenTerm={setOpenTerm} strike={checked} />
                            </p>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {doneCount === total && total > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                  <Trophy size={16} className="flex-shrink-0 text-emerald-400" />
                  <p className="m-0 text-[12px] font-bold leading-snug text-emerald-100">
                    Roadmap cleared. Keep the automations running — your lessons stay pinned to this plan.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {openTerm && (
        <TermInfoPopover term={openTerm} onClose={() => setOpenTerm(null)} onLearnInLessons={onClose} />
      )}
    </div>
  );
}
