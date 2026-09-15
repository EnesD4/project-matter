import {
  Check,
  ChevronLeft,
  LineChart,
  Map,
  PiggyBank,
  Sparkles,
  Trophy,
  Wallet,
} from "lucide-react";
import React, { useEffect, useId, useMemo, useState } from "react";
import { useFinancialRoadmap, useRoadmapTodoProgress } from "../hooks/useFinancialRoadmap";
import { playAchievementFanfare, playSuccessChime } from "../lib/audioService";
import { getStoredUser } from "../lib/auth";
import {
  buildFinancialDiagnostics,
  tenYearWealthProjection,
  type FinancialDiagnostics,
} from "../lib/financialDiagnostics";
import { LESSON_PROGRESS_UPDATED_EVENT, levelFromXp, readLessonProgress } from "../lib/lessonProgress";
import { formatCurrency, formatNumber, toFiniteNumber } from "../lib/money";
import { categoryIcon } from "../lib/categoryIcons";
import {
  ROADMAP_QUEST_IDS,
  loadFinancialProfile,
  requestFinancialOnboarding,
  toggleRoadmapTask,
  type RoadmapTask,
} from "../lib/roadmapService";
import RoadmapGlyph from "./RoadmapGlyph";

const BURST_COLORS = ["#10B981", "#34D399", "#F59E0B", "#FBBF24", "#38BDF8", "#F472B6"];

export type FinancialRoadmapPanelProps = {
  open: boolean;
  onClose: () => void;
  diagnostics?: FinancialDiagnostics | null;
  privacyMode?: boolean;
  onOpenPaperTrading?: () => void;
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

function money(value: number): string {
  return formatCurrency(value, { digits: 0 });
}

export default function FinancialRoadmapPanel({
  open,
  onClose,
  diagnostics: diagnosticsProp,
  onOpenPaperTrading,
}: FinancialRoadmapPanelProps) {
  const sliderId = useId();
  const roadmap = useFinancialRoadmap();
  const todoProgress = useRoadmapTodoProgress();
  const [xp, setXp] = useState(() => readLessonProgress(getStoredUser()?.id).xp);
  const [burstId, setBurstId] = useState<string | null>(null);
  const [floatXp, setFloatXp] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [cutPct, setCutPct] = useState(25);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  const diagnostics = useMemo(() => {
    if (diagnosticsProp) return diagnosticsProp;
    const profile = loadFinancialProfile();
    return buildFinancialDiagnostics({
      income: profile?.monthlyIncome,
      profile: profile
        ? {
            monthlyIncome: profile.monthlyIncome,
            monthlyEssentialExpenses: profile.monthlyEssentialExpenses,
          }
        : null,
    });
  }, [diagnosticsProp]);

  useEffect(() => {
    const nextId =
      diagnostics.recommendationTarget?.id ?? diagnostics.topDiscretionary[0]?.id ?? null;
    setSelectedCatId((prev) => {
      if (prev && diagnostics.topDiscretionary.some((item) => item.id === prev)) return prev;
      return nextId;
    });
  }, [diagnostics.recommendationTarget?.id, diagnostics.topDiscretionary]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  const selected =
    diagnostics.topDiscretionary.find((item) => item.id === selectedCatId) ||
    diagnostics.recommendationTarget ||
    diagnostics.topDiscretionary[0] ||
    null;

  const monthlyCut = useMemo(() => {
    if (!selected) return 0;
    return Math.round(selected.amount * (Math.min(100, Math.max(0, cutPct)) / 100) * 100) / 100;
  }, [selected, cutPct]);

  const projection = useMemo(() => tenYearWealthProjection(monthlyCut), [monthlyCut]);

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

  const stepMeta = (todo: RoadmapTask, index: number) => {
    if (todo.id === ROADMAP_QUEST_IDS.cashFlowDebt || index === 0) {
      return { Icon: Wallet, accent: "text-amber-300", border: "border-amber-500/30" };
    }
    if (todo.id === ROADMAP_QUEST_IDS.microSavings || index === 1) {
      return { Icon: PiggyBank, accent: "text-sky-300", border: "border-sky-500/30" };
    }
    return { Icon: LineChart, accent: "text-emerald-300", border: "border-emerald-500/30" };
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-x-hidden bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="matter-pop flex max-h-[min(92vh,820px)] w-full max-w-md flex-col overflow-hidden overflow-x-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="financial-roadmap-panel-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close roadmap"
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-[#1F1F1F] bg-[#121212] text-slate-200"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h3 id="financial-roadmap-panel-title" className="m-0 truncate text-sm font-extrabold text-white">
                Personal Financial Roadmap
              </h3>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-neutral-500">
                {roadmap ? (
                  <span className="inline-flex max-w-full items-center gap-1">
                    <RoadmapGlyph archetype={roadmap.archetype} size={12} color={roadmap.accent} />
                    AI quest · {doneCount}/{total} milestones
                  </span>
                ) : (
                  "Build a money profile to unlock quests"
                )}
              </p>
            </div>
          </div>
          <div className="relative max-w-[42%] flex-shrink-0 truncate rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-extrabold text-amber-300">
            Lv {levelFromXp(xp)} · {formatNumber(xp)} XP
            {floatKey > 0 && floatXp > 0 && (
              <span
                key={floatKey}
                className="lesson-xp-float absolute -top-3 right-0 text-[11px] font-extrabold text-emerald-400"
              >
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
                Connect a bank or apply a demo profile to unlock your interactive quest path.
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
                <p
                  className="text-[10px] font-extrabold uppercase tracking-[0.14em]"
                  style={{ color: roadmap.accent }}
                >
                  Your path
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
                  {doneCount} of {total} quest milestones complete
                </p>
              </div>

              <ol className="mt-3 m-0 list-none space-y-3 p-0">
                {todos.map((todo, index) => {
                  const checked = completed.has(todo.id);
                  const { Icon, accent, border } = stepMeta(todo, index);
                  const isMicro = todo.id === ROADMAP_QUEST_IDS.microSavings || index === 1;
                  const isGrowth = todo.id === ROADMAP_QUEST_IDS.compoundGrowth || index === 2;
                  const isCashFlow = todo.id === ROADMAP_QUEST_IDS.cashFlowDebt || index === 0;

                  return (
                    <li key={todo.id}>
                      <div
                        className={`relative overflow-hidden rounded-2xl border px-3 py-3 transition ${
                          checked
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : `${border} bg-black/30`
                        }`}
                      >
                        {burstId === todo.id && <Burst seed={index + floatKey} />}
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggle(todo)}
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
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <p
                                className={`m-0 flex min-w-0 items-start gap-1.5 text-[13px] font-extrabold leading-snug ${
                                  checked ? "text-emerald-100" : "text-white"
                                }`}
                              >
                                <Icon
                                  size={14}
                                  className={`mt-0.5 flex-shrink-0 ${checked ? "text-emerald-300" : accent}`}
                                  aria-hidden
                                />
                                <span
                                  className={`min-w-0 break-words [overflow-wrap:anywhere] ${
                                    checked ? "line-through decoration-emerald-500/60" : ""
                                  }`}
                                >
                                  Step {index + 1}: {todo.title}
                                </span>
                              </p>
                              <span className="flex-shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300">
                                +{todo.xp} XP
                              </span>
                            </div>
                            <p
                              className={`mt-1 mb-0 text-[11px] font-semibold leading-snug ${
                                checked ? "text-emerald-200/70" : "text-neutral-500"
                              }`}
                            >
                              {todo.detail}
                            </p>

                            {isCashFlow && (
                              <div className="mt-3 grid grid-cols-3 gap-2">
                                <div className="rounded-lg border border-[#1F2937] bg-black/40 px-2 py-2">
                                  <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-[#6B7280]">
                                    Income
                                  </p>
                                  <p className="mt-1 mb-0 text-[12px] font-extrabold tabular-nums text-emerald-300">
                                    {money(diagnostics.income)}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-[#1F2937] bg-black/40 px-2 py-2">
                                  <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-[#6B7280]">
                                    Net flow
                                  </p>
                                  <p
                                    className={`mt-1 mb-0 text-[12px] font-extrabold tabular-nums ${
                                      diagnostics.netCashFlow >= 0 ? "text-emerald-300" : "text-rose-300"
                                    }`}
                                  >
                                    {diagnostics.netCashFlow >= 0 ? "+" : "−"}
                                    {money(Math.abs(diagnostics.netCashFlow))}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-[#1F2937] bg-black/40 px-2 py-2">
                                  <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-[#6B7280]">
                                    Credit debt
                                  </p>
                                  <p className="mt-1 mb-0 text-[12px] font-extrabold tabular-nums text-amber-200">
                                    {money(diagnostics.creditDebt)}
                                  </p>
                                </div>
                              </div>
                            )}

                            {isMicro && (
                              <div className="mt-3 space-y-2">
                                {diagnostics.topDiscretionary.length > 0 ? (
                                  <div className="flex gap-2">
                                    {diagnostics.topDiscretionary.map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setSelectedCatId(item.id)}
                                        aria-pressed={selected?.id === item.id}
                                        className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border px-2 py-2 text-left transition ${
                                          selected?.id === item.id
                                            ? "border-sky-400/45 bg-sky-500/15 text-white"
                                            : "border-[#1F2937] bg-[#0A0A0A] text-[#D1D5DB]"
                                        }`}
                                      >
                                        <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-[#9CA3AF]">
                                          <span className="text-sky-300/90" aria-hidden>
                                            {categoryIcon(item.label, 11)}
                                          </span>
                                          <span className="truncate">{item.label}</span>
                                        </span>
                                        <span className="text-[12px] font-extrabold tabular-nums">
                                          {money(item.amount)}
                                          <span className="ml-0.5 text-[9px] font-semibold text-[#6B7280]">/mo</span>
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="m-0 text-[11px] font-semibold text-neutral-500">
                                    Link spending to unlock category cutbacks.
                                  </p>
                                )}
                                {selected && (
                                  <label htmlFor={sliderId} className="block">
                                    <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-400">
                                      <span>Cut {selected.label}</span>
                                      <span className="tabular-nums text-sky-300">
                                        {money(monthlyCut)}/mo · {cutPct}%
                                      </span>
                                    </div>
                                    <input
                                      id={sliderId}
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={5}
                                      value={cutPct}
                                      onChange={(event) => setCutPct(toFiniteNumber(event.target.value, 0))}
                                      className="matter-diag-slider w-full accent-sky-400"
                                    />
                                  </label>
                                )}
                              </div>
                            )}

                            {isGrowth && (
                              <div className="mt-3 space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="rounded-lg border border-[#1F2937] bg-black/40 px-2 py-2">
                                    <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-[#6B7280]">
                                      At 8%
                                    </p>
                                    <p className="mt-1 mb-0 text-[12px] font-extrabold tabular-nums text-emerald-300">
                                      {money(projection.at8)}
                                    </p>
                                  </div>
                                  <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-2">
                                    <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-sky-300/80">
                                      At 9%
                                    </p>
                                    <p className="mt-1 mb-0 text-[12px] font-extrabold tabular-nums text-white">
                                      {money(projection.at9)}
                                    </p>
                                  </div>
                                  <div className="rounded-lg border border-[#1F2937] bg-black/40 px-2 py-2">
                                    <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-[#6B7280]">
                                      At 10%
                                    </p>
                                    <p className="mt-1 mb-0 text-[12px] font-extrabold tabular-nums text-emerald-300">
                                      {money(projection.at10)}
                                    </p>
                                  </div>
                                </div>
                                <p className="m-0 text-[10px] font-semibold leading-snug text-[#6B7280]">
                                  10-year illustration if you invest {money(monthlyCut)}/mo · educational only
                                </p>
                                {onOpenPaperTrading ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!checked) handleToggle(todo);
                                      onClose();
                                      onOpenPaperTrading();
                                    }}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-2.5 text-[12px] font-extrabold text-emerald-200 transition hover:bg-emerald-500/25"
                                  >
                                    <LineChart size={14} aria-hidden />
                                    Practice with Paper Trading
                                  </button>
                                ) : null}
                              </div>
                            )}
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
                    Quest cleared. Keep the automations running — your lessons stay pinned to this plan.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
