import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  ChevronRight,
  CircleDollarSign,
  HelpCircle,
  PartyPopper,
  PiggyBank,
  Plus,
  Snowflake,
  Sparkles,
  Trash2,
  TrendingDown,
  Wallet,
  X,
} from "lucide-react";
import { categoryIcon } from "../lib/categoryIcons";
import { formatCurrencyInput, parseCurrency } from "../lib/money";

export type Debt = {
  id: string;
  title: string;
  originalBalance: number;
  balance: number;
  minPayment: number;
  apr: number;
};

type SimResult = {
  order: string[];
  payoffMonth: Record<string, number>;
  monthsToDebtFree: number;
  totalInterestPaid: number;
};

type DebtStatus = "unanswered" | "no-debt" | "has-debt";

const MAX_MONTHS = 600;
/** Assumed rate used only when a debt is added without a specific interest rate. */
const DEFAULT_APR = 0;

/** Closed-form payoff for a single debt paid in isolation with only its minimum payment. */
function amortizeIndependently(balance: number, apr: number, minPayment: number) {
  const rate = apr / 100 / 12;
  if (balance <= 0) {
    return { months: 0, interest: 0 };
  }
  if (minPayment <= balance * rate) {
    // Minimum payment never outpaces interest — treat as effectively never paid off.
    return { months: MAX_MONTHS, interest: balance * rate * MAX_MONTHS };
  }
  const months = Math.ceil(
    Math.log(minPayment / (minPayment - rate * balance)) / Math.log(1 + rate)
  );
  const interest = Math.max(0, minPayment * months - balance);
  return { months, interest };
}

/**
 * Month-by-month debt snowball simulation: pay minimums on every active debt,
 * then cascade the extra payment (plus any freed-up minimums from already-paid
 * debts) onto the smallest remaining balance first.
 */
function simulateSnowball(debts: Debt[], extraPayment: number): SimResult {
  if (debts.length === 0) {
    return { order: [], payoffMonth: {}, monthsToDebtFree: 0, totalInterestPaid: 0 };
  }

  const order = [...debts]
    .sort((a, b) => a.balance - b.balance || a.apr - b.apr)
    .map((d) => d.id);

  const balances: Record<string, number> = {};
  const minPayments: Record<string, number> = {};
  const rates: Record<string, number> = {};
  debts.forEach((d) => {
    balances[d.id] = d.balance;
    minPayments[d.id] = d.minPayment;
    rates[d.id] = d.apr / 100 / 12;
  });

  const payoffMonth: Record<string, number> = {};
  let totalInterestPaid = 0;
  let months = 0;

  const isDone = () => order.every((id) => balances[id] <= 0.01);

  while (!isDone() && months < MAX_MONTHS) {
    months += 1;

    // Accrue a month of interest on every active balance.
    order.forEach((id) => {
      if (balances[id] > 0) {
        const interest = balances[id] * rates[id];
        totalInterestPaid += interest;
        balances[id] += interest;
      }
    });

    // Extra pool = user's extra payment + minimums freed by already-paid debts.
    let pool = extraPayment;
    order.forEach((id) => {
      if (balances[id] <= 0) {
        pool += minPayments[id];
      }
    });

    // Everyone still active pays at least their minimum.
    order.forEach((id) => {
      if (balances[id] > 0) {
        const pay = Math.min(minPayments[id], balances[id]);
        balances[id] -= pay;
      }
    });

    // Cascade the pool down the payoff order (smallest balance first).
    let remainingPool = pool;
    order.forEach((id) => {
      if (balances[id] > 0 && remainingPool > 0) {
        const pay = Math.min(remainingPool, balances[id]);
        balances[id] -= pay;
        remainingPool -= pay;
      }
    });

    // Record the month any debt crosses the finish line.
    order.forEach((id) => {
      if (balances[id] <= 0.01 && payoffMonth[id] === undefined) {
        payoffMonth[id] = months;
      }
    });
  }

  return { order, payoffMonth, monthsToDebtFree: months, totalInterestPaid };
}

function formatMoney(amount: number) {
  return Math.round(Math.max(0, amount)).toLocaleString("en-US");
}

function formatYearsMonths(totalMonths: number) {
  if (totalMonths <= 0) return "0 mo";
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} mo`;
  if (months === 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
}

let debtIdSeed = 0;
function nextId() {
  debtIdSeed += 1;
  return `debt-${Date.now()}-${debtIdSeed}`;
}

type FormState = {
  title: string;
  balance: string;
  minPayment: string;
  apr: string;
};

const EMPTY_FORM: FormState = { title: "", balance: "", minPayment: "", apr: "" };

type DebtSnowballManagerProps = {
  /** Called when the user wants to jump over to the Lessons tab (investing tips / course). */
  onOpenLessons?: () => void;
  /** Mirrors the live debt list up to the parent (e.g. so Sprout AI can reference it). */
  onDebtsChange?: (debts: Debt[]) => void;
};

export default function DebtSnowballManager({ onOpenLessons, onDebtsChange }: DebtSnowballManagerProps) {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtStatus, setDebtStatus] = useState<DebtStatus>("unanswered");

  useEffect(() => {
    onDebtsChange?.(debts);
  }, [debts, onDebtsChange]);
  const [extraPayment, setExtraPayment] = useState(50);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [courseStarted, setCourseStarted] = useState(false);

  const totalBalance = useMemo(() => debts.reduce((sum, d) => sum + d.balance, 0), [debts]);

  const snowball = useMemo(() => simulateSnowball(debts, extraPayment), [debts, extraPayment]);

  const baseline = useMemo(() => {
    let months = 0;
    let interest = 0;
    debts.forEach((d) => {
      const result = amortizeIndependently(d.balance, d.apr, d.minPayment);
      months = Math.max(months, result.months);
      interest += result.interest;
    });
    return { months, interest };
  }, [debts]);

  const interestSaved = Math.max(0, Math.round(baseline.interest - snowball.totalInterestPaid));
  const monthsSaved = Math.max(0, baseline.months - snowball.monthsToDebtFree);

  const orderedDebts = useMemo(
    () => snowball.order.map((id) => debts.find((d) => d.id === id)).filter((d): d is Debt => Boolean(d)),
    [snowball.order, debts]
  );

  const activeTargetId = orderedDebts.find((d) => d.balance > 0)?.id ?? null;
  const hasDebts = debts.length > 0;
  const showOnboarding = !hasDebts && debtStatus === "unanswered";
  const showCongrats = !hasDebts && debtStatus === "no-debt";
  const showHeaderActions = debtStatus !== "unanswered";

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormError("");
  };

  const openForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    resetForm();
  };

  const answerHasDebt = (hasAnyDebt: boolean) => {
    if (hasAnyDebt) {
      setDebtStatus("has-debt");
      openForm();
    } else {
      setDebtStatus("no-debt");
    }
  };

  const addDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const title = form.title.trim() || "Untitled Debt";
    const balance = parseCurrency(form.balance);
    const minPayment = parseCurrency(form.minPayment);
    const apr = form.apr.trim() === "" ? DEFAULT_APR : Number(form.apr);

    if (!Number.isFinite(balance) || balance <= 0) {
      setFormError("Enter a total balance greater than $0.");
      return;
    }
    if (!Number.isFinite(minPayment) || minPayment <= 0) {
      setFormError("Enter a minimum monthly payment greater than $0.");
      return;
    }
    if (!Number.isFinite(apr) || apr < 0) {
      setFormError("Enter a valid interest rate, or leave it blank.");
      return;
    }

    const newDebt: Debt = {
      id: nextId(),
      title,
      originalBalance: balance,
      balance,
      minPayment,
      apr,
    };

    setDebts((prev) => [...prev, newDebt]);
    setDebtStatus("has-debt");
    closeForm();
  };

  const deleteDebt = (id: string) => {
    setDebts((prev) => prev.filter((d) => d.id !== id));
  };

  const logPayment = (id: string) => {
    setDebts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const boost = id === activeTargetId ? extraPayment : 0;
        const nextBalance = Math.max(0, d.balance - d.minPayment - boost);
        return { ...d, balance: nextBalance };
      })
    );
  };

  const startCourse = () => {
    setCourseStarted(true);
    window.setTimeout(() => {
      setInfoOpen(false);
      setCourseStarted(false);
      onOpenLessons?.();
    }, 1100);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0A0A0A] p-4 sm:p-5 space-y-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Snowflake size={22} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Debt</p>
            <h3 className="text-lg font-extrabold tracking-tight text-white">Your Payoff Plan</h3>
          </div>
        </div>
        {showHeaderActions && (
          <button
            type="button"
            onClick={openForm}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-95"
          >
            <Plus size={16} />
            Add Debt
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 transition hover:text-emerald-300"
      >
        <HelpCircle size={14} />
        What is the Snowball Method?
      </button>

      {showOnboarding && (
        <div className="matter-pop rounded-xl border border-white/10 bg-[#121212] p-5 text-center">
          <p className="text-base font-extrabold text-white">Do you currently have any debt?</p>
          <p className="mt-1 text-xs text-slate-400">We'll set up your plan based on your answer.</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => answerHasDebt(true)}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-95"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => answerHasDebt(false)}
              className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-white/30 active:scale-95"
            >
              No
            </button>
          </div>
        </div>
      )}

      {showCongrats && (
        <div className="matter-pop rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-5 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
            <PartyPopper size={24} />
          </div>
          <p className="mt-3 text-base font-extrabold text-white">Nice — you're debt-free!</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">
            That's a huge advantage. Put that monthly cash toward building savings and investing
            instead — future you will be thrilled.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => onOpenLessons?.()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-95"
            >
              <Sparkles size={15} />
              Explore Investing Lessons
            </button>
            <button
              type="button"
              onClick={() => {
                setDebtStatus("has-debt");
                openForm();
              }}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:border-white/30"
            >
              Actually, I do have debt
            </button>
          </div>
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={addDebt}
          className="matter-pop space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-emerald-300">Add a Debt</p>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Cancel add debt"
              className="text-slate-400 transition hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-slate-400">
              Title
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Visa Credit Card"
                className="rounded-lg border border-white/10 bg-[#121212] px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-400">
              Balance
              <input
                inputMode="decimal"
                value={form.balance}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    balance: formatCurrencyInput(e.target.value, { symbol: true }),
                  }))
                }
                placeholder="$1,200"
                className="rounded-lg border border-white/10 bg-[#121212] px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-400">
              Min. Payment /mo
              <input
                inputMode="decimal"
                value={form.minPayment}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    minPayment: formatCurrencyInput(e.target.value, { symbol: true }),
                  }))
                }
                placeholder="$45"
                className="rounded-lg border border-white/10 bg-[#121212] px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </label>

            <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-slate-400">
              Interest Rate — optional (APR %)
              <input
                inputMode="decimal"
                value={form.apr}
                onChange={(e) => setForm((f) => ({ ...f, apr: e.target.value.replace(/[^0-9.]/g, "") }))}
                placeholder="22.99"
                className="rounded-lg border border-white/10 bg-[#121212] px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </label>
          </div>

          {formError && <p className="text-xs font-semibold text-rose-400">{formError}</p>}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
          >
            <Check size={16} />
            Save Debt
          </button>
        </form>
      )}

      {!hasDebts && !showOnboarding && !showCongrats && (
        <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
          No debts yet. Add your first one above to build your plan.
        </div>
      )}

      {hasDebts && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat icon={<Wallet size={16} />} label="Total Debt" value={`$${formatMoney(totalBalance)}`} />
            <SummaryStat
              icon={<Calendar size={16} />}
              label="Debt-Free In"
              value={formatYearsMonths(snowball.monthsToDebtFree)}
            />
            <SummaryStat
              icon={<TrendingDown size={16} />}
              label="Interest Saved"
              value={`$${formatMoney(interestSaved)}`}
              accent
            />
            <SummaryStat icon={<PiggyBank size={16} />} label="Months Saved" value={`${monthsSaved} mo`} accent />
          </div>

          <div className="rounded-xl border border-white/10 bg-[#121212] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400">Pay extra each month</p>
              <span className="text-lg font-extrabold text-emerald-400">${extraPayment}</span>
            </div>
            <input
              type="range"
              min={0}
              max={500}
              step={5}
              value={extraPayment}
              onChange={(e) => setExtraPayment(Number(e.target.value))}
              aria-label="Extra monthly payment"
              className="matter-slider mt-3 w-full"
            />
            <p className="mt-2 text-[11px] text-slate-500">
              Goes toward your smallest balance first, then rolls onto the next one.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Payoff Order</p>
            <div className="space-y-2">
              {orderedDebts.map((debt, index) => {
                const isPaid = debt.balance <= 0;
                const month = snowball.payoffMonth[debt.id];
                const timelinePct = snowball.monthsToDebtFree
                  ? Math.min(
                      100,
                      Math.round(((month ?? snowball.monthsToDebtFree) / snowball.monthsToDebtFree) * 100)
                    )
                  : 0;
                return (
                  <div
                    key={debt.id}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#121212] px-3 py-2.5"
                  >
                    <span
                      className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                        isPaid ? "bg-emerald-500 text-[#042F2E]" : "bg-white/10 text-slate-300"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{debt.title}</p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isPaid ? "bg-emerald-500" : "bg-emerald-500/50"
                          }`}
                          style={{ width: `${timelinePct}%` }}
                        />
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-[11px] font-bold text-slate-400">
                      {isPaid ? "Paid off" : `mo ${month ?? "—"}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Your Debts</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {orderedDebts.map((debt, index) => {
                const percentPaid = debt.originalBalance
                  ? Math.min(100, Math.round(((debt.originalBalance - debt.balance) / debt.originalBalance) * 100))
                  : 0;
                const isPaid = debt.balance <= 0;
                const isTarget = debt.id === activeTargetId;

                return (
                  <article
                    key={debt.id}
                    className={`relative rounded-xl border p-4 transition ${
                      isTarget ? "border-emerald-500/50 bg-emerald-500/[0.08]" : "border-white/10 bg-[#121212]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/5 text-slate-300">
                            {categoryIcon(debt.title)}
                          </span>
                        <div>
                          <p className="text-sm font-bold text-white">{debt.title}</p>
                          <p className="text-[11px] text-slate-500">
                            #{index + 1} in payoff order{debt.apr > 0 ? ` · ${debt.apr}% APR` : ""}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteDebt(debt.id)}
                        aria-label={`Delete ${debt.title}`}
                        className="text-slate-500 transition hover:text-rose-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-3 flex items-end justify-between">
                      <p className="text-xl font-extrabold text-white">${formatMoney(debt.balance)}</p>
                      <p className="text-[11px] font-semibold text-slate-500">
                        of ${formatMoney(debt.originalBalance)}
                      </p>
                    </div>

                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isPaid ? "bg-emerald-500" : "bg-emerald-500/70"
                        }`}
                        style={{ width: `${percentPaid}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-400">
                      {isPaid ? "🎉 Paid off!" : `${percentPaid}% paid off`}
                    </p>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Min ${formatMoney(debt.minPayment)}/mo</span>
                      {isTarget && !isPaid && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">
                          Paying now
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => logPayment(debt.id)}
                      disabled={isPaid}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-default disabled:opacity-40"
                    >
                      <CircleDollarSign size={14} />
                      {isTarget && !isPaid
                        ? `Log Payment (+$${formatMoney(debt.minPayment + extraPayment)})`
                        : `Log Payment (+$${formatMoney(debt.minPayment)})`}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-200">
            <ChevronRight size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Pay minimums on everything, then send every extra dollar to{" "}
              <span className="font-bold text-emerald-100">
                {orderedDebts.find((d) => d.balance > 0)?.title ?? "nothing — you're debt-free!"}
              </span>
              .
            </span>
          </div>
        </>
      )}

      {infoOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/75 p-4 sm:items-center"
          onClick={() => !courseStarted && setInfoOpen(false)}
          role="presentation"
        >
          <div
            className="matter-pop w-full max-w-sm rounded-2xl border border-white/10 bg-[#121212] p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="snowball-info-title"
          >
            {!courseStarted ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                      <Snowflake size={18} />
                    </span>
                    <h3 id="snowball-info-title" className="text-base font-extrabold text-white">
                      What is the Snowball Method?
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInfoOpen(false)}
                    aria-label="Close"
                    className="text-slate-400 transition hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  List your debts smallest to largest. Pay the minimum on everything, then throw every
                  spare dollar at the smallest balance until it's gone. Once it's paid off, roll that
                  payment onto the next-smallest debt — like a snowball picking up speed as it rolls
                  downhill.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  It's not always the fastest math on interest, but knocking out a whole debt early
                  gives you a quick psychological win that keeps you motivated to finish the rest.
                </p>

                <button
                  type="button"
                  onClick={startCourse}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                >
                  <Sparkles size={15} />
                  Start Snowball Method Course
                </button>
              </>
            ) : (
              <div className="py-3 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
                  <PartyPopper size={24} />
                </div>
                <p className="mt-3 text-sm font-bold text-white">You're in! 🎓</p>
                <p className="mt-1 text-xs text-slate-400">Taking you to the course now…</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121212] p-3">
      <div className={`mb-1.5 flex items-center gap-1.5 ${accent ? "text-emerald-400" : "text-slate-400"}`}>
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-base font-extrabold ${accent ? "text-emerald-300" : "text-white"}`}>{value}</p>
    </div>
  );
}
