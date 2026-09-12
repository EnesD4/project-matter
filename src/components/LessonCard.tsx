import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import type { LessonQuizDef, LessonWidget, StoryCard } from "../lib/lessons";

const SWIPE_THRESHOLD = 56;
const DEBT_MAX_MONTHS = 360;

type MiniDebt = { id: string; balance: number; apr: number; min: number };

const SAMPLE_DEBTS: MiniDebt[] = [
  { id: "card", balance: 3000, apr: 22, min: 75 },
  { id: "loan", balance: 9000, apr: 6, min: 150 },
];

function formatUsd(value: number, digits = 0): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function monthlyCompound(contribution: number, annualRate: number, years: number): number {
  const months = Math.max(0, years) * 12;
  const monthlyRate = annualRate / 12;
  if (months === 0 || contribution <= 0) return 0;
  if (monthlyRate === 0) return contribution * months;
  return contribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
}

function futureValue(principal: number, annualRate: number, years: number): number {
  return principal * Math.pow(1 + annualRate, years);
}

function simulatePayoff(debts: MiniDebt[], extra: number, mode: "snowball" | "avalanche") {
  const order = [...debts]
    .sort((a, b) =>
      mode === "snowball"
        ? a.balance - b.balance || b.apr - a.apr
        : b.apr - a.apr || a.balance - b.balance
    )
    .map((debt) => debt.id);
  const balances: Record<string, number> = {};
  const mins: Record<string, number> = {};
  const rates: Record<string, number> = {};
  debts.forEach((debt) => {
    balances[debt.id] = debt.balance;
    mins[debt.id] = debt.min;
    rates[debt.id] = debt.apr / 100 / 12;
  });

  let interest = 0;
  let months = 0;
  const done = () => order.every((id) => balances[id] <= 0.01);

  while (!done() && months < DEBT_MAX_MONTHS) {
    months += 1;
    order.forEach((id) => {
      if (balances[id] > 0) {
        const accrued = balances[id] * rates[id];
        interest += accrued;
        balances[id] += accrued;
      }
    });

    let pool = extra;
    order.forEach((id) => {
      if (balances[id] <= 0) pool += mins[id];
    });

    order.forEach((id) => {
      if (balances[id] <= 0) return;
      const paid = Math.min(balances[id], mins[id]);
      balances[id] -= paid;
    });

    for (const id of order) {
      if (pool <= 0) break;
      if (balances[id] <= 0) continue;
      const paid = Math.min(balances[id], pool);
      balances[id] -= paid;
      pool -= paid;
    }
  }

  return { months, interest };
}

function RichCopy({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className={className}>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-extrabold text-white">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </p>
  );
}

function WidgetShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-[#1F1F1F] bg-black/30 p-3" onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function SliderField({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  ariaLabel,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className={label ? "mt-3 first:mt-0" : ""}>
      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
        <span>{label}</span>
        <span className="text-emerald-300">{valueLabel}</span>
      </div>
      <input
        type="range"
        className="matter-slider mt-2 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function DebtPayoffWidget() {
  const [extra, setExtra] = useState(150);
  const snowball = useMemo(() => simulatePayoff(SAMPLE_DEBTS, extra, "snowball"), [extra]);
  const avalanche = useMemo(() => simulatePayoff(SAMPLE_DEBTS, extra, "avalanche"), [extra]);
  const avalancheWins = avalanche.interest <= snowball.interest;

  return (
    <WidgetShell>
      <SliderField
        label="Extra monthly payment"
        valueLabel={formatUsd(extra)}
        min={50}
        max={400}
        step={25}
        value={extra}
        onChange={setExtra}
        ariaLabel="Extra monthly payment"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-sky-300">Snowball</p>
          <p className="text-sm font-extrabold text-white">{snowball.months} mo</p>
          <p className="text-[10px] font-semibold text-slate-400">{formatUsd(snowball.interest)} interest</p>
        </div>
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-amber-300">Avalanche</p>
          <p className="text-sm font-extrabold text-white">{avalanche.months} mo</p>
          <p className="text-[10px] font-semibold text-slate-400">{formatUsd(avalanche.interest)} interest</p>
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {avalancheWins ? "Avalanche keeps more cash" : "Snowball is close — finish either"}
      </p>
    </WidgetShell>
  );
}

function BudgetWidget({ widget }: { widget: Extract<LessonWidget, { type: "budget-503020" }> }) {
  const [income, setIncome] = useState(4000);
  const needs = income * 0.5;
  const wants = income * 0.3;
  const save = income * 0.2;
  return (
    <WidgetShell>
      <SliderField
        label="Take-home pay"
        valueLabel={formatUsd(income)}
        min={widget.minIncome}
        max={widget.maxIncome}
        step={100}
        value={income}
        onChange={setIncome}
        ariaLabel="Monthly take-home pay"
      />
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <div className="rounded-lg border border-slate-500/30 bg-slate-500/10 px-1.5 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-300">50% needs</p>
          <p className="text-xs font-extrabold text-white">{formatUsd(needs)}</p>
        </div>
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-1.5 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-amber-300">30% wants</p>
          <p className="text-xs font-extrabold text-white">{formatUsd(wants)}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">20% save</p>
          <p className="text-xs font-extrabold text-white">{formatUsd(save)}</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function HysaWidget({ widget }: { widget: Extract<LessonWidget, { type: "hysa" }> }) {
  const [amount, setAmount] = useState(6000);
  const [years, setYears] = useState(3);
  const hysa = amount * (Math.pow(1 + widget.apy, years) - 1);
  const checking = amount * (Math.pow(1.0001, years) - 1);
  return (
    <WidgetShell>
      <SliderField
        label="Emergency cash"
        valueLabel={formatUsd(amount)}
        min={1000}
        max={24000}
        step={500}
        value={amount}
        onChange={setAmount}
        ariaLabel="Emergency fund amount"
      />
      <SliderField
        label="Years parked"
        valueLabel={`${years} yr`}
        min={1}
        max={6}
        step={1}
        value={years}
        onChange={setYears}
        ariaLabel="Years in savings"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">
            HYSA {(widget.apy * 100).toFixed(1)}%
          </p>
          <p className="text-sm font-extrabold text-white">+{formatUsd(hysa)}</p>
        </div>
        <div className="rounded-lg border border-slate-500/25 bg-slate-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Checking ~0.01%</p>
          <p className="text-sm font-extrabold text-white">+{formatUsd(checking)}</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function Match401kWidget({ widget }: { widget: Extract<LessonWidget, { type: "match-401k" }> }) {
  const [pct, setPct] = useState(6);
  const contribution = widget.salary * (pct / 100);
  const maxMatch = widget.salary * widget.matchCap * widget.matchRate;
  const captured = widget.salary * Math.min(pct / 100, widget.matchCap) * widget.matchRate;
  const left = Math.max(0, maxMatch - captured);
  return (
    <WidgetShell>
      <p className="text-[10px] font-semibold text-slate-500">
        Salary {formatUsd(widget.salary)} · {(widget.matchRate * 100).toFixed(0)}% match up to{" "}
        {(widget.matchCap * 100).toFixed(0)}%
      </p>
      <SliderField
        label="Your contribution"
        valueLabel={`${pct}% · ${formatUsd(contribution)}`}
        min={0}
        max={15}
        step={1}
        value={pct}
        onChange={setPct}
        ariaLabel="401k contribution percent"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">Match captured</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(captured)}</p>
        </div>
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-amber-300">Left on table</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(left)}</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function RothTradWidget({ widget }: { widget: Extract<LessonWidget, { type: "roth-trad" }> }) {
  const brackets = [12, 22, 24, 32];
  const [bracket, setBracket] = useState(22);
  const taxNow = widget.contribution * (bracket / 100);
  const grown = futureValue(widget.contribution, widget.returnRate, widget.years);
  const tradAfterTax = grown * (1 - bracket / 100);
  return (
    <WidgetShell>
      <SliderField
        label="Today's federal bracket"
        valueLabel={`${bracket}%`}
        min={0}
        max={brackets.length - 1}
        step={1}
        value={brackets.indexOf(bracket)}
        onChange={(index) => setBracket(brackets[index] ?? 22)}
        ariaLabel="Federal tax bracket"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-amber-300">Traditional</p>
          <p className="text-[10px] font-semibold text-slate-400">Saves {formatUsd(taxNow)} tax now</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(tradAfterTax)}</p>
          <p className="text-[9px] text-slate-500">after same-rate tax later</p>
        </div>
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">Roth</p>
          <p className="text-[10px] font-semibold text-slate-400">$0 tax later</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(grown)}</p>
          <p className="text-[9px] text-slate-500">{widget.years} yrs @ {(widget.returnRate * 100).toFixed(0)}%</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function HsaWidget({ widget }: { widget: Extract<LessonWidget, { type: "hsa" }> }) {
  const [amount, setAmount] = useState(2000);
  const saved = amount * widget.taxRate;
  return (
    <WidgetShell>
      <SliderField
        label="HSA contribution"
        valueLabel={formatUsd(amount)}
        min={500}
        max={4300}
        step={100}
        value={amount}
        onChange={setAmount}
        ariaLabel="HSA contribution"
      />
      <p className="mt-3 text-center text-lg font-extrabold text-emerald-300">{formatUsd(saved)} tax cut this year</p>
      <p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        at {(widget.taxRate * 100).toFixed(0)}% federal · growth still tax-free
      </p>
    </WidgetShell>
  );
}

function ExpenseRatioWidget({ widget }: { widget: Extract<LessonWidget, { type: "expense-ratio" }> }) {
  const [feeBps, setFeeBps] = useState(75);
  const fee = feeBps / 10000;
  const cheap = 0.0003;
  const withFee = futureValue(widget.principal, widget.returnRate - fee, widget.years);
  const withCheap = futureValue(widget.principal, widget.returnRate - cheap, widget.years);
  const drag = Math.max(0, withCheap - withFee);
  return (
    <WidgetShell>
      <SliderField
        label="Expense ratio"
        valueLabel={`${(fee * 100).toFixed(2)}% / yr`}
        min={3}
        max={150}
        step={1}
        value={feeBps}
        onChange={setFeeBps}
        ariaLabel="Expense ratio in basis points"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">0.03% index</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(withCheap)}</p>
        </div>
        <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-rose-300">Your fee</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(withFee)}</p>
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {formatUsd(drag)} lost to fees over {widget.years} years
      </p>
    </WidgetShell>
  );
}

function TbillWidget({ widget }: { widget: Extract<LessonWidget, { type: "tbill" }> }) {
  const [yieldPct, setYieldPct] = useState(42);
  const yld = yieldPct / 10;
  const price = widget.face / (1 + yld / 100);
  const earned = widget.face - price;
  return (
    <WidgetShell>
      <SliderField
        label="1-year T-bill yield"
        valueLabel={`${yld.toFixed(1)}%`}
        min={20}
        max={60}
        step={1}
        value={yieldPct}
        onChange={setYieldPct}
        ariaLabel="T-bill yield"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-500/25 bg-slate-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-300">You pay today</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(price)}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">Interest to par</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(earned)}</p>
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Matures at {formatUsd(widget.face)}
      </p>
    </WidgetShell>
  );
}

function BalanceSheetWidget() {
  const [assets, setAssets] = useState(100);
  const [liabilities, setLiabilities] = useState(40);
  const debt = Math.min(liabilities, assets);
  const equity = assets - debt;
  return (
    <WidgetShell>
      <SliderField
        label="Assets"
        valueLabel={`${assets}m`}
        min={40}
        max={250}
        step={5}
        value={assets}
        onChange={(next) => {
          setAssets(next);
          setLiabilities((prev) => Math.min(prev, next));
        }}
        ariaLabel="Company assets"
      />
      <SliderField
        label="Liabilities"
        valueLabel={`${debt}m`}
        min={0}
        max={assets}
        step={5}
        value={debt}
        onChange={setLiabilities}
        ariaLabel="Company liabilities"
      />
      <p className="mt-3 text-center text-sm font-extrabold text-white">
        {assets}m = {debt}m + <span className="text-emerald-300">{equity}m equity</span>
      </p>
      <p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Assets = Liabilities + Equity
      </p>
    </WidgetShell>
  );
}

function PeRatioWidget() {
  const [price, setPrice] = useState(100);
  const [eps, setEps] = useState(5);
  const pe = eps > 0 ? price / eps : 0;
  const band = pe < 15 ? "Looks cheap vs ~20×" : pe <= 25 ? "Common fair-value zone" : "Paying up for growth";
  const color = pe < 15 ? "text-emerald-300" : pe <= 25 ? "text-amber-300" : "text-rose-300";
  return (
    <WidgetShell>
      <SliderField
        label="Share price"
        valueLabel={formatUsd(price)}
        min={20}
        max={400}
        step={5}
        value={price}
        onChange={setPrice}
        ariaLabel="Share price"
      />
      <SliderField
        label="EPS"
        valueLabel={formatUsd(eps, 2)}
        min={1}
        max={20}
        step={0.25}
        value={eps}
        onChange={setEps}
        ariaLabel="Earnings per share"
      />
      <p className={`mt-3 text-center text-2xl font-extrabold ${color}`}>{pe.toFixed(1)}× P/E</p>
      <p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">{band}</p>
    </WidgetShell>
  );
}

function FcfDivWidget() {
  const [fcf, setFcf] = useState(20);
  const [divs, setDivs] = useState(12);
  const payout = fcf > 0 ? (divs / fcf) * 100 : 0;
  const covered = divs <= fcf;
  return (
    <WidgetShell>
      <SliderField
        label="Free cash flow"
        valueLabel={`$${fcf}B`}
        min={4}
        max={40}
        step={1}
        value={fcf}
        onChange={setFcf}
        ariaLabel="Free cash flow"
      />
      <SliderField
        label="Dividends paid"
        valueLabel={`$${divs}B`}
        min={1}
        max={40}
        step={1}
        value={divs}
        onChange={setDivs}
        ariaLabel="Dividends paid"
      />
      <p className={`mt-3 text-center text-lg font-extrabold ${covered ? "text-emerald-300" : "text-rose-300"}`}>
        {payout.toFixed(0)}% payout
      </p>
      <p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {covered ? "Dividends covered by FCF" : "Stretching — cash didn't fully cover it"}
      </p>
    </WidgetShell>
  );
}

function DcaWidget({ widget }: { widget: Extract<LessonWidget, { type: "dca" }> }) {
  const [monthly, setMonthly] = useState(200);
  const grown = monthlyCompound(monthly, widget.returnRate, widget.years);
  const invested = monthly * widget.years * 12;
  return (
    <WidgetShell>
      <SliderField
        label="Monthly auto-invest"
        valueLabel={formatUsd(monthly)}
        min={50}
        max={1000}
        step={25}
        value={monthly}
        onChange={setMonthly}
        ariaLabel="Monthly DCA amount"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-500/25 bg-slate-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-300">You put in</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(invested)}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">
            After {widget.years} yrs
          </p>
          <p className="text-sm font-extrabold text-white">{formatUsd(grown)}</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function AllocationWidget() {
  const [age, setAge] = useState(30);
  const stocks = Math.max(20, Math.min(90, 110 - age));
  const ballast = 100 - stocks;
  const stage = age < 40 ? "Growth years" : age < 55 ? "Blend the mix" : "Protect the pile";
  return (
    <WidgetShell>
      <SliderField
        label="Your age"
        valueLabel={`${age}`}
        min={22}
        max={70}
        step={1}
        value={age}
        onChange={setAge}
        ariaLabel="Age for allocation"
      />
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/50">
        <div className="h-full bg-emerald-500" style={{ width: `${stocks}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <p className="text-center text-xs font-extrabold text-emerald-300">{stocks}% stocks</p>
        <p className="text-center text-xs font-extrabold text-slate-300">{ballast}% ballast</p>
      </div>
      <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {stage} · sketch 110 − age
      </p>
    </WidgetShell>
  );
}

const HIDDEN_LEAKS = [
  { id: "stream", label: "Unused streaming", amount: 45 },
  { id: "gym", label: "Idle gym", amount: 40 },
  { id: "delivery", label: "Delivery fees", amount: 75 },
  { id: "apps", label: "Forgotten apps", amount: 25 },
];

function CashFlowWidget() {
  const [income, setIncome] = useState(4000);
  const [outflow, setOutflow] = useState(3200);
  const net = income - outflow;
  const surplus = net >= 0;
  return (
    <WidgetShell>
      <SliderField
        label="Monthly inflow"
        valueLabel={formatUsd(income)}
        min={2000}
        max={10000}
        step={100}
        value={income}
        onChange={setIncome}
        ariaLabel="Monthly inflow"
      />
      <SliderField
        label="Monthly outflow"
        valueLabel={formatUsd(outflow)}
        min={1000}
        max={10000}
        step={100}
        value={outflow}
        onChange={setOutflow}
        ariaLabel="Monthly outflow"
      />
      <p className={`mt-3 text-center text-lg font-extrabold ${surplus ? "text-emerald-300" : "text-rose-300"}`}>
        {surplus ? "+" : "−"}
        {formatUsd(Math.abs(net))}
      </p>
      <p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {surplus ? "Surplus — fuel for HYSA, debt, investing" : "Deficit — plug leaks before you invest"}
      </p>
    </WidgetShell>
  );
}

function MoneyLeaksWidget() {
  const [plugged, setPlugged] = useState<string[]>([]);
  const leaking = HIDDEN_LEAKS.filter((leak) => !plugged.includes(leak.id)).reduce((sum, leak) => sum + leak.amount, 0);
  const recovered = HIDDEN_LEAKS.filter((leak) => plugged.includes(leak.id)).reduce((sum, leak) => sum + leak.amount, 0);
  const toggle = (id: string) => {
    setPlugged((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };
  return (
    <WidgetShell>
      <div className="grid grid-cols-2 gap-1.5">
        {HIDDEN_LEAKS.map((leak) => {
          const isPlugged = plugged.includes(leak.id);
          return (
            <button
              key={leak.id}
              type="button"
              onClick={() => toggle(leak.id)}
              className={`rounded-lg border px-2 py-2 text-left transition active:scale-[0.99] ${
                isPlugged
                  ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-100"
                  : "border-rose-500/25 bg-rose-500/10 text-rose-100"
              }`}
            >
              <p className="text-[10px] font-bold leading-snug">{leak.label}</p>
              <p className="mt-0.5 text-[11px] font-extrabold">{formatUsd(leak.amount)}/mo</p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                {isPlugged ? "Plugged" : "Leaking — tap"}
              </p>
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-rose-300">Still leaking</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(leaking)}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">Recovered</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(recovered)}</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function CoreSatelliteWidget() {
  const [core, setCore] = useState(70);
  const satellite = 100 - core;
  return (
    <WidgetShell>
      <SliderField
        label="Core (index funds)"
        valueLabel={`${core}%`}
        min={60}
        max={80}
        step={5}
        value={core}
        onChange={setCore}
        ariaLabel="Core allocation percent"
      />
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-black/50">
        <div className="h-full bg-emerald-500" style={{ width: `${core}%` }} />
        <div className="h-full bg-amber-400" style={{ width: `${satellite}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">Core {core}%</p>
          <p className="text-[10px] font-semibold text-slate-300">S&P 500 / VTI</p>
        </div>
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-amber-300">Satellite {satellite}%</p>
          <p className="text-[10px] font-semibold text-slate-300">AAPL, NVDA, themes</p>
        </div>
      </div>
    </WidgetShell>
  );
}

const SP_SECTORS = [
  "Tech",
  "Healthcare",
  "Financials",
  "Energy",
  "Industrials",
  "Staples",
  "Discretionary",
  "Communications",
  "Utilities",
  "Real Estate",
  "Materials",
];

function SectorMixWidget() {
  const [tech, setTech] = useState(100);
  const trap = tech >= 70;
  const balanced = tech <= 40;
  return (
    <WidgetShell>
      <SliderField
        label="Tech share of the book"
        valueLabel={`${tech}%`}
        min={15}
        max={100}
        step={5}
        value={tech}
        onChange={setTech}
        ariaLabel="Technology sector share"
      />
      <div className="mt-3 flex flex-wrap gap-1">
        {SP_SECTORS.map((sector) => {
          const isTech = sector === "Tech";
          const dimmed = !isTech && tech >= 80;
          return (
            <span
              key={sector}
              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
                isTech
                  ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
                  : dimmed
                    ? "border-[#1F1F1F] bg-black/20 text-slate-600"
                    : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
              }`}
            >
              {sector}
            </span>
          );
        })}
      </div>
      <p
        className={`mt-2 text-center text-[10px] font-semibold uppercase tracking-wide ${
          trap ? "text-rose-300" : balanced ? "text-emerald-300" : "text-amber-300"
        }`}
      >
        {trap
          ? "Single Sector Trap — one story, one crash"
          : balanced
            ? "11 sectors can offset a tech downturn"
            : "Still tech-heavy — add non-correlated groups"}
      </p>
    </WidgetShell>
  );
}

function PositionSizeWidget() {
  const [portfolio, setPortfolio] = useState(20000);
  const [position, setPosition] = useState(2000);
  const pct = portfolio > 0 ? (position / portfolio) * 100 : 0;
  const band = pct <= 5 ? "ok" : pct <= 10 ? "edge" : "hot";
  const color = band === "ok" ? "text-emerald-300" : band === "edge" ? "text-amber-300" : "text-rose-300";
  const note =
    band === "ok"
      ? "Inside the 5% comfort zone"
      : band === "edge"
        ? "At the 5%–10% ceiling — no larger"
        : "Concentration risk — one name can sink you";
  return (
    <WidgetShell>
      <SliderField
        label="Total portfolio"
        valueLabel={formatUsd(portfolio)}
        min={5000}
        max={100000}
        step={1000}
        value={portfolio}
        onChange={setPortfolio}
        ariaLabel="Total portfolio value"
      />
      <SliderField
        label="One stock position"
        valueLabel={formatUsd(position)}
        min={500}
        max={40000}
        step={500}
        value={position}
        onChange={setPosition}
        ariaLabel="Single stock position"
      />
      <p className={`mt-3 text-center text-2xl font-extrabold ${color}`}>{pct.toFixed(1)}%</p>
      <p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">{note}</p>
    </WidgetShell>
  );
}

function NetMarginWidget() {
  const [revenue, setRevenue] = useState(50);
  const [income, setIncome] = useState(8);
  const net = Math.min(income, revenue);
  const margin = revenue > 0 ? (net / revenue) * 100 : 0;
  return (
    <WidgetShell>
      <SliderField
        label="Revenue"
        valueLabel={`$${revenue}m`}
        min={10}
        max={200}
        step={5}
        value={revenue}
        onChange={(next) => {
          setRevenue(next);
          setIncome((prev) => Math.min(prev, next));
        }}
        ariaLabel="Revenue"
      />
      <SliderField
        label="Net income"
        valueLabel={`$${net}m`}
        min={1}
        max={revenue}
        step={1}
        value={net}
        onChange={setIncome}
        ariaLabel="Net income"
      />
      <p className="mt-3 text-center text-2xl font-extrabold text-emerald-300">{margin.toFixed(1)}% net margin</p>
      <p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        net income ÷ revenue
      </p>
    </WidgetShell>
  );
}

function PanicHoldWidget({ widget }: { widget: Extract<LessonWidget, { type: "panic-hold" }> }) {
  const [drop, setDrop] = useState(30);
  const remaining = widget.startValue * (1 - drop / 100);
  const recovery = drop / (100 - drop) * 100;
  return (
    <WidgetShell>
      <SliderField
        label="Market drop"
        valueLabel={`−${drop}%`}
        min={10}
        max={50}
        step={1}
        value={drop}
        onChange={setDrop}
        ariaLabel="Market drop percent"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-rose-300">If you sell</p>
          <p className="text-sm font-extrabold text-white">{formatUsd(remaining)}</p>
          <p className="text-[9px] text-slate-500">loss locked in</p>
        </div>
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">To get even</p>
          <p className="text-sm font-extrabold text-white">+{recovery.toFixed(0)}%</p>
          <p className="text-[9px] text-slate-500">rally needed</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function CardWidget({ card }: { card: StoryCard }) {
  const widget = card.widget;
  const [monthly, setMonthly] = useState(100);
  const [years, setYears] = useState(20);

  if (!widget) return null;

  if (widget.type === "debt-payoff") return <DebtPayoffWidget />;
  if (widget.type === "budget-503020") return <BudgetWidget widget={widget} />;
  if (widget.type === "hysa") return <HysaWidget widget={widget} />;
  if (widget.type === "match-401k") return <Match401kWidget widget={widget} />;
  if (widget.type === "roth-trad") return <RothTradWidget widget={widget} />;
  if (widget.type === "hsa") return <HsaWidget widget={widget} />;
  if (widget.type === "expense-ratio") return <ExpenseRatioWidget widget={widget} />;
  if (widget.type === "tbill") return <TbillWidget widget={widget} />;
  if (widget.type === "balance-sheet") return <BalanceSheetWidget />;
  if (widget.type === "pe-ratio") return <PeRatioWidget />;
  if (widget.type === "fcf-div") return <FcfDivWidget />;
  if (widget.type === "dca") return <DcaWidget widget={widget} />;
  if (widget.type === "allocation") return <AllocationWidget />;
  if (widget.type === "panic-hold") return <PanicHoldWidget widget={widget} />;
  if (widget.type === "net-margin") return <NetMarginWidget />;
  if (widget.type === "cash-flow") return <CashFlowWidget />;
  if (widget.type === "money-leaks") return <MoneyLeaksWidget />;
  if (widget.type === "core-satellite") return <CoreSatelliteWidget />;
  if (widget.type === "sector-mix") return <SectorMixWidget />;
  if (widget.type === "position-size") return <PositionSizeWidget />;

  if (widget.type !== "compound") return null;
  const grown = monthlyCompound(monthly, widget.rate, years);
  return (
    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
        <span>Monthly habit</span>
        <span className="text-emerald-300">{formatUsd(monthly)}</span>
      </div>
      <input
        type="range"
        className="matter-slider mt-2 w-full"
        min={25}
        max={500}
        step={25}
        value={monthly}
        onChange={(e) => setMonthly(Number(e.target.value))}
        aria-label="Monthly investment"
      />
      <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-slate-400">
        <span>Years invested</span>
        <span className="text-emerald-300">{years} yrs</span>
      </div>
      <input
        type="range"
        className="matter-slider mt-2 w-full"
        min={5}
        max={40}
        step={1}
        value={years}
        onChange={(e) => setYears(Number(e.target.value))}
        aria-label="Years invested"
      />
      <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {(widget.rate * 100).toFixed(0)}% annual · left untouched
      </p>
      <p className="mt-1 text-center text-2xl font-extrabold tracking-tight text-emerald-300">{formatUsd(grown)}</p>
    </div>
  );
}

export function LessonDeck({
  cards,
  index,
  accent,
  onIndexChange,
  onCardAdvance,
  onComplete,
}: {
  cards: StoryCard[];
  index: number;
  accent: string;
  onIndexChange: (next: number) => void;
  onCardAdvance?: (fromIndex: number) => void;
  onComplete?: () => void;
}) {
  const card = cards[index];
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const pointerRef = useRef<{ id: number; startX: number; startY: number; dragging: boolean } | null>(null);

  const goTo = (next: number, from = index) => {
    if (animating) return;
    if (next < 0) return;
    if (next >= cards.length) {
      if (from === cards.length - 1) {
        onCardAdvance?.(from);
        onComplete?.();
      }
      return;
    }
    if (next === from) return;
    if (next > from) onCardAdvance?.(from);
    setAnimating(true);
    setDragX(next > from ? -140 : 140);
    window.setTimeout(() => {
      onIndexChange(next);
      setDragX(0);
      setAnimating(false);
    }, 160);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, button, a")) return;
    pointerRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: true };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer?.dragging || pointer.id !== event.pointerId || animating) return;
    setDragX(event.clientX - pointer.startX);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointerRef.current = null;
    const dy = event.clientY - pointer.startY;
    if (Math.abs(dy) > Math.abs(dragX) && Math.abs(dy) > 12) {
      setDragX(0);
      return;
    }
    if (Math.abs(dragX) < 10) goTo(index + 1);
    else if (dragX <= -SWIPE_THRESHOLD) goTo(index + 1);
    else if (dragX >= SWIPE_THRESHOLD) goTo(index - 1);
    else setDragX(0);
  };

  if (!card) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5">
        {cards.map((item, i) => (
          <span
            key={item.id}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={{ background: i <= index ? accent : "rgba(0,0,0,0.35)" }}
          />
        ))}
      </div>

      <div
        className="lesson-deck mt-3 touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="rounded-2xl border border-[#1F1F1F] bg-gradient-to-b from-white/[0.04] to-black/20 p-4"
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX / 48}deg)`,
            transition: pointerRef.current?.dragging ? "none" : "transform 160ms ease-out",
          }}
        >
          <p className="text-4xl leading-none" aria-hidden="true">
            {card.metaphor}
          </p>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
            {card.kicker}
          </p>
          <h4 className="mt-1.5 text-lg font-extrabold leading-snug tracking-tight text-white">{card.headline}</h4>
          <RichCopy className="mt-2 text-sm leading-relaxed text-slate-300" text={card.body} />
          <CardWidget key={card.id} card={card} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[#1F1F1F] text-slate-300 transition hover:border-emerald-500/40 hover:text-white disabled:opacity-30"
          aria-label="Previous card"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-[11px] font-semibold text-slate-500">
          {index + 1} / {cards.length} · swipe or tap
        </p>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-[#042F2E] transition hover:bg-emerald-400"
          aria-label={index >= cards.length - 1 ? "Go to quiz" : "Next card"}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function LessonQuiz({
  quiz,
  onSolved,
}: {
  quiz: LessonQuizDef;
  onSolved: () => void;
}) {
  if (quiz.kind === "match") {
    return <MatchQuiz quiz={quiz} onSolved={onSolved} />;
  }
  return <ScenarioQuiz quiz={quiz} onSolved={onSolved} />;
}

function ScenarioQuiz({
  quiz,
  onSolved,
}: {
  quiz: Extract<LessonQuizDef, { kind: "scenario" }>;
  onSolved: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [missed, setMissed] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "correct" | "wrong">("idle");
  const chosen = quiz.options.find((option) => option.id === selectedId) ?? null;
  const solved = status === "correct";

  const pick = (optionId: string) => {
    if (solved) return;
    const option = quiz.options.find((item) => item.id === optionId);
    if (!option || missed.includes(optionId)) return;
    setSelectedId(optionId);
    if (option.correct) {
      setStatus("correct");
      onSolved();
      return;
    }
    setStatus("wrong");
    setMissed((prev) => (prev.includes(optionId) ? prev : [...prev, optionId]));
  };

  return (
    <div className="mt-4">
      <div className="rounded-xl border border-[#1F1F1F] bg-black/20 p-3">
        <p className="text-xs leading-relaxed text-slate-300">{quiz.scenario}</p>
      </div>
      <p className="mt-3 text-sm font-extrabold text-white">{quiz.question}</p>
      <div className="mt-3 space-y-2">
        {quiz.options.map((option) => {
          const isMiss = missed.includes(option.id);
          const isChosen = selectedId === option.id;
          const glow =
            solved && option.correct
              ? "lesson-card-glow-ok border-emerald-400 bg-emerald-500/15 text-emerald-100"
              : isChosen && status === "wrong"
                ? "lesson-card-glow-bad border-rose-400/70 bg-rose-500/10 text-rose-100"
                : isMiss
                  ? "border-rose-500/20 bg-rose-500/5 text-rose-200/70"
                  : "border-[#1F1F1F] bg-black/20 text-slate-200 hover:border-emerald-500/40";
          return (
            <button
              key={option.id}
              type="button"
              disabled={solved || isMiss}
              onClick={() => pick(option.id)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition active:scale-[0.99] ${glow}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {status === "wrong" && (
        <p className="mt-3 text-center text-xs font-bold text-rose-300" role="status">
          Not quite — try again.
        </p>
      )}

      {solved && chosen && (
        <div className="lesson-card-glow-ok mt-3 rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-3" role="status">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 size={16} />
            <p className="text-sm font-extrabold">Correct</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">{chosen.explanation}</p>
        </div>
      )}
    </div>
  );
}

function MatchQuiz({
  quiz,
  onSolved,
}: {
  quiz: Extract<LessonQuizDef, { kind: "match" }>;
  onSolved: () => void;
}) {
  const terms = quiz.pairs;
  const matches = useMemo(() => shuffle(quiz.pairs), [quiz]);
  const [pickedTerm, setPickedTerm] = useState<string | null>(null);
  const [locked, setLocked] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  const tryMatch = (matchId: string) => {
    if (solved || locked.includes(matchId)) return;
    if (!pickedTerm) return;
    if (pickedTerm === matchId) {
      const nextLocked = [...locked, matchId];
      setLocked(nextLocked);
      setPickedTerm(null);
      setWrong(null);
      if (nextLocked.length === quiz.pairs.length) {
        setSolved(true);
        onSolved();
      }
      return;
    }
    setWrong(matchId);
    window.setTimeout(() => {
      setWrong(null);
      setPickedTerm(null);
    }, 420);
  };

  return (
    <div className="mt-4">
      <p className="text-sm font-extrabold text-white">{quiz.prompt}</p>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">Tap a term, then its meaning.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {terms.map((pair) => {
            const isLocked = locked.includes(pair.id);
            const isPicked = pickedTerm === pair.id;
            return (
              <button
                key={`term-${pair.id}`}
                type="button"
                disabled={isLocked || solved}
                onClick={() => setPickedTerm(isPicked ? null : pair.id)}
                className={`w-full rounded-xl border px-2.5 py-2.5 text-left text-xs font-bold transition ${
                  isLocked
                    ? "lesson-card-glow-ok border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                    : isPicked
                      ? "border-cyan-400/60 bg-cyan-500/10 text-white"
                      : "border-[#1F1F1F] bg-black/20 text-slate-200 hover:border-emerald-500/40"
                }`}
              >
                {pair.term}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {matches.map((pair) => {
            const isLocked = locked.includes(pair.id);
            const isWrong = wrong === pair.id;
            return (
              <button
                key={`match-${pair.id}`}
                type="button"
                disabled={isLocked || solved}
                onClick={() => tryMatch(pair.id)}
                className={`w-full rounded-xl border px-2.5 py-2.5 text-left text-[11px] font-semibold leading-snug transition ${
                  isLocked
                    ? "lesson-card-glow-ok border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                    : isWrong
                      ? "lesson-card-glow-bad border-rose-400/70 bg-rose-500/10 text-rose-100"
                      : "border-[#1F1F1F] bg-black/20 text-slate-300 hover:border-emerald-500/40"
                }`}
              >
                {pair.match}
              </button>
            );
          })}
        </div>
      </div>
      {wrong && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-rose-300" role="status">
          <XCircle size={13} />
          Try again
        </p>
      )}
      {solved && (
        <div className="lesson-card-glow-ok mt-3 rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-3" role="status">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 size={16} />
            <p className="text-sm font-extrabold">Perfect match</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">{quiz.explanation}</p>
        </div>
      )}
    </div>
  );
}
