import { Loader2, Sparkles } from "lucide-react";
import React, { useEffect, useState } from "react";
import { persistLocalUserSettings, type UserSettings } from "../lib/auth";
import { ageFromBirthDate, maxBirthDateISO, minBirthDateISO } from "../lib/age";
import { getSupabase } from "../lib/supabase";
import { oauthNameFromSupabaseSession } from "../lib/supabaseSync";
import { parseToIsoDate, toUsDateDisplay } from "../lib/usDate";
import UsDateField from "./UsDateField";

type OnboardingScreenProps = {
  initialName?: string;
  initialBirthDate?: string;
  skipNameStep?: boolean;
  onComplete: (name: string, settings: UserSettings) => void;
};

export default function OnboardingScreen({
  initialName = "",
  initialBirthDate = "",
  skipNameStep = false,
  onComplete,
}: OnboardingScreenProps) {
  const oauthName = initialName.trim();
  const hideNameField = skipNameStep;
  const [name, setName] = useState(oauthName);
  const [birthDate, setBirthDate] = useState(initialBirthDate ? toUsDateDisplay(initialBirthDate) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!skipNameStep || name.trim()) return;
    let cancelled = false;
    void oauthNameFromSupabaseSession().then((next) => {
      if (!cancelled && next) setName(next);
    });
    return () => {
      cancelled = true;
    };
  }, [skipNameStep, name]);

  const birthIso = parseToIsoDate(birthDate);
  const age = birthIso ? ageFromBirthDate(birthIso) : null;

  const finish = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = name.trim() || oauthName;
    if (!nextName) {
      setError(
        hideNameField
          ? "We couldn't read your name from your Google account. Try signing in again."
          : "Enter your name to continue."
      );
      return;
    }
    if (!birthIso) {
      setError("Add your date of birth as MM/DD/YYYY to continue.");
      return;
    }
    const nextAge = ageFromBirthDate(birthIso);
    if (nextAge == null) {
      setError("Enter a valid date of birth as MM/DD/YYYY.");
      return;
    }
    if (nextAge < 13) {
      setError("You need to be at least 13 to use Sprout.");
      return;
    }
    if (nextAge > 100) {
      setError("Enter a date of birth within the last 100 years.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const client = getSupabase();
      if (client) {
        const {
          data: { user },
        } = await client.auth.getUser();

        if (user) {
          const profilePatch = {
            name: nextName,
            birth_date: birthIso,
            age: nextAge,
            has_completed_onboarding: true,
          };

          const { data: updated, error: updateError } = await client
            .from("profiles")
            .update(profilePatch)
            .eq("id", user.id)
            .select("id")
            .maybeSingle();

          if (updateError) {
            throw new Error(updateError.message || "Couldn't save your details. Try again.");
          }

          if (!updated) {
            const { error: upsertError } = await client.from("profiles").upsert({
              id: user.id,
              email: user.email ?? null,
              ...profilePatch,
              has_completed_bank_setup: false,
              updated_at: new Date().toISOString(),
            });
            if (upsertError) {
              throw new Error(upsertError.message || "Couldn't save your details. Try again.");
            }
          }
        }
      }

      const settings = persistLocalUserSettings({
        hasActiveInvestments: false,
        hasActiveDebts: false,
        wantsCapitalGrowth: true,
        wantsFinancialLiteracy: true,
        hasCompletedOnboarding: true,
        hasCompletedBankSetup: false,
        age: nextAge,
        birthDate: birthIso,
        name: nextName,
      });
      onComplete(nextName, settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your details. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      <style>{css}</style>
      <div style={styles.glowA} aria-hidden="true" />
      <div style={styles.glowB} aria-hidden="true" />

      <form className="onboard-fade" style={styles.shell} onSubmit={(event) => void finish(event)}>
        <p style={styles.brand}>Sprout</p>
        <div style={styles.iconBadge}>
          <Sparkles size={22} color="#10B981" />
        </div>
        <p style={styles.step}>Step 2 of 3</p>
        <p style={styles.eyebrow}>Welcome</p>
        <h1 style={styles.headline}>{hideNameField ? "When were you born?" : "Let’s get you set up"}</h1>
        <p style={styles.subhead}>
          {hideNameField
            ? "Enter your date of birth as MM/DD/YYYY. Age personalizes Sprout AI and retirement projections — then you’ll connect a bank."
            : "What is your name, and when were you born? Age personalizes Sprout AI and retirement projections — then you’ll connect a bank."}
        </p>

        {hideNameField ? (
          name.trim() || oauthName ? <p style={styles.signedIn}>Signed in as {name.trim() || oauthName}</p> : null
        ) : (
          <label style={styles.field}>
            <span style={styles.label}>What is your name?</span>
            <input
              style={styles.input}
              type="text"
              autoComplete="given-name"
              autoFocus
              placeholder="Alex"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              maxLength={48}
            />
          </label>
        )}

        <label style={styles.field}>
          <span style={styles.label} id="onboard-dob-label">
            When were you born?
          </span>
          <UsDateField
            id="onboard-dob"
            labelledBy="onboard-dob-label"
            autoFocus={hideNameField}
            value={birthDate}
            min={minBirthDateISO()}
            max={maxBirthDateISO()}
            onChange={(next) => {
              setBirthDate(next);
              setError(null);
            }}
            wrapStyle={styles.dateWrap}
            inputStyle={styles.dateInput}
          />
          <span style={styles.hint}>
            {age != null
              ? `Used for Sprout AI advice and compound growth projections · ${age} years old`
              : "Enter MM/DD/YYYY. Used for customizing Sprout AI advice and compound growth projections."}
          </span>
        </label>

        {error ? <p style={styles.error}>{error}</p> : null}

        <button type="submit" style={styles.primaryBtn} disabled={saving}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {saving ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

const css = `
@keyframes onboardFade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.onboard-fade { animation: onboardFade 0.28s ease; }
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
    marginTop: 8,
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
  signedIn: {
    margin: "4px 0 0",
    fontSize: 13,
    fontWeight: 700,
    color: "#6EE7B7",
  },
  dateWrap: {
    border: "1px solid #1F1F1F",
    borderRadius: 12,
    background: "#121212",
    padding: "0 14px",
    minHeight: 52,
  },
  dateInput: {
    border: "none",
    background: "transparent",
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: 750,
    padding: "14px 0",
    outline: "none",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#FFFFFF",
  },
  input: {
    border: "1px solid #1F1F1F",
    borderRadius: 12,
    background: "#121212",
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: 750,
    padding: "14px 14px",
    outline: "none",
  },
  hint: {
    fontSize: 12,
    lineHeight: 1.45,
    color: "#6B7280",
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
  primaryBtn: {
    marginTop: 8,
    border: "none",
    borderRadius: 12,
    background: "#10B981",
    color: "#042F2E",
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
