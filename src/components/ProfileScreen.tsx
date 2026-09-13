import {
  BookOpen,
  Calendar,
  Cake,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Fingerprint,
  Landmark,
  Loader2,
  LogOut,
  RotateCcw,
  Mail,
  MessageSquare,
  Moon,
  TrendingUp,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useSoundEnabled } from "../lib/audioService";
import {
  saveUserSettings,
  type AuthUser,
  type OnboardingChoices,
  type UserSettings,
} from "../lib/auth";
import {
  ageFromBirthDate,
  applyAgeToBirthDate,
  clampAge,
  maxBirthDateISO,
  minBirthDateISO,
} from "../lib/age";
import { parseToIsoDate, toDisplayDate } from "../lib/usDate";
import UsDateField from "./UsDateField";
import { evaluateTrophies, type Trophy } from "../lib/achievements";
import {
  msUntilNextLocalMidnight,
  STREAK_UPDATED_EVENT,
} from "../lib/streakService";
import {
  getRetirementDepositCount,
  RETIREMENT_UPDATED_EVENT,
} from "./RetirementPlanner";
import type { Holding } from "./InvestmentPortfolioCard";
import { holdingAccount } from "../lib/accountKind";
import CertificatesSection from "./CertificatesSection";
import DemoScenarioSwitcher from "./DemoScenarioSwitcher";
import ProfileModal from "./ProfileModal";
import TrophyCabinet from "./TrophyCabinet";

type ProfileScreenProps = {
  user: AuthUser;
  settings: UserSettings | null;
  onSettingsChange: (settings: UserSettings) => void;
  onLogout: () => void;
  onResetAppState?: () => void;
  holdings: Holding[];
  holdingsReady?: boolean;
  netWorth: number;
  portfolioValue: number;
  safetyNetValue?: number;
  monthlyExpenses?: number;
  onEditFinancialProfile?: () => void;
};

const PREFERENCE_ROWS: Array<{
  key: keyof OnboardingChoices;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}> = [
  {
    key: "hasActiveInvestments",
    title: "Active investments",
    subtitle: "I currently hold investments",
    icon: <TrendingUp size={16} color="#10B981" />,
  },
  {
    key: "hasActiveDebts",
    title: "Debt payoff",
    subtitle: "I have debts I want to pay off",
    icon: <CreditCard size={16} color="#10B981" />,
  },
  {
    key: "wantsCapitalGrowth",
    title: "Capital growth",
    subtitle: "I want to focus on growing capital",
    icon: <Landmark size={16} color="#10B981" />,
  },
  {
    key: "wantsFinancialLiteracy",
    title: "Financial literacy",
    subtitle: "I want to learn the basics",
    icon: <BookOpen size={16} color="#10B981" />,
  },
];

function formatJoinedDate(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
}

function birthDraftFromSettings(birthDate?: string | null) {
  if (!birthDate) return "";
  return toDisplayDate(birthDate, "MDY");
}

type SettingsRowProps = {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
};

function SettingsRow({ icon, title, subtitle, trailing, onClick }: SettingsRowProps) {
  const content = (
    <>
      <span style={styles.rowIcon}>{icon}</span>
      <span style={styles.rowBody}>
        <span style={styles.rowTitle}>{title}</span>
        {subtitle ? <span style={styles.rowSubtitle}>{subtitle}</span> : null}
      </span>
      {trailing ?? (onClick ? <ChevronRight size={16} color="#9CA3AF" /> : null)}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ ...styles.row, cursor: "pointer" }}>
        {content}
      </button>
    );
  }

  return <div style={styles.row}>{content}</div>;
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        ...styles.toggle,
        background: checked ? "#10B981" : "#1F1F1F",
        borderColor: checked ? "#10B981" : "#2A2A2A",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          ...styles.toggleKnob,
          transform: checked ? "translateX(18px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

export default function ProfileScreen({
  user,
  settings,
  onSettingsChange,
  onLogout,
  onResetAppState,
  holdings,
  holdingsReady = false,
  netWorth,
  portfolioValue,
  safetyNetValue = 0,
  monthlyExpenses = 0,
  onEditFinancialProfile,
}: ProfileScreenProps) {
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [personalInfoOpen, setPersonalInfoOpen] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [ageDraft, setAgeDraft] = useState(settings?.age != null ? String(settings.age) : "");
  const [birthDraft, setBirthDraft] = useState(birthDraftFromSettings(settings?.birthDate));
  const [savingAge, setSavingAge] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [soundEnabled, setSoundEnabled] = useSoundEnabled();

  useEffect(() => {
    setAgeDraft(settings?.age != null ? String(settings.age) : "");
    setBirthDraft(birthDraftFromSettings(settings?.birthDate));
  }, [settings?.age, settings?.birthDate]);

  useEffect(() => {
    let midnightTimer = 0;
    const refresh = () => {
      setTrophies(
        evaluateTrophies({
          userId: user.id,
          holdings,
          netWorth,
          portfolioValue,
          retirementDeposits: getRetirementDepositCount(user.id),
          safetyNetValue,
          monthlyExpenses,
          holdingsReady,
        })
      );
      window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(refresh, msUntilNextLocalMidnight());
    };
    refresh();
    window.addEventListener(RETIREMENT_UPDATED_EVENT, refresh);
    window.addEventListener(STREAK_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(RETIREMENT_UPDATED_EVENT, refresh);
      window.removeEventListener(STREAK_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearTimeout(midnightTimer);
    };
  }, [user.id, holdings, holdingsReady, netWorth, portfolioValue, safetyNetValue, monthlyExpenses]);
  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
  const hasVerifiedHoldings = holdings.some((holding) => holdingAccount(holding) === "verified");
  const hasPaperHoldings = holdings.some((holding) => holdingAccount(holding) === "paper");

  const sendFeedback = () => {
    window.location.href =
      "mailto:feedback@sprout.finance?subject=Sprout%20Finance%20Beta%20Feedback";
  };

  const updatePreference = async (key: keyof OnboardingChoices, value: boolean) => {
    if (!settings || savingPrefs) return;
    setPrefError(null);
    const previous = settings;
    const optimistic: UserSettings = {
      ...settings,
      [key]: value,
      investmentGoal:
        (key === "wantsCapitalGrowth" ? value : settings.wantsCapitalGrowth) ? "growth" : "preservation",
      experienceLevel:
        (key === "wantsFinancialLiteracy" ? value : settings.wantsFinancialLiteracy)
          ? "beginner"
          : "experienced",
    };
    onSettingsChange(optimistic);
    setSavingPrefs(true);
    try {
      const saved = await saveUserSettings({
        hasActiveInvestments: optimistic.hasActiveInvestments,
        hasActiveDebts: optimistic.hasActiveDebts,
        wantsCapitalGrowth: optimistic.wantsCapitalGrowth,
        wantsFinancialLiteracy: optimistic.wantsFinancialLiteracy,
        hasCompletedOnboarding: true,
        hasCompletedBankSetup: optimistic.hasCompletedBankSetup,
        age: optimistic.age ?? null,
        birthDate: optimistic.birthDate ?? null,
      });
      onSettingsChange(saved);
    } catch (err) {
      onSettingsChange(previous);
      setPrefError(err instanceof Error ? err.message : "Couldn't save that preference.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const persistAge = async (age: number, birthDate: string) => {
    if (!settings) return;
    setAgeError(null);
    const previous = settings;
    const optimistic: UserSettings = { ...settings, age, birthDate };
    onSettingsChange(optimistic);
    setSavingAge(true);
    try {
      const saved = await saveUserSettings({
        hasActiveInvestments: optimistic.hasActiveInvestments,
        hasActiveDebts: optimistic.hasActiveDebts,
        wantsCapitalGrowth: optimistic.wantsCapitalGrowth,
        wantsFinancialLiteracy: optimistic.wantsFinancialLiteracy,
        hasCompletedOnboarding: true,
        hasCompletedBankSetup: optimistic.hasCompletedBankSetup,
        age,
        birthDate,
      });
      onSettingsChange(saved);
    } catch (err) {
      onSettingsChange(previous);
      setAgeError(err instanceof Error ? err.message : "Couldn't save your age.");
    } finally {
      setSavingAge(false);
    }
  };

  const commitBirthDate = (iso: string | null) => {
    if (!iso) {
      setBirthDraft(birthDraftFromSettings(settings?.birthDate));
      return;
    }
    if (iso === (parseToIsoDate(settings?.birthDate ?? "", "MDY") || settings?.birthDate)) {
      setBirthDraft(toDisplayDate(iso, "MDY"));
      return;
    }
    const nextAge = ageFromBirthDate(iso);
    if (nextAge == null) {
      setAgeError("Enter a valid birth date as MM/DD/YYYY.");
      setBirthDraft(birthDraftFromSettings(settings?.birthDate));
      return;
    }
    const clamped = clampAge(nextAge);
    setBirthDraft(toDisplayDate(iso, "MDY"));
    setAgeDraft(String(clamped));
    void persistAge(clamped, iso);
  };

  const commitAge = (raw: string) => {
    const parsed = Number(raw.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(parsed) || raw.trim() === "") {
      setAgeDraft(settings?.age != null ? String(settings.age) : "");
      return;
    }
    const clamped = clampAge(parsed);
    const existingIso = parseToIsoDate(birthDraft, "MDY") || settings?.birthDate || null;
    const birthDate = applyAgeToBirthDate(clamped, existingIso);
    setAgeDraft(String(clamped));
    setBirthDraft(toDisplayDate(birthDate, "MDY"));
    void persistAge(clamped, birthDate);
  };

  if (personalInfoOpen) {
    return (
      <div style={styles.root}>
        <button type="button" onClick={() => setPersonalInfoOpen(false)} style={styles.backBtn}>
          <ChevronLeft size={16} />
          Profile
        </button>

        <section style={styles.infoHero} aria-label="Account profile">
          <div style={styles.infoAvatar} aria-hidden="true">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                style={styles.avatarImg}
              />
            ) : (
              initials
            )}
          </div>
          <h2 style={styles.infoName}>{user.name || "—"}</h2>
          <p style={styles.infoHint}>Google / account profile</p>
        </section>

        <section style={styles.card} aria-label="Account details">
          <p style={styles.sectionLabel}>Account</p>
          <div style={styles.detailRow}>
            <span style={styles.rowIcon}>
              <User size={16} color="#10B981" />
            </span>
            <span style={styles.rowBody}>
              <span style={styles.rowSubtitle}>Full name</span>
              <span style={styles.rowTitle}>{user.name || "—"}</span>
            </span>
          </div>
          <div style={styles.divider} />
          <div style={styles.detailRow}>
            <span style={styles.rowIcon}>
              <Mail size={16} color="#10B981" />
            </span>
            <span style={styles.rowBody}>
              <span style={styles.rowSubtitle}>Email</span>
              <span style={styles.rowTitle}>{user.email || "—"}</span>
            </span>
          </div>
          <div style={styles.divider} />
          <div style={styles.detailRow}>
            <span style={styles.rowIcon}>
              <Cake size={16} color="#10B981" />
            </span>
            <span style={styles.rowBody}>
              <span style={styles.rowSubtitle}>Age / Birth date</span>
              <span style={styles.ageFields}>
                <label style={styles.ageField}>
                  <span style={styles.ageFieldLabel}>Age</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Age"
                    value={ageDraft}
                    placeholder="—"
                    disabled={savingAge || !settings}
                    onChange={(e) => setAgeDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    onBlur={(e) => commitAge(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    style={styles.ageInput}
                  />
                </label>
                <label style={styles.ageField}>
                  <span style={styles.ageFieldLabel} id="profile-dob-label">
                    Birth date
                  </span>
                  <UsDateField
                    id="profile-dob"
                    labelledBy="profile-dob-label"
                    value={birthDraft}
                    min={minBirthDateISO()}
                    max={maxBirthDateISO()}
                    disabled={savingAge || !settings}
                    order="MDY"
                    onChange={setBirthDraft}
                    onCommit={commitBirthDate}
                    wrapStyle={styles.dateWrap}
                    inputStyle={styles.dateInput}
                  />
                </label>
              </span>
              <span style={styles.ageHint}>
                {savingAge
                  ? "Saving…"
                  : "Enter MM/DD/YYYY. Used for Sprout AI advice and compound growth projections. Edit anytime."}
              </span>
              {ageError ? <span style={styles.prefError}>{ageError}</span> : null}
            </span>
          </div>
          <div style={styles.divider} />
          <div style={styles.detailRow}>
            <span style={styles.rowIcon}>
              <Calendar size={16} color="#10B981" />
            </span>
            <span style={styles.rowBody}>
              <span style={styles.rowSubtitle}>Registration date</span>
              <span style={styles.rowTitle}>{formatJoinedDate(user.createdAt)}</span>
            </span>
          </div>
        </section>

        <section style={styles.card} aria-label="Onboarding preferences">
          <div style={styles.prefHead}>
            <p style={{ ...styles.sectionLabel, margin: 0 }}>Preferences</p>
            {savingPrefs ? <Loader2 size={14} color="#10B981" className="animate-spin" /> : null}
          </div>
          <p style={styles.prefIntro}>Choices from onboarding — update anytime.</p>
          {PREFERENCE_ROWS.map((row, index) => (
            <React.Fragment key={row.key}>
              {index > 0 ? <div style={styles.divider} /> : null}
              <SettingsRow
                icon={row.icon}
                title={row.title}
                subtitle={row.subtitle}
                trailing={
                  <Toggle
                    checked={Boolean(settings?.[row.key])}
                    onChange={(next) => void updatePreference(row.key, next)}
                    label={row.title}
                    disabled={savingPrefs || !settings}
                  />
                }
              />
            </React.Fragment>
          ))}
          {prefError ? <p style={styles.prefError}>{prefError}</p> : null}
        </section>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* User card */}
      <section style={styles.userCard} aria-label="Profile">
        <div style={styles.avatar} aria-hidden="true">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              style={styles.avatarImg}
            />
          ) : (
            initials
          )}
        </div>
        <div style={styles.userMeta}>
          <h2 style={styles.userName}>{user.name}</h2>
          <p style={styles.userEmail}>{user.email}</p>
          <span style={styles.planBadge}>Free Plan</span>
        </div>
      </section>

      <ProfileModal onRecalculate={onEditFinancialProfile} />
      <DemoScenarioSwitcher />

      <CertificatesSection userId={user.id} />
      <TrophyCabinet trophies={trophies} />

      {/* Currency lock */}
      <section style={styles.card} aria-label="Currency">
        <p style={styles.sectionLabel}>Currency</p>
        <div style={styles.currencyRow}>
          <div>
            <p style={styles.currencyPrimary}>USD ($)</p>
            <p style={styles.currencyHint}>Primary currency · US market</p>
          </div>
          <span style={styles.lockChip}>Locked</span>
        </div>
      </section>

      {/* Account */}
      <section style={styles.card} aria-label="Account settings">
        <p style={styles.sectionLabel}>Account</p>
        <SettingsRow
          icon={<User size={16} color="#10B981" />}
          title="Personal Info"
          subtitle="Name, email, age, and account profile"
          onClick={() => setPersonalInfoOpen(true)}
        />
        <div style={styles.divider} />
        <SettingsRow
          icon={<Fingerprint size={16} color="#10B981" />}
          title="Biometric Authentication"
          subtitle="Face ID / Touch ID"
          trailing={
            <Toggle
              checked={biometricEnabled}
              onChange={setBiometricEnabled}
              label="Biometric Authentication"
            />
          }
        />
      </section>

      {/* Integrations */}
      <section style={styles.card} aria-label="Integrations">
        <p style={styles.sectionLabel}>Integrations</p>
        <SettingsRow
          icon={<Landmark size={16} color="#10B981" />}
          title="Connected Brokerage Accounts"
          subtitle={
            hasVerifiedHoldings
              ? "Verified Brokerage Portfolio connected"
              : hasPaperHoldings
                ? "Paper Account only · no verified brokerage"
                : "No accounts connected"
          }
          trailing={
            <span
              style={
                hasVerifiedHoldings
                  ? styles.statusChipActive
                  : hasPaperHoldings
                    ? styles.statusChipPaper
                    : styles.statusChip
              }
            >
              {hasVerifiedHoldings ? "Verified" : hasPaperHoldings ? "Paper" : "Demo"}
            </span>
          }
        />
      </section>

      {/* App Preferences */}
      <section style={styles.card} aria-label="App preferences">
        <p style={styles.sectionLabel}>App Preferences</p>
        <SettingsRow
          icon={<Moon size={16} color="#10B981" />}
          title="Theme"
          subtitle="Matte Dark Mode · #000000"
          trailing={<span style={styles.statusChipActive}>Default</span>}
        />
        <div style={styles.divider} />
        <SettingsRow
          icon={
            soundEnabled ? (
              <Volume2 size={16} color="#10B981" />
            ) : (
              <VolumeX size={16} color="#10B981" />
            )
          }
          title="Sound effects"
          subtitle={soundEnabled ? "Micro-interactions on" : "Audio feedback muted"}
          trailing={
            <Toggle
              checked={soundEnabled}
              onChange={setSoundEnabled}
              label="Sound effects"
            />
          }
        />
      </section>

      {/* Support */}
      <section style={styles.card} aria-label="Support and feedback">
        <p style={styles.sectionLabel}>Support & Feedback</p>
        <button type="button" onClick={sendFeedback} style={styles.feedbackBtn}>
          <MessageSquare size={16} />
          Send Feedback
        </button>
        <p style={styles.feedbackHint}>Help shape Sprout Finance during beta testing.</p>
      </section>

      {/* Log out */}
      <button type="button" onClick={onLogout} style={styles.logoutBtn}>
        <LogOut size={16} />
        Log Out
      </button>
      {onResetAppState ? (
        <button type="button" onClick={onResetAppState} style={styles.resetBtn}>
          <RotateCcw size={16} />
          Reset App State (Dev)
        </button>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    paddingBottom: 88,
  },
  userCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #10B981, #059669)",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 22,
    color: "#042F2E",
    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.22)",
    flexShrink: 0,
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  userMeta: {
    minWidth: 0,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  userName: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#FFFFFF",
  },
  userEmail: {
    margin: 0,
    fontSize: 13,
    color: "#9CA3AF",
  },
  planBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    color: "#6EE7B7",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  card: {
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    padding: 14,
  },
  sectionLabel: {
    margin: "0 0 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#9CA3AF",
  },
  currencyRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  currencyPrimary: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "#FFFFFF",
  },
  currencyHint: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "#9CA3AF",
  },
  lockChip: {
    background: "rgba(156, 163, 175, 0.12)",
    border: "1px solid #2A2A2A",
    color: "#9CA3AF",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  row: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 4px",
    background: "transparent",
    border: "none",
    color: "inherit",
    textAlign: "left",
    cursor: "default",
    borderRadius: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: "rgba(16, 185, 129, 0.12)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#FFFFFF",
  },
  rowSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  divider: {
    height: 1,
    background: "#1F1F1F",
    margin: "2px 0",
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 999,
    border: "1px solid",
    padding: 2,
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.2s ease, border-color 0.2s ease",
  },
  toggleKnob: {
    display: "block",
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#FFFFFF",
    transition: "transform 0.2s ease",
    boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
  statusChip: {
    background: "rgba(156, 163, 175, 0.12)",
    border: "1px solid #2A2A2A",
    color: "#9CA3AF",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  statusChipPaper: {
    background: "rgba(245, 158, 11, 0.12)",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    color: "#FCD34D",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  statusChipActive: {
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    color: "#6EE7B7",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  feedbackBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.4)",
    color: "#6EE7B7",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 750,
    cursor: "pointer",
  },
  feedbackHint: {
    margin: "8px 0 0",
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },
  logoutBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    background: "transparent",
    border: "1px solid #F43F5E",
    color: "#FDA4AF",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 750,
    cursor: "pointer",
  },
  resetBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    background: "transparent",
    border: "1px dashed #4B5563",
    color: "#9CA3AF",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 750,
    cursor: "pointer",
  },
  backBtn: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: "none",
    color: "#9CA3AF",
    padding: "4px 0",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  infoHero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 8,
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    padding: "22px 16px 18px",
  },
  infoAvatar: {
    width: 84,
    height: 84,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #10B981, #059669)",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 28,
    color: "#042F2E",
    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.22)",
    overflow: "hidden",
  },
  infoName: {
    margin: "6px 0 0",
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#FFFFFF",
  },
  infoHint: {
    margin: 0,
    fontSize: 12,
    color: "#9CA3AF",
  },
  detailRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 4px",
  },
  prefHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  prefIntro: {
    margin: "0 0 8px",
    fontSize: 12,
    color: "#9CA3AF",
  },
  prefError: {
    margin: "8px 0 0",
    fontSize: 12,
    color: "#FDA4AF",
  },
  ageFields: {
    display: "grid",
    gridTemplateColumns: "88px 1fr",
    gap: 8,
    marginTop: 8,
    width: "100%",
  },
  ageField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  ageFieldLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#64748B",
  },
  ageInput: {
    width: "100%",
    background: "#000000",
    border: "1px solid #1F1F1F",
    borderRadius: 10,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: 800,
    padding: "8px 10px",
    outline: "none",
  },
  dateWrap: {
    border: "1px solid #1F1F1F",
    borderRadius: 10,
    background: "#000000",
    padding: "0 10px",
    minHeight: 38,
  },
  dateInput: {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: 700,
    padding: "8px 0",
    outline: "none",
  },
  ageHint: {
    marginTop: 6,
    fontSize: 11,
    color: "#64748B",
  },
};
