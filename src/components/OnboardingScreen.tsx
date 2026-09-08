import {
  BookOpen,
  ChevronLeft,
  CreditCard,
  GraduationCap,
  Landmark,
  Loader2,
  MessageCircle,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import React, { useState } from "react";
import { saveUserSettings, type OnboardingChoices, type UserSettings } from "../lib/auth";

type Phase = "survey" | "walkthrough";

type SurveyStep = 0 | 1 | 2 | 3;
type WalkthroughStep = 0 | 1 | 2 | 3;

type OnboardingScreenProps = {
  onComplete: (settings: UserSettings) => void;
};

const SURVEY: Array<{
  key: keyof OnboardingChoices;
  eyebrow: string;
  question: string;
  icon: React.ReactNode;
}> = [
  {
    key: "hasActiveInvestments",
    eyebrow: "Investments",
    question: "Do you currently hold active investments?",
    icon: <TrendingUp size={22} color="#10B981" />,
  },
  {
    key: "hasActiveDebts",
    eyebrow: "Debt Status",
    question: "Do you have active debts you want to pay off?",
    icon: <CreditCard size={22} color="#10B981" />,
  },
  {
    key: "wantsCapitalGrowth",
    eyebrow: "Financial Goal",
    question: "Do you want to focus on growing your capital?",
    icon: <Landmark size={22} color="#10B981" />,
  },
  {
    key: "wantsFinancialLiteracy",
    eyebrow: "Financial Literacy",
    question: "Would you like to learn financial literacy basics?",
    icon: <GraduationCap size={22} color="#10B981" />,
  },
];

const WALKTHROUGH_META: Array<{
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
}> = [
  { eyebrow: "Tab 1 of 4", title: "Portfolio", icon: <Wallet size={20} color="#042F2E" /> },
  { eyebrow: "Tab 2 of 4", title: "Cash Flow & Debt", icon: <CreditCard size={20} color="#042F2E" /> },
  { eyebrow: "Tab 3 of 4", title: "Lessons", icon: <BookOpen size={20} color="#042F2E" /> },
  { eyebrow: "Tab 4 of 4", title: "Mater AI", icon: <MessageCircle size={20} color="#042F2E" /> },
];

function walkthroughLine(step: WalkthroughStep, answers: OnboardingChoices): string {
  if (step === 0) {
    return answers.hasActiveInvestments
      ? "Add your assets or connect your broker to track your overall performance."
      : "Start with paper trading in Lessons or build your first portfolio when ready!";
  }
  if (step === 1) {
    return answers.hasActiveDebts
      ? "Set up your debt payoff strategy and track your monthly budget balance."
      : "Track your net cash flow and build your 3-month emergency fund target.";
  }
  if (step === 2) {
    return answers.wantsFinancialLiteracy
      ? "Explore step-by-step guides to master personal finance fundamentals."
      : "Check back anytime to refresh your market strategies or catch new insights.";
  }
  return "Ask me anything about market reports, portfolio feedback, or general advice anytime. Let's begin!";
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [phase, setPhase] = useState<Phase>("survey");
  const [surveyStep, setSurveyStep] = useState<SurveyStep>(0);
  const [walkthroughStep, setWalkthroughStep] = useState<WalkthroughStep>(0);
  const [answers, setAnswers] = useState<Partial<OnboardingChoices>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const survey = SURVEY[surveyStep];
  const tour = WALKTHROUGH_META[walkthroughStep];
  const progress =
    phase === "survey" ? (surveyStep + 1) / 8 : (4 + walkthroughStep + 1) / 8;

  const answerQuestion = (value: boolean) => {
    setError(null);
    const key = SURVEY[surveyStep].key;
    const nextAnswers = { ...answers, [key]: value };
    setAnswers(nextAnswers);

    if (surveyStep < 3) {
      setSurveyStep((surveyStep + 1) as SurveyStep);
      return;
    }
    setPhase("walkthrough");
    setWalkthroughStep(0);
  };

  const goBack = () => {
    setError(null);
    if (phase === "walkthrough") {
      if (walkthroughStep === 0) {
        setPhase("survey");
        setSurveyStep(3);
        return;
      }
      setWalkthroughStep((walkthroughStep - 1) as WalkthroughStep);
      return;
    }
    if (surveyStep > 0) {
      setSurveyStep((surveyStep - 1) as SurveyStep);
    }
  };

  const finish = async () => {
    if (
      answers.hasActiveInvestments === undefined ||
      answers.hasActiveDebts === undefined ||
      answers.wantsCapitalGrowth === undefined ||
      answers.wantsFinancialLiteracy === undefined
    ) {
      setError("Please answer every question before continuing.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const settings = await saveUserSettings({
        hasActiveInvestments: answers.hasActiveInvestments,
        hasActiveDebts: answers.hasActiveDebts,
        wantsCapitalGrowth: answers.wantsCapitalGrowth,
        wantsFinancialLiteracy: answers.wantsFinancialLiteracy,
        hasCompletedOnboarding: true,
      });
      onComplete(settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your answers. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const completeAnswers = answers as OnboardingChoices;
  const canGoBack = phase === "walkthrough" || surveyStep > 0;

  return (
    <div style={styles.page}>
      <style>{css}</style>
      <div style={styles.glowA} aria-hidden="true" />
      <div style={styles.glowB} aria-hidden="true" />

      <div style={styles.shell}>
        <header style={styles.topBar}>
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            aria-label="Go back"
            style={{
              ...styles.backBtn,
              opacity: canGoBack ? 1 : 0,
              pointerEvents: canGoBack ? "auto" : "none",
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <p style={styles.brand}>MatterPro</p>
          <span style={styles.stepCount}>
            {phase === "survey" ? `${surveyStep + 1}/4` : `${walkthroughStep + 1}/4`}
          </span>
        </header>

        <div style={styles.progressTrack} aria-hidden="true">
          <div style={{ ...styles.progressFill, width: `${Math.round(progress * 100)}%` }} />
        </div>

        {phase === "survey" ? (
          <div key={`q-${surveyStep}`} className="onboard-fade" style={styles.body}>
            <div style={styles.iconBadge}>{survey.icon}</div>
            <p style={styles.eyebrow}>{survey.eyebrow}</p>
            <h1 style={styles.headline}>{survey.question}</h1>

            <div style={styles.choiceRow}>
              <button
                type="button"
                style={{
                  ...styles.yesBtn,
                  ...(answers[survey.key] === true ? styles.choiceSelected : undefined),
                }}
                onClick={() => answerQuestion(true)}
              >
                Yes
              </button>
              <button
                type="button"
                style={{
                  ...styles.noBtn,
                  ...(answers[survey.key] === false ? styles.choiceSelected : undefined),
                }}
                onClick={() => answerQuestion(false)}
              >
                No
              </button>
            </div>
          </div>
        ) : (
          <div key={`w-${walkthroughStep}`} className="onboard-fade" style={styles.body}>
            <div style={styles.materRow}>
              <div style={styles.materAvatar} aria-hidden="true">
                🏛️
              </div>
              <div>
                <p style={styles.materName}>Mater</p>
                <p style={styles.materRole}>Your MatterPro guide</p>
              </div>
            </div>

            <div style={styles.tabChip}>
              <span style={styles.tabChipIcon}>{tour.icon}</span>
              <span>
                <span style={styles.tabChipEyebrow}>{tour.eyebrow}</span>
                <span style={styles.tabChipTitle}>{tour.title}</span>
              </span>
            </div>

            <div style={styles.speech}>
              <p style={styles.speechText}>{walkthroughLine(walkthroughStep, completeAnswers)}</p>
            </div>

            {error ? <p style={styles.error}>{error}</p> : null}

            {walkthroughStep < 3 ? (
              <button
                type="button"
                style={styles.primaryBtn}
                onClick={() => setWalkthroughStep((walkthroughStep + 1) as WalkthroughStep)}
              >
                Continue
              </button>
            ) : (
              <button type="button" style={styles.primaryBtn} onClick={() => void finish()} disabled={saving}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {saving ? "Saving…" : "Explore MatterPro"}
              </button>
            )}
          </div>
        )}
      </div>
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
    padding: "28px 16px",
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
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 20,
    padding: "22px 22px 24px",
    boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
    position: "relative",
    zIndex: 1,
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 14,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #1F1F1F",
    background: "#121212",
    color: "#E2E8F0",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
  },
  brand: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#10B981",
  },
  stepCount: {
    fontSize: 12,
    fontWeight: 700,
    color: "#9CA3AF",
    minWidth: 34,
    textAlign: "right",
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    background: "#121212",
    overflow: "hidden",
    marginBottom: 22,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "#10B981",
    transition: "width 0.25s ease",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.28)",
    display: "grid",
    placeItems: "center",
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
  choiceRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 10,
  },
  yesBtn: {
    border: "none",
    borderRadius: 12,
    background: "#10B981",
    color: "#042F2E",
    fontSize: 16,
    fontWeight: 800,
    padding: "14px 12px",
    cursor: "pointer",
  },
  noBtn: {
    border: "1px solid #2A2A2A",
    borderRadius: 12,
    background: "#121212",
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: 800,
    padding: "14px 12px",
    cursor: "pointer",
  },
  choiceSelected: {
    boxShadow: "0 0 0 2px rgba(16, 185, 129, 0.55)",
  },
  materRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  materAvatar: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #10B981, #064E3B)",
    display: "grid",
    placeItems: "center",
    fontSize: 20,
    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.22)",
    flexShrink: 0,
  },
  materName: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "#FFFFFF",
  },
  materRole: {
    margin: "2px 0 0",
    fontSize: 12,
    color: "#9CA3AF",
  },
  tabChip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(16, 185, 129, 0.10)",
    border: "1px solid rgba(16, 185, 129, 0.28)",
    borderRadius: 14,
    padding: "10px 12px",
  },
  tabChipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "#10B981",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  tabChipEyebrow: {
    display: "block",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#6EE7B7",
  },
  tabChipTitle: {
    display: "block",
    fontSize: 15,
    fontWeight: 800,
    color: "#FFFFFF",
  },
  speech: {
    background: "#121212",
    border: "1px solid #1F1F1F",
    borderRadius: "4px 16px 16px 16px",
    padding: "14px 16px",
  },
  speechText: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.45,
    fontWeight: 650,
    color: "#E2E8F0",
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
    marginTop: 4,
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
