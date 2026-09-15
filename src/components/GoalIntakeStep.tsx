import { Car, Home, PiggyBank, Sparkles, TrendingUp, Wallet } from "lucide-react";
import React, { useState } from "react";
import {
  PRIMARY_GOAL_OPTIONS,
  type PrimaryFinancialGoal,
} from "../lib/roadmapService";

export type GoalIntakeResult = {
  liquidSavings: number | null;
  primaryGoal: PrimaryFinancialGoal | null;
};

type GoalIntakeStepProps = {
  /** Compact styling for modal shell vs full-screen bank gate. */
  variant?: "screen" | "modal";
  saving?: boolean;
  onComplete: (result: GoalIntakeResult) => void;
};

const GOAL_ICONS: Record<PrimaryFinancialGoal, React.ReactNode> = {
  "home-down-payment": <Home size={16} />,
  "buy-a-car": <Car size={16} />,
  "financial-independence": <Sparkles size={16} />,
  "wealth-growth": <TrendingUp size={16} />,
};

export default function GoalIntakeStep({
  variant = "screen",
  saving = false,
  onComplete,
}: GoalIntakeStepProps) {
  const [savingsInput, setSavingsInput] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryFinancialGoal | null>(null);

  const parseSavings = (): number | null => {
    const cleaned = savingsInput.replace(/[$,\s]/g, "").trim();
    if (!cleaned) return null;
    const value = Number(cleaned);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  };

  const submit = (skipSavings: boolean) => {
    if (saving) return;
    onComplete({
      liquidSavings: skipSavings ? null : parseSavings(),
      primaryGoal,
    });
  };

  const isModal = variant === "modal";

  return (
    <div className={isModal ? "space-y-4 px-5 py-4" : undefined} style={isModal ? undefined : styles.wrap}>
      {!isModal ? (
        <>
          <p style={styles.step}>Almost done</p>
          <div style={styles.iconBadge}>
            <PiggyBank size={22} color="#10B981" />
          </div>
          <p style={styles.eyebrow}>Goals</p>
          <h2 style={styles.headline}>Tell Sprout what matters</h2>
          <p style={styles.subhead}>
            Two quick answers so your 10-year roadmap and milestones match your real starting point.
          </p>
        </>
      ) : (
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">Goals</p>
          <h3 className="mt-1 text-lg font-extrabold tracking-tight text-white">
            Tell Sprout what matters
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Two quick answers so your roadmap and milestones match your starting point.
          </p>
        </div>
      )}

      <div className={isModal ? "rounded-2xl border border-[#1F1F1F] bg-black/30 p-4" : undefined} style={isModal ? undefined : styles.card}>
        <div className={isModal ? "mb-3 flex items-center gap-2 text-sm font-extrabold text-white" : undefined} style={isModal ? undefined : styles.cardHead}>
          <span className={isModal ? "grid h-9 w-9 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : undefined} style={isModal ? undefined : styles.cardIcon}>
            <Wallet size={16} />
          </span>
          <span className={isModal ? undefined : undefined} style={isModal ? undefined : styles.cardTitle}>
            Do you have existing liquid savings / an emergency fund?
          </span>
        </div>
        <label className={isModal ? "block text-[10px] font-semibold uppercase tracking-wide text-slate-500" : undefined} style={isModal ? undefined : styles.label}>
          Amount (USD)
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={savingsInput}
          onChange={(e) => setSavingsInput(e.target.value)}
          placeholder="e.g. 5000"
          disabled={saving}
          className={
            isModal
              ? "mt-1 w-full rounded-xl border border-[#1F1F1F] bg-black/40 px-3 py-2.5 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
              : undefined
          }
          style={isModal ? undefined : styles.input}
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => setSavingsInput("")}
          className={isModal ? "mt-2 text-[11px] font-bold text-slate-500 hover:text-slate-300" : undefined}
          style={isModal ? undefined : styles.skipLink}
        >
          Skip savings for now
        </button>
      </div>

      <div className={isModal ? "rounded-2xl border border-[#1F1F1F] bg-black/30 p-4" : undefined} style={isModal ? undefined : styles.card}>
        <p className={isModal ? "mb-3 text-sm font-extrabold text-white" : undefined} style={isModal ? undefined : styles.cardTitle}>
          What is your primary financial goal?
        </p>
        <div className={isModal ? "grid gap-2" : undefined} style={isModal ? undefined : styles.goalGrid}>
          {PRIMARY_GOAL_OPTIONS.map((option) => {
            const selected = primaryGoal === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={saving}
                onClick={() => setPrimaryGoal(option.id)}
                className={
                  isModal
                    ? `flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        selected
                          ? "border-emerald-500/50 bg-emerald-500/15"
                          : "border-[#1F1F1F] bg-black/20 hover:border-emerald-500/30"
                      }`
                    : undefined
                }
                style={
                  isModal
                    ? undefined
                    : {
                        ...styles.goalBtn,
                        borderColor: selected ? "rgba(16,185,129,0.50)" : "#1F1F1F",
                        background: selected ? "rgba(16,185,129,0.15)" : "#000000",
                      }
                }
              >
                <span
                  className={
                    isModal
                      ? `mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${
                          selected
                            ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                            : "border border-[#1F1F1F] bg-[#121212] text-slate-400"
                        }`
                      : undefined
                  }
                  style={
                    isModal
                      ? undefined
                      : {
                          ...styles.goalIcon,
                          color: selected ? "#6EE7B7" : "#9CA3AF",
                          borderColor: selected ? "rgba(16,185,129,0.40)" : "#1F1F1F",
                          background: selected ? "rgba(16,185,129,0.20)" : "#121212",
                        }
                  }
                >
                  {GOAL_ICONS[option.id]}
                </span>
                <span className="min-w-0">
                  <span className={isModal ? "block text-sm font-extrabold text-white" : undefined} style={isModal ? undefined : styles.goalLabel}>
                    {option.label}
                  </span>
                  <span className={isModal ? "mt-0.5 block text-[11px] leading-snug text-slate-400" : undefined} style={isModal ? undefined : styles.goalHint}>
                    {option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => submit(false)}
        className={
          isModal
            ? "flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-extrabold text-[#042F2E] transition hover:bg-emerald-400 disabled:opacity-60"
            : undefined
        }
        style={isModal ? undefined : styles.primaryBtn}
      >
        {saving ? "Saving…" : "Continue to roadmap"}
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => submit(true)}
        className={
          isModal
            ? "w-full rounded-xl px-4 py-2.5 text-[12px] font-bold text-slate-500 transition hover:text-slate-300"
            : undefined
        }
        style={isModal ? undefined : styles.skipBtn}
      >
        Skip goals for now
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  step: {
    margin: 0,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#6B7280",
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.28)",
    display: "grid",
    placeItems: "center",
    marginTop: 4,
  },
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#6EE7B7",
  },
  headline: {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    lineHeight: 1.2,
    color: "#FFFFFF",
  },
  subhead: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.45,
    color: "#9CA3AF",
  },
  card: {
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    background: "#000000",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    background: "rgba(16, 185, 129, 0.10)",
    border: "1px solid rgba(16, 185, 129, 0.28)",
    color: "#10B981",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#FFFFFF",
    lineHeight: 1.35,
  },
  label: {
    margin: 0,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#6B7280",
  },
  input: {
    border: "1px solid #1F1F1F",
    borderRadius: 12,
    background: "#0A0A0A",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: 600,
    padding: "12px 14px",
    outline: "none",
  },
  skipLink: {
    alignSelf: "flex-start",
    border: "none",
    background: "transparent",
    color: "#6B7280",
    fontSize: 12,
    fontWeight: 700,
    padding: 0,
    cursor: "pointer",
  },
  goalGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  goalBtn: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    border: "1px solid #1F1F1F",
    borderRadius: 12,
    padding: "12px 12px",
    cursor: "pointer",
    textAlign: "left",
  },
  goalIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    border: "1px solid #1F1F1F",
    flexShrink: 0,
  },
  goalLabel: {
    display: "block",
    fontSize: 14,
    fontWeight: 800,
    color: "#FFFFFF",
  },
  goalHint: {
    display: "block",
    marginTop: 2,
    fontSize: 11,
    lineHeight: 1.4,
    color: "#9CA3AF",
  },
  primaryBtn: {
    marginTop: 4,
    border: "none",
    borderRadius: 12,
    background: "#10B981",
    color: "#042F2E",
    fontSize: 15,
    fontWeight: 800,
    padding: "13px 16px",
    cursor: "pointer",
  },
  skipBtn: {
    border: "1px solid #1F1F1F",
    borderRadius: 12,
    background: "#121212",
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: 700,
    padding: "11px 16px",
    cursor: "pointer",
  },
};
