import { Landmark, Sparkles } from "lucide-react";
import React, { useState } from "react";
import { getStoredUser, saveUserSettings, type UserSettings } from "../lib/auth";
import { applyDemoScenario, inferProfileFromBalances } from "../lib/demoScenarios";
import { saveFinancialProfile } from "../lib/roadmapService";
import PlaidConnectButton from "./PlaidConnectButton";

type BankConnectionScreenProps = {
  currentSettings: UserSettings;
  onComplete: (settings: UserSettings) => void;
};

export default function BankConnectionScreen({
  currentSettings,
  onComplete,
}: BankConnectionScreenProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (connected: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const settings = await saveUserSettings({
        hasActiveInvestments: currentSettings.hasActiveInvestments || connected,
        hasActiveDebts: currentSettings.hasActiveDebts,
        wantsCapitalGrowth: currentSettings.wantsCapitalGrowth,
        wantsFinancialLiteracy: currentSettings.wantsFinancialLiteracy,
        hasCompletedOnboarding: true,
        hasCompletedBankSetup: true,
        age: currentSettings.age ?? null,
        birthDate: currentSettings.birthDate ?? null,
      });
      onComplete(settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't finish setup. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const applyDemo = () => {
    const detail = applyDemoScenario("balanced", getStoredUser()?.id);
    saveFinancialProfile(detail.profile, getStoredUser()?.id);
    void finish(true);
  };

  return (
    <div style={styles.page}>
      <style>{css}</style>
      <div style={styles.glowA} aria-hidden="true" />
      <div style={styles.glowB} aria-hidden="true" />

      <div className="bank-fade" style={styles.shell}>
        <p style={styles.brand}>Sprout</p>
        <p style={styles.step}>Step 3 of 3</p>
        <div style={styles.iconBadge}>
          <Landmark size={22} color="#10B981" />
        </div>
        <p style={styles.eyebrow}>Connect Bank</p>
        <h1 style={styles.headline}>Link your money</h1>
        <p style={styles.subhead}>
          Connect via Plaid or load a demo bank so Sprout AI can analyze cash flow and build your roadmap.
          You can skip and come back later.
        </p>

        <div style={styles.card}>
          <div style={styles.cardHead}>
            <span style={styles.cardIcon}>
              <Landmark size={16} />
            </span>
            <span style={styles.cardTitle}>Connect with Plaid</span>
          </div>
          <PlaidConnectButton
            onConnected={(result) => {
              const investments = result.holdings.reduce((sum, lot) => sum + lot.shares * lot.buyPrice, 0);
              const monthlyEssentialExpenses = result.expenses.reduce((sum, item) => sum + item.amount, 0);
              saveFinancialProfile(
                inferProfileFromBalances({
                  cash: result.chaseChecking,
                  hysa: result.marcusHysa + (result.moneyMarket ?? 0),
                  investments,
                  monthlyIncome: result.monthlyIncome,
                  monthlyEssentialExpenses,
                }),
                getStoredUser()?.id
              );
              void finish(true);
            }}
          />
          <p style={styles.hint}>
            Sandbox login: <span style={{ color: "#D1D5DB" }}>user_good</span> /{" "}
            <span style={{ color: "#D1D5DB" }}>pass_good</span>. Pick any test bank.
          </p>
        </div>

        <button type="button" style={styles.demoBtn} disabled={saving} onClick={applyDemo}>
          <Sparkles size={16} color="#10B981" />
          {saving ? "Loading…" : "Use demo bank data"}
        </button>

        {error ? <p style={styles.error}>{error}</p> : null}

        <button
          type="button"
          style={styles.skipBtn}
          disabled={saving}
          onClick={() => void finish(false)}
        >
          {saving ? "Saving…" : "Skip for now"}
        </button>
      </div>
    </div>
  );
}

const css = `
@keyframes bankFade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.bank-fade { animation: bankFade 0.28s ease; }
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#000000",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    padding: "max(20px, env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px))",
    position: "relative",
    overflow: "hidden",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  },
  glowA: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(16,185,129,0.18), transparent 68%)",
    top: -120,
    left: -80,
    pointerEvents: "none",
  },
  glowB: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(16,185,129,0.10), transparent 70%)",
    bottom: -100,
    right: -60,
    pointerEvents: "none",
  },
  shell: {
    width: "100%",
    maxWidth: 420,
    minWidth: 0,
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 20,
    padding: "28px 22px 24px",
    boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  brand: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#10B981",
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
    fontSize: 28,
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
    gap: 10,
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
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
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#FFFFFF",
  },
  hint: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.45,
    color: "#6B7280",
    textAlign: "center",
  },
  error: {
    margin: 0,
    fontSize: 13,
    color: "#FDA4AF",
    background: "rgba(244,63,94,0.10)",
    border: "1px solid rgba(244,63,94,0.28)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  demoBtn: {
    border: "1px solid rgba(16,185,129,0.35)",
    borderRadius: 12,
    background: "rgba(16,185,129,0.10)",
    color: "#ECFDF5",
    fontSize: 14,
    fontWeight: 800,
    padding: "12px 16px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  skipBtn: {
    marginTop: 4,
    border: "1px solid #1F1F1F",
    borderRadius: 12,
    background: "#121212",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 800,
    padding: "13px 16px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
};
