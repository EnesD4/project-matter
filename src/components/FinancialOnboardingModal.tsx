import {
  Check,
  ChevronDown,
  ChevronLeft,
  CreditCard,
  Landmark,
  MapPin,
  PiggyBank,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { playAchievementFanfare } from "../lib/audioService";
import { getStoredUser } from "../lib/auth";
import { formatCurrencyInput, formatCurrencyValue, parseCurrency } from "../lib/money";
import {
  GOAL_OPTIONS,
  KNOWLEDGE_OPTIONS,
  US_STATES,
  buildFinancialRoadmap,
  saveFinancialProfile,
  type Bottleneck,
  type FinancialProfileAnswers,
  type FinancialRoadmap,
  type KnowledgeLevel,
} from "../lib/roadmapService";

type Step = 1 | 2 | 3 | 4;
type Phase = "wizard" | "reveal";

type FinancialOnboardingModalProps = {
  open: boolean;
  allowCancel?: boolean;
  initialAnswers?: Partial<FinancialProfileAnswers> | null;
  onClose?: () => void;
  onComplete?: (roadmap: FinancialRoadmap) => void;
};

/** Flip to false after the review pass. Reopens the wizard on every refresh in `npm run dev`. */
const FORCE_ONBOARDING_ON_REFRESH = import.meta.env.DEV;
/** Survives modal remounts (App key changes) but resets on a real page reload. */
let forceOnboardingThisLoad = FORCE_ONBOARDING_ON_REFRESH;

function moneyDraft(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value === 0) return "0";
  return formatCurrencyValue(value);
}

function emptyDraft(initial?: Partial<FinancialProfileAnswers> | null) {
  return {
    stateCode: initial?.stateCode ?? null,
    incomeDraft: moneyDraft(initial?.monthlyIncome),
    expenseDraft: moneyDraft(initial?.monthlyEssentialExpenses),
    bottleneck: initial?.bottleneck ?? null,
    knowledgeLevel: initial?.knowledgeLevel ?? null,
  };
}

function usd(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${Math.abs(rounded).toLocaleString("en-US")}`;
}

function StateSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (code: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = US_STATES.find((state) => state.code === value) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return US_STATES;
    return US_STATES.filter(
      (state) =>
        state.name.toLowerCase().includes(needle) || state.code.toLowerCase().includes(needle)
    );
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlight(0);
      return;
    }
    const focusTimer = window.requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-state-index="${highlight}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-[#121212] px-3 transition focus-within:border-emerald-500/50">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="state-picker-dialog"
          className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left"
        >
          <MapPin size={14} className="flex-shrink-0 text-slate-500" aria-hidden />
          <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${selected ? "text-white" : "text-slate-500"}`}>
            {selected ? selected.name : "Select State"}
          </span>
        </button>
        {selected ? (
          <button
            type="button"
            aria-label="Clear state"
            onClick={() => onChange(null)}
            className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-slate-500 hover:bg-white/5 hover:text-white"
          >
            <X size={12} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open state picker"
            className="grid h-6 w-6 flex-shrink-0 place-items-center text-slate-500"
          >
            <ChevronDown size={14} aria-hidden />
          </button>
        )}
      </div>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/80 p-4 sm:items-center"
              role="presentation"
              onClick={() => setOpen(false)}
            >
              <div
                id="state-picker-dialog"
                className="matter-pop flex max-h-[min(80vh,560px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="state-picker-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-[#1F1F1F] px-4 py-3.5">
                  <div className="min-w-0">
                    <h3 id="state-picker-title" className="m-0 text-sm font-extrabold text-white">
                      Select State
                    </h3>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      Search or tap your US state
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close state picker"
                    className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-[#1F1F1F] text-slate-400 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="border-b border-[#1F1F1F] px-4 py-3">
                  <div className="flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-[#121212] px-3 focus-within:border-emerald-500/50">
                    <Search size={14} className="flex-shrink-0 text-slate-500" aria-hidden />
                    <input
                      ref={inputRef}
                      type="text"
                      role="combobox"
                      aria-expanded
                      aria-controls="state-selector-list"
                      aria-autocomplete="list"
                      aria-label="Search US states"
                      autoComplete="off"
                      spellCheck={false}
                      value={query}
                      placeholder="Type to search…"
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setHighlight((prev) => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
                          return;
                        }
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setHighlight((prev) => Math.max(prev - 1, 0));
                          return;
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const match = filtered[highlight];
                          if (match) pick(match.code);
                        }
                      }}
                      className="w-full bg-transparent py-2.5 text-sm font-semibold text-white outline-none placeholder:text-slate-600"
                    />
                    {query ? (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => {
                          setQuery("");
                          inputRef.current?.focus();
                        }}
                        className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-slate-500 hover:bg-white/5 hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <ul
                  id="state-selector-list"
                  ref={listRef}
                  role="listbox"
                  aria-label="US states"
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
                >
                  {filtered.length === 0 ? (
                    <li className="px-4 py-6 text-center text-xs font-semibold text-slate-500">
                      No states match
                    </li>
                  ) : (
                    filtered.map((state, index) => {
                      const active = selected?.code === state.code;
                      const focused = highlight === index;
                      return (
                        <li key={state.code} role="none">
                          <button
                            type="button"
                            role="option"
                            data-state-index={index}
                            aria-selected={active}
                            onMouseEnter={() => setHighlight(index)}
                            onClick={() => pick(state.code)}
                            className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm ${
                              focused ? "bg-emerald-500/15 text-white" : "text-slate-200"
                            }`}
                          >
                            <span className="min-w-0 truncate font-semibold">{state.name}</span>
                            <span className="flex flex-shrink-0 items-center gap-1.5">
                              <span className="text-[11px] font-extrabold tracking-wide text-slate-500">
                                {state.code}
                              </span>
                              {active ? <Check size={12} className="text-emerald-400" /> : null}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
export default function FinancialOnboardingModal({
  open,
  allowCancel = false,
  initialAnswers,
  onClose,
  onComplete,
}: FinancialOnboardingModalProps) {
  const [phase, setPhase] = useState<Phase>("wizard");
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState(() => emptyDraft(FORCE_ONBOARDING_ON_REFRESH ? null : initialAnswers));
  const [saved, setSaved] = useState<FinancialRoadmap | null>(null);
  const [devForceOpen, setDevForceOpen] = useState(forceOnboardingThisLoad);
  const visible = open || devForceOpen;
  const canDismiss = allowCancel || FORCE_ONBOARDING_ON_REFRESH;

  const handleClose = () => {
    forceOnboardingThisLoad = false;
    setDevForceOpen(false);
    onClose?.();
  };

  useEffect(() => {
    if (!visible) return;
    setPhase("wizard");
    setStep(1);
    setDraft(emptyDraft(FORCE_ONBOARDING_ON_REFRESH ? null : initialAnswers));
    setSaved(null);
    // Reset only when the modal opens so the reveal step is not kicked back to the wizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (phase !== "reveal" || !saved) return;
    playAchievementFanfare();
  }, [phase, saved]);

  const income = parseCurrency(draft.incomeDraft);
  const expenses = parseCurrency(draft.expenseDraft);
  const rawMargin = income - expenses;
  const filledBudget = draft.incomeDraft.trim() !== "" && draft.expenseDraft.trim() !== "";

  const canContinue =
    step === 1
      ? true
      : step === 2
        ? filledBudget
        : step === 3
          ? Boolean(draft.bottleneck)
          : Boolean(draft.knowledgeLevel);

  const preview = useMemo(() => {
    if (!draft.bottleneck || !filledBudget) return null;
    return buildFinancialRoadmap({
      stateCode: draft.stateCode,
      monthlyIncome: income,
      monthlyEssentialExpenses: expenses,
      bottleneck: draft.bottleneck,
      knowledgeLevel: draft.knowledgeLevel ?? "beginner",
    });
  }, [draft.bottleneck, draft.knowledgeLevel, draft.stateCode, expenses, filledBudget, income]);

  if (!visible) return null;

  const finishWizard = () => {
    if (!draft.bottleneck || !filledBudget || !draft.knowledgeLevel) return;
    const answers: FinancialProfileAnswers = {
      stateCode: draft.stateCode,
      monthlyIncome: income,
      monthlyEssentialExpenses: expenses,
      bottleneck: draft.bottleneck,
      knowledgeLevel: draft.knowledgeLevel,
    };
    const roadmap = saveFinancialProfile(answers, getStoredUser()?.id);
    setSaved(roadmap);
    setPhase("reveal");
    onComplete?.(roadmap);
  };

  const goBack = () => {
    if (phase === "reveal") return;
    if (step === 1) {
      if (canDismiss) handleClose();
      return;
    }
    setStep((step - 1) as Step);
  };

  const goNext = () => {
    if (!canContinue) return;
    if (step < 4) {
      setStep((step + 1) as Step);
      return;
    }
    finishWizard();
  };

  if (phase === "reveal" && saved) {
    return (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/88 p-4 backdrop-blur-sm"
        role="presentation"
      >
        <div className="roadmap-reveal-bits" aria-hidden>
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} className="roadmap-reveal-bits__dot" style={{ "--i": index } as React.CSSProperties} />
          ))}
        </div>
        <div
          className="matter-pop relative my-auto flex max-h-[min(92vh,760px)] w-full max-w-md flex-col overflow-y-auto rounded-3xl border px-5 py-6 shadow-[0_28px_80px_rgba(0,0,0,0.6)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="financial-roadmap-reveal-title"
          style={{
            borderColor: `${saved.accent}55`,
            background: `linear-gradient(180deg, ${saved.accentSoft}, #0A0A0A 42%)`,
          }}
        >
          <p className="text-center text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-400">
            Your plan is ready
          </p>
          <div
            className="roadmap-reveal-glow mx-auto mt-4 grid h-16 w-16 place-items-center rounded-2xl text-3xl"
            style={{ background: saved.accentSoft, boxShadow: `0 0 32px ${saved.accent}55` }}
          >
            {saved.emoji}
          </div>
          <h2
            id="financial-roadmap-reveal-title"
            className="mt-4 text-center text-2xl font-extrabold tracking-tight text-white"
          >
            {saved.title}
          </h2>
          <p className="mt-1 text-center text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: saved.accent }}>
            {saved.modeLabel}
          </p>
          <p className="mt-3 text-center text-sm leading-relaxed text-slate-200">{saved.summary}</p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Core strategy</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{saved.strategy}</p>
          </div>
          <ol className="mt-4 space-y-2">
            {saved.todos.slice(0, 3).map((todo, index) => (
              <li key={todo.id} className="flex items-start gap-2.5 text-sm text-slate-100">
                <span
                  className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[10px] font-extrabold text-black"
                  style={{ background: saved.accent }}
                >
                  {index + 1}
                </span>
                <span className="leading-snug">{todo.title}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={handleClose}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-[#042F2E] transition hover:bg-emerald-400"
          >
            <Sparkles size={16} />
            Enter Sprout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/80 p-4 sm:items-center"
      role="presentation"
      onClick={canDismiss ? handleClose : undefined}
    >
      <div
        className="matter-pop flex max-h-[min(92vh,760px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="financial-onboarding-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-5 pt-4">
          <button
            type="button"
            onClick={goBack}
            aria-label={step === 1 && canDismiss ? "Close" : "Go back"}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#1F1F1F] bg-[#121212] text-slate-200 disabled:opacity-0"
            disabled={step === 1 && !canDismiss}
          >
            <ChevronLeft size={18} />
          </button>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-400">
            Money Profile
          </p>
          {canDismiss ? (
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-xl border border-[#1F1F1F] bg-[#121212] text-slate-200"
            >
              <X size={16} />
            </button>
          ) : (
            <span className="w-9 text-right text-xs font-bold text-slate-500">{step}/4</span>
          )}
        </header>

        <div className="mt-3 px-5">
          <div className="h-1 overflow-hidden rounded-full bg-[#121212]">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        <div key={step} className="matter-pop flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <>
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <MapPin size={20} />
              </div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-300">
                Step 1 · Location
              </p>
              <h2 id="financial-onboarding-title" className="mt-1 text-xl font-extrabold tracking-tight text-white">
                Where do you live?
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                Optional. Your state helps tailor later tax and account guidance.
              </p>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  US State
                </span>
                <StateSelector
                  value={draft.stateCode}
                  onChange={(stateCode) => setDraft((prev) => ({ ...prev, stateCode }))}
                />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <Wallet size={20} />
              </div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-300">
                Step 2 · Budget
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-white">
                Exact monthly numbers
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                Enter take-home pay and essential bills. We calculate leftover margin for you.
              </p>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  Monthly After-Tax Income ($)
                </span>
                <div className="flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-black/40 px-3 focus-within:border-emerald-500/50">
                  <span className="text-sm font-extrabold text-emerald-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.incomeDraft}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, incomeDraft: formatCurrencyInput(event.target.value) }))
                    }
                    placeholder="0"
                    aria-label="Monthly after-tax income"
                    className="w-full bg-transparent py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600"
                  />
                </div>
              </label>

              <label className="mt-3 block">
                <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  Monthly Essential Expenses ($)
                </span>
                <p className="mb-1.5 text-[11px] font-semibold text-slate-500">Housing, food, utilities</p>
                <div className="flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-black/40 px-3 focus-within:border-emerald-500/50">
                  <span className="text-sm font-extrabold text-rose-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.expenseDraft}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, expenseDraft: formatCurrencyInput(event.target.value) }))
                    }
                    placeholder="0"
                    aria-label="Monthly essential expenses"
                    className="w-full bg-transparent py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600"
                  />
                </div>
              </label>

              <div
                className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${
                  filledBudget && rawMargin < 0
                    ? "border-rose-500/35 bg-rose-500/10"
                    : "border-emerald-500/25 bg-emerald-500/10"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PiggyBank size={16} className={filledBudget && rawMargin < 0 ? "text-rose-300" : "text-emerald-300"} />
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                      Discretionary Savings Margin
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500">Income − expenses</p>
                  </div>
                </div>
                <p
                  className={`flex-shrink-0 text-lg font-extrabold ${
                    !filledBudget ? "text-slate-500" : rawMargin < 0 ? "text-rose-300" : "text-emerald-300"
                  }`}
                >
                  {filledBudget ? usd(rawMargin) : "—"}
                </p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <Shield size={20} />
              </div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-300">
                Step 3 · Goal
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-white">
                Primary financial goal
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                What should your plan focus on first? This pins the opening to-do steps.
              </p>
              <div className="mt-4 space-y-2">
                {GOAL_OPTIONS.map((option) => {
                  const selected = draft.bottleneck === option.id;
                  const Icon =
                    option.id === "high-interest-debt"
                      ? CreditCard
                      : option.id === "emergency-safety-net"
                        ? Shield
                        : option.id === "tax-strategy"
                          ? Landmark
                          : TrendingUp;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, bottleneck: option.id as Bottleneck }))}
                      aria-pressed={selected}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-[#1F1F1F] bg-black/20 hover:border-emerald-500/30"
                      }`}
                    >
                      <span
                        className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${
                          selected ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-slate-400"
                        }`}
                      >
                        <Icon size={16} />
                      </span>
                      <span>
                        <span className="block text-sm font-extrabold text-white">{option.label}</span>
                        <span className="block text-[11px] text-slate-400">{option.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {preview && (
                <div
                  className="mt-4 rounded-xl border px-3 py-3"
                  style={{ borderColor: `${preview.accent}55`, background: preview.accentSoft }}
                >
                  <p className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: preview.accent }}>
                    {preview.emoji} {preview.modeLabel}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-200">{preview.summary}</p>
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-2xl">
                🎓
              </div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-300">
                Step 4 · Knowledge
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-white">
                Knowledge level
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                This unlocks your curriculum. Beginners move phase by phase. Intermediate and Advanced learners can browse all five.
              </p>
              <div className="mt-4 space-y-2">
                {KNOWLEDGE_OPTIONS.map((option) => {
                  const selected = draft.knowledgeLevel === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, knowledgeLevel: option.id as KnowledgeLevel }))
                      }
                      aria-pressed={selected}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-[#1F1F1F] bg-black/20 hover:border-emerald-500/30"
                      }`}
                    >
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white/5 text-lg">
                        {option.emoji}
                      </span>
                      <span>
                        <span className="block text-sm font-extrabold text-white">{option.label}</span>
                        <span className="block text-[11px] text-slate-400">{option.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-[#1F1F1F] px-5 py-4">
          {step === 1 && (
            <button
              type="button"
              onClick={() => {
                setDraft((prev) => ({ ...prev, stateCode: null }));
                setStep(2);
              }}
              className="mb-2 w-full text-center text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
            >
              Skip — location is optional
            </button>
          )}
          <button
            type="button"
            disabled={!canContinue}
            onClick={goNext}
            className="flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-500"
          >
            {step === 4 ? "See my financial roadmap" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
