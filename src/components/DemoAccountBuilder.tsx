import { FlaskConical, Plus, Trash2, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { formatCurrencyInput, formatCurrencyValue, parseCurrency } from "../lib/money";
import {
  applyCustomDemo,
  DEMO_TICKER_CATALOG,
  type CustomDemoInput,
  type DemoScenarioId,
} from "../lib/demoScenarios";

type StockRow = { id: string; symbol: string; shares: string };

type DemoAccountBuilderProps = {
  compact?: boolean;
  className?: string;
  onApplied?: (id: DemoScenarioId) => void;
};

function nextRowId() {
  return `stock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function DemoAccountBuilder({
  compact = false,
  className = "",
  onApplied,
}: DemoAccountBuilderProps) {
  const [cash, setCash] = useState("5,000");
  const [creditDebt, setCreditDebt] = useState("0");
  const [monthlySpending, setMonthlySpending] = useState("3,200");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [retirementBalance, setRetirementBalance] = useState("0");
  const [stocks, setStocks] = useState<StockRow[]>([
    { id: nextRowId(), symbol: "AAPL", shares: "8" },
    { id: nextRowId(), symbol: "SPY", shares: "4" },
  ]);

  const suggestions = useMemo(() => Object.keys(DEMO_TICKER_CATALOG), []);

  const apply = () => {
    const input: CustomDemoInput = {
      cash: parseCurrency(cash),
      creditDebt: parseCurrency(creditDebt),
      monthlySpending: parseCurrency(monthlySpending),
      monthlyIncome: monthlyIncome.trim() ? parseCurrency(monthlyIncome) : undefined,
      stocks: stocks
        .map((row) => ({
          symbol: row.symbol.trim().toUpperCase(),
          shares: Number(row.shares) || 0,
        }))
        .filter((row) => row.symbol && row.shares > 0),
      retirementBalance: parseCurrency(retirementBalance),
      retirementType: parseCurrency(retirementBalance) > 0 ? "401k" : undefined,
    };
    applyCustomDemo(input);
    onApplied?.("custom");
  };

  return (
    <section
      aria-label="Demo account builder"
      className={`rounded-2xl border border-emerald-500/25 bg-[#0A0A0A] ${compact ? "p-3.5" : "p-4"} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">
            <FlaskConical size={12} />
            Demo Account Builder
          </p>
          <p className={`m-0 mt-1 font-semibold text-slate-400 ${compact ? "text-[11px]" : "text-xs"}`}>
            Set cash, debt, spending, and stocks. Balances, cash flow, and Sprout AI update instantly.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MoneyField label="Cash" value={cash} onChange={setCash} />
        <MoneyField label="Credit debt" value={creditDebt} onChange={setCreditDebt} />
        <MoneyField label="Monthly spending" value={monthlySpending} onChange={setMonthlySpending} />
        <MoneyField label="Monthly income" value={monthlyIncome} onChange={setMonthlyIncome} placeholder="Auto" />
        <div className="col-span-2">
          <MoneyField label="IRA / 401(k) balance" value={retirementBalance} onChange={setRetirementBalance} />
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Specific stocks</p>
          <button
            type="button"
            onClick={() => setStocks((prev) => [...prev, { id: nextRowId(), symbol: "", shares: "" }])}
            className="inline-flex items-center gap-1 rounded-lg border border-[#1F1F1F] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-300"
          >
            <Plus size={11} />
            Add
          </button>
        </div>
        <div className="space-y-1.5">
          {stocks.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5">
              <input
                list="demo-ticker-catalog"
                value={row.symbol}
                onChange={(event) =>
                  setStocks((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, symbol: event.target.value.toUpperCase() } : item
                    )
                  )
                }
                placeholder="TICKER"
                aria-label="Stock ticker"
                className="w-[88px] rounded-lg border border-[#1F1F1F] bg-black px-2 py-1.5 text-[12px] font-extrabold uppercase text-white outline-none focus:border-emerald-500/50"
              />
              <input
                type="text"
                inputMode="decimal"
                value={row.shares}
                onChange={(event) =>
                  setStocks((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, shares: event.target.value.replace(/[^0-9.]/g, "") } : item
                    )
                  )
                }
                placeholder="Shares"
                aria-label="Share count"
                className="min-w-0 flex-1 rounded-lg border border-[#1F1F1F] bg-black px-2 py-1.5 text-[12px] font-bold text-white outline-none focus:border-emerald-500/50"
              />
              <button
                type="button"
                onClick={() => setStocks((prev) => prev.filter((item) => item.id !== row.id))}
                aria-label={`Remove ${row.symbol || "stock"}`}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#1F1F1F] text-slate-500 hover:text-rose-300"
              >
                {stocks.length > 1 ? <Trash2 size={13} /> : <X size={13} />}
              </button>
            </div>
          ))}
        </div>
        <datalist id="demo-ticker-catalog">
          {suggestions.map((ticker) => (
            <option key={ticker} value={ticker} />
          ))}
        </datalist>
      </div>

      <button
        type="button"
        onClick={apply}
        className="mt-3 w-full rounded-xl bg-[#10B981] px-3 py-2.5 text-sm font-extrabold text-[#042F2E] transition hover:bg-emerald-400"
      >
        Apply demo numbers
      </button>
    </section>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  placeholder = "0",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="flex items-center gap-1 rounded-lg border border-[#1F1F1F] bg-black px-2 py-1.5 focus-within:border-emerald-500/50">
        <span className="text-[12px] font-bold text-slate-500">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(formatCurrencyInput(event.target.value))}
          onBlur={() => {
            const parsed = parseCurrency(value);
            onChange(parsed > 0 ? formatCurrencyValue(parsed) : "");
          }}
          className="w-full bg-transparent text-[13px] font-extrabold text-white outline-none"
        />
      </span>
    </label>
  );
}
