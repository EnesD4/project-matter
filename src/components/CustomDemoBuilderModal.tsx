import { Briefcase, Plus, Sparkles, Trash2, Wallet, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { getStoredUser } from "../lib/auth";
import {
  applyCustomDemo,
  DEMO_TICKER_CATALOG,
  type CustomDemoInput,
  type DemoScenarioApplyDetail,
} from "../lib/demoScenarios";
import { formatCurrencyInput, formatCurrencyValue, parseCurrency } from "../lib/money";
import { FEATURED_US_BROKERAGES } from "./ConnectBrokerModal";

type StockRow = { id: string; symbol: string; shares: string };

export type CustomDemoBuilderModalProps = {
  open: boolean;
  onClose?: () => void;
  onApplied?: (detail: DemoScenarioApplyDetail) => void;
};

function nextRowId() {
  return `stock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const DEFAULT_STOCKS: StockRow[] = [
  { id: nextRowId(), symbol: "AAPL", shares: "8" },
  { id: nextRowId(), symbol: "SPY", shares: "4" },
];

export default function CustomDemoBuilderModal({
  open,
  onClose,
  onApplied,
}: CustomDemoBuilderModalProps) {
  const [monthlyIncome, setMonthlyIncome] = useState("5,500");
  const [fixedExpenses, setFixedExpenses] = useState("2,400");
  const [discretionaryExpenses, setDiscretionaryExpenses] = useState("900");
  const [highInterestDebt, setHighInterestDebt] = useState("0");
  const [brokerName, setBrokerName] = useState("Robinhood");
  const [customBrokerName, setCustomBrokerName] = useState("");
  const [uninvestedCash, setUninvestedCash] = useState("1,200");
  const [stocks, setStocks] = useState<StockRow[]>(DEFAULT_STOCKS);
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => Object.keys(DEMO_TICKER_CATALOG), []);
  const brokerOptions = useMemo(
    () => [...FEATURED_US_BROKERAGES.map((b) => b.name), "Other"],
    []
  );
  const resolvedBrokerName =
    brokerName === "Other" ? customBrokerName.trim() || "Custom brokerage" : brokerName;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const incomeNum = parseCurrency(monthlyIncome);
  const fixedNum = parseCurrency(fixedExpenses);
  const discNum = parseCurrency(discretionaryExpenses);
  const netCashFlow = incomeNum - fixedNum - discNum;

  const apply = () => {
    if (saving) return;
    setSaving(true);
    try {
      const input: CustomDemoInput = {
        cash: 0,
        creditDebt: parseCurrency(highInterestDebt),
        monthlySpending: fixedNum + discNum,
        monthlyIncome: incomeNum,
        fixedExpenses: fixedNum,
        discretionaryExpenses: discNum,
        brokerName: resolvedBrokerName,
        brokerageCash: parseCurrency(uninvestedCash),
        stocks: stocks
          .map((row) => ({
            symbol: row.symbol.trim().toUpperCase(),
            shares: Number(row.shares) || 0,
          }))
          .filter((row) => row.symbol && row.shares > 0),
      };
      const detail = applyCustomDemo(input, getStoredUser()?.id);
      onApplied?.(detail);
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="matter-pop my-auto flex max-h-[min(92vh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-demo-builder-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#1F1F1F] px-5 pt-5 pb-4">
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">
              Custom demo profile
            </p>
            <h2
              id="custom-demo-builder-title"
              className="mt-1 text-lg font-extrabold tracking-tight text-white"
            >
              Build your scenario
            </h2>
            <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-slate-400">
              Enter cash flow and brokerage holdings. Sprout AI refreshes net cash flow, diversification,
              and your 10-year wealth roadmap instantly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-[#1F1F1F] bg-[#121212] text-slate-200"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section aria-labelledby="custom-cashflow-heading">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <Wallet size={16} />
              </span>
              <div>
                <h3 id="custom-cashflow-heading" className="m-0 text-sm font-extrabold text-white">
                  Cash flow
                </h3>
                <p className="m-0 text-[11px] font-semibold text-slate-500">
                  Net {netCashFlow >= 0 ? "+" : "−"}$
                  {formatCurrencyValue(Math.abs(netCashFlow))}/mo before debt minimums
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <MoneyField label="Monthly income" value={monthlyIncome} onChange={setMonthlyIncome} />
              <MoneyField
                label="High-interest debt"
                value={highInterestDebt}
                onChange={setHighInterestDebt}
              />
              <MoneyField label="Fixed expenses" value={fixedExpenses} onChange={setFixedExpenses} />
              <MoneyField
                label="Discretionary expenses"
                value={discretionaryExpenses}
                onChange={setDiscretionaryExpenses}
              />
            </div>
          </section>

          <section aria-labelledby="custom-brokerage-heading">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
                <Briefcase size={16} />
              </span>
              <div>
                <h3 id="custom-brokerage-heading" className="m-0 text-sm font-extrabold text-white">
                  Brokerage account
                </h3>
                <p className="m-0 text-[11px] font-semibold text-slate-500">
                  Broker, uninvested cash, and stock lots
                </p>
              </div>
            </div>

            <label className="mb-2.5 block">
              <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                Selected broker
              </span>
              <select
                value={brokerName}
                onChange={(event) => setBrokerName(event.target.value)}
                className="w-full rounded-lg border border-[#1F1F1F] bg-black px-3 py-2.5 text-[13px] font-extrabold text-white outline-none focus:border-emerald-500/50"
              >
                {brokerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            {brokerName === "Other" ? (
              <label className="mb-2.5 block">
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  Broker name
                </span>
                <input
                  type="text"
                  value={customBrokerName}
                  placeholder="e.g. Interactive Brokers"
                  onChange={(event) => setCustomBrokerName(event.target.value)}
                  className="w-full rounded-lg border border-[#1F1F1F] bg-black px-3 py-2.5 text-[13px] font-extrabold text-white outline-none focus:border-emerald-500/50"
                />
              </label>
            ) : null}

            <MoneyField
              label="Uninvested cash"
              value={uninvestedCash}
              onChange={setUninvestedCash}
            />

            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  Custom stock holdings
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setStocks((prev) => [...prev, { id: nextRowId(), symbol: "", shares: "" }])
                  }
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
                      list="custom-demo-ticker-catalog"
                      value={row.symbol}
                      onChange={(event) =>
                        setStocks((prev) =>
                          prev.map((item) =>
                            item.id === row.id
                              ? { ...item, symbol: event.target.value.toUpperCase() }
                              : item
                          )
                        )
                      }
                      placeholder="TICKER"
                      aria-label="Stock ticker"
                      className="w-[96px] rounded-lg border border-[#1F1F1F] bg-black px-2 py-1.5 text-[12px] font-extrabold uppercase text-white outline-none focus:border-emerald-500/50"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.shares}
                      onChange={(event) =>
                        setStocks((prev) =>
                          prev.map((item) =>
                            item.id === row.id
                              ? { ...item, shares: event.target.value.replace(/[^0-9.]/g, "") }
                              : item
                          )
                        )
                      }
                      placeholder="Shares / amount"
                      aria-label="Shares or amount"
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
              <datalist id="custom-demo-ticker-catalog">
                {suggestions.map((ticker) => (
                  <option key={ticker} value={ticker} />
                ))}
              </datalist>
            </div>
          </section>
        </div>

        <div className="border-t border-[#1F1F1F] px-5 py-4">
          <button
            type="button"
            onClick={apply}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-extrabold text-[#042F2E] shadow-[0_10px_28px_rgba(16,185,129,0.22)] transition hover:bg-emerald-400 disabled:opacity-60"
          >
            <Sparkles size={16} aria-hidden />
            {saving ? "Applying…" : "Save & analyze with Sprout AI"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-xl px-4 py-2.5 text-[12px] font-bold text-slate-500 transition hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
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
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
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
