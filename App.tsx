import { GoogleGenerativeAI } from "@google/generative-ai";
import React, { useMemo, useState } from "react";

type LessonStep = {
  emoji: string;
  title: string;
  body: string;
};

const LESSON_STEPS: LessonStep[] = [
  {
    emoji: "📦",
    title: "What’s an ETF, actually?",
    body: "An ETF (exchange-traded fund) is a basket of stocks or bonds you can buy like a single share. Instead of picking one company, you get instant diversification — think a playlist, not one song.",
  },
  {
    emoji: "⬛",
    title: "iShares, in plain English",
    body: "iShares ETFs are built and managed by BlackRock. You pick a theme (S&P 500, total US market, bonds), buy the ticker, and own a slice of that whole market. Low fees, trades all day, no stock-picking homework.",
  },
  {
    emoji: "🚀",
    title: "Why this matters at your age",
    body: "Time is your unfair advantage. Parking even $50 a month into a broad iShares ETF can compound for decades. Pay down high-interest debt first, keep your emergency fund growing, then automate investing. That’s the whole game.",
  },
];

const GEMINI_API_KEY = "AQ.Ab8RN6LVBGK2nK4hRt3tLM01jc1i7r3CWL7paFYfl8QdYO4Rjg";
const SOCRATES_PERSONA =
  "You are Socrates, a witty, sharp, and highly encouraging financial mentor for US Gen Z. Keep answers under 3 short sentences. Use concise language with relatable analogies.";
const SOCRATES_MOCK_REPLY =
  "No API key yet, so I'll keep it analog: pay the high-interest debt first, keep stacking that emergency fund, then automate a broad ETF. Add VITE_GEMINI_API_KEY to unlock the live Socrates chat.";

function getGeminiApiKey() {
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (typeof envKey === "string" && envKey.trim()) {
    return envKey.trim();
  }
  if (typeof GEMINI_API_KEY === "string" && GEMINI_API_KEY.trim()) {
    return GEMINI_API_KEY.trim();
  }
  return "";
}

const SNOWBALL_APR = 0.2199;
const SNOWBALL_MIN_PAYMENT = 40;

function amortizeDebt(balance: number, apr: number, monthlyPayment: number) {
  const rate = apr / 12;
  if (monthlyPayment <= balance * rate) {
    return { months: 999, interest: Number.POSITIVE_INFINITY };
  }

  const months = Math.ceil(
    Math.log(monthlyPayment / (monthlyPayment - rate * balance)) / Math.log(1 + rate)
  );
  const interest = Math.max(0, monthlyPayment * months - balance);
  return { months, interest };
}

function money(amount: number) {
  return Math.round(amount).toLocaleString("en-US");
}

const App: React.FC = () => {
  const [emergencyFund, setEmergencyFund] = useState(400);
  const [points, setPoints] = useState(0);
  const [question, setQuestion] = useState("");
  const [socratesOpen, setSocratesOpen] = useState(false);
  const [socratesLoading, setSocratesLoading] = useState(false);
  const [socratesReply, setSocratesReply] = useState("");
  const [socratesError, setSocratesError] = useState("");
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lessonStep, setLessonStep] = useState(0);
  const [lessonDone, setLessonDone] = useState(false);
  const [plusPulse, setPlusPulse] = useState(false);
  const [extraPayment, setExtraPayment] = useState(50);
  const [takeHome, setTakeHome] = useState(2500);

  const emergencyGoal = 1000;
  const remainingDebt = 1250;
  const score = 785;
  const scoreMax = 1000;

  const emergencyPct = Math.min(100, Math.round((emergencyFund / emergencyGoal) * 100));
  const fundComplete = emergencyFund >= emergencyGoal;

  const snowballImpact = useMemo(() => {
    const baseline = amortizeDebt(remainingDebt, SNOWBALL_APR, SNOWBALL_MIN_PAYMENT);
    const boosted = amortizeDebt(
      remainingDebt,
      SNOWBALL_APR,
      SNOWBALL_MIN_PAYMENT + extraPayment
    );
    const interestSaved = Math.max(0, Math.round(baseline.interest - boosted.interest));
    const monthsSaved = Math.max(0, baseline.months - boosted.months);
    return {
      interestSaved,
      monthsSaved,
      payoffMonths: boosted.months,
    };
  }, [remainingDebt, extraPayment]);

  const budgetSplit = useMemo(() => {
    const pay = Math.max(0, takeHome);
    return {
      needs: pay * 0.5,
      wants: pay * 0.3,
      savings: pay * 0.2,
    };
  }, [takeHome]);

  const ring = useMemo(() => {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const progress = score / scoreMax;
    return {
      radius,
      circumference,
      dashOffset: circumference * (1 - progress),
    };
  }, [score, scoreMax]);

  const addEmergency = () => {
    setEmergencyFund((prev: number) => Math.min(emergencyGoal, prev + 50));
    setPlusPulse(true);
    window.setTimeout(() => setPlusPulse(false), 280);
  };

  const askSocrates = async () => {
    const prompt = question.trim();
    if (!prompt || socratesLoading) {
      return;
    }

    setSocratesOpen(true);
    setSocratesLoading(true);
    setSocratesReply("");
    setSocratesError("");

    try {
      const apiKey = getGeminiApiKey();
      const userPrompt = `Enes's snapshot: remaining debt $1,250, emergency fund $${emergencyFund} / $1,000, financial health score 785 / 1000, Debt Snowball Active, 5-day streak.\n\nQuestion: ${prompt}`;

      if (!apiKey) {
        setSocratesReply(SOCRATES_MOCK_REPLY);
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
      const result = await model.generateContent(`${SOCRATES_PERSONA}\n\n${userPrompt}`);
      const text = result.response.text().trim();
      if (!text) {
        throw new Error("Socrates came back blank. Try that question again.");
      }

      setSocratesReply(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something glitched. Try again.";
      setSocratesReply(
        "Couldn't reach Gemini just now, so here's the analog take: crush high-interest debt, keep the emergency fund growing, then automate investing. Try again in a minute."
      );
      setSocratesError(message);
    } finally {
      setSocratesLoading(false);
    }
  };

  const closeSocrates = () => {
    if (socratesLoading) {
      return;
    }
    setSocratesOpen(false);
  };

  const openLesson = () => {
    setLessonStep(0);
    setLessonOpen(true);
  };

  const closeLesson = () => {
    setLessonOpen(false);
  };

  const completeLesson = () => {
    if (!lessonDone) {
      setLessonDone(true);
      setPoints((p: number) => p + 50);
    }
    setLessonOpen(false);
  };

  const onAskKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void askSocrates();
    }
  };

  return (
    <div style={styles.page}>
      <style>{css}</style>

      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.brand}>MATTER</p>
            <h1 style={styles.hello}>Hey, Enes 👋</h1>
            <p style={styles.subhead}>Your money. Your move.</p>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.streak}>🔥 5-Day Streak</div>
            <div style={styles.avatar} aria-label="Enes avatar">
              E
            </div>
          </div>
        </header>

        {points > 0 && (
          <div style={styles.pointsToast}>+{points} pts earned today</div>
        )}

        <section style={styles.scoreCard} aria-label="Financial Health Score">
          <div style={styles.scoreRow}>
            <div style={styles.ringWrap}>
              <svg width="140" height="140" viewBox="0 0 140 140">
                <circle
                  cx="70"
                  cy="70"
                  r={ring.radius}
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="10"
                />
                <circle
                  cx="70"
                  cy="70"
                  r={ring.radius}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={ring.circumference}
                  strokeDashoffset={ring.dashOffset}
                  transform="rotate(-90 70 70)"
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
              </svg>
              <div style={styles.ringLabel}>
                <span style={styles.scoreValue}>785</span>
                <span style={styles.scoreMax}>/ 1000</span>
              </div>
            </div>
            <div style={styles.scoreCopy}>
              <p style={styles.scoreKicker}>Financial Health Score</p>
              <h2 style={styles.scoreTitle}>You’re in a strong lane</h2>
              <p style={styles.scoreBody}>
                Debt plan on. Streak alive. Keep stacking the boring wins.
              </p>
              <span style={styles.snowballTag}>Debt Snowball Active ⛄</span>
            </div>
          </div>
        </section>

        <section style={styles.dualGrid}>
          <article style={styles.statCard}>
            <p style={styles.statLabel}>Remaining Debt</p>
            <p style={styles.statValue}>${remainingDebt.toLocaleString("en-US")}</p>
            <p style={styles.statHint}>Snowball target · smallest first</p>
          </article>

          <article style={styles.statCard}>
            <div style={styles.fundHead}>
              <p style={styles.statLabel}>Emergency Fund</p>
              <button
                type="button"
                onClick={addEmergency}
                disabled={fundComplete}
                aria-label="Add 50 dollars to emergency fund"
                style={{
                  ...styles.plusBtn,
                  opacity: fundComplete ? 0.45 : 1,
                  transform: plusPulse ? "scale(1.08)" : "scale(1)",
                }}
              >
                +
              </button>
            </div>
            <p style={styles.statValue}>
              ${emergencyFund.toLocaleString("en-US")}{" "}
              <span style={styles.statMuted}>/ ${emergencyGoal.toLocaleString("en-US")}</span>
            </p>
            <div style={styles.barTrack}>
              <div style={{ ...styles.barFill, width: `${emergencyPct}%` }} />
            </div>
            <p style={styles.statHint}>
              {fundComplete ? "Starter fund locked in. Huge." : `+ $50 · ${emergencyPct}% to starter goal`}
            </p>
          </article>
        </section>

        <section style={styles.toolsGrid}>
          <article style={styles.toolCard} aria-label="Debt Snowball Simulator">
            <div style={styles.toolHead}>
              <div>
                <p style={styles.statLabel}>Debt Snowball Simulator</p>
                <h3 style={styles.toolTitle}>Extra Monthly Payment</h3>
              </div>
              <span style={styles.snowballTag}>Debt Snowball Active ⛄</span>
            </div>

            <div style={styles.sliderValueRow}>
              <span style={styles.sliderHint}>$25</span>
              <span style={styles.sliderCurrent}>${extraPayment}</span>
              <span style={styles.sliderHint}>$250</span>
            </div>
            <input
              type="range"
              min={25}
              max={250}
              step={5}
              value={extraPayment}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setExtraPayment(Number(e.target.value))
              }
              aria-label="Extra monthly payment"
              className="matter-slider"
              style={styles.slider}
            />

            <div style={styles.impactBox}>
              Saves ${money(snowballImpact.interestSaved)} in interest & cuts{" "}
              {snowballImpact.monthsSaved}{" "}
              {snowballImpact.monthsSaved === 1 ? "month" : "months"} off your debt!
            </div>
            <p style={styles.statHint}>
              Min ${SNOWBALL_MIN_PAYMENT} + extra ${extraPayment} · paid off in{" "}
              {snowballImpact.payoffMonths} months at {(SNOWBALL_APR * 100).toFixed(2)}% APR
            </p>
          </article>

          <article style={styles.toolCard} aria-label="50/30/20 Smart Budget Splitter">
            <p style={styles.statLabel}>50/30/20 Smart Budget Splitter</p>
            <h3 style={styles.toolTitle}>Monthly Take-Home Pay</h3>
            <div style={styles.payRow}>
              <span style={styles.payPrefix}>$</span>
              <input
                style={styles.payInput}
                type="text"
                inputMode="decimal"
                value={takeHome}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, "");
                  const next = Number(raw);
                  setTakeHome(Number.isFinite(next) ? next : 0);
                }}
                aria-label="Monthly take-home pay"
              />
            </div>

            <div style={styles.splitBar} aria-hidden="true">
              <div style={{ ...styles.splitNeeds, flex: 50 }} />
              <div style={{ ...styles.splitWants, flex: 30 }} />
              <div style={{ ...styles.splitSave, flex: 20 }} />
            </div>

            <ul style={styles.splitLegend}>
              <li style={styles.splitItem}>
                <span style={{ ...styles.splitDot, background: "#10B981" }} />
                <span>Needs (50%): ${money(budgetSplit.needs)}</span>
              </li>
              <li style={styles.splitItem}>
                <span style={{ ...styles.splitDot, background: "#6EE7B7" }} />
                <span>Wants (30%): ${money(budgetSplit.wants)}</span>
              </li>
              <li style={styles.splitItem}>
                <span style={{ ...styles.splitDot, background: "#047857" }} />
                <span>Savings / Debt Snowball (20%): ${money(budgetSplit.savings)}</span>
              </li>
            </ul>
          </article>
        </section>

        <section style={styles.askCard}>
          <p style={styles.askLabel}>Socrates AI</p>
          <p style={styles.askHint}>Your Gen Z money mentor — no lecture, just plays.</p>
          <div style={styles.askRow}>
            <input
              style={styles.askInput}
              value={question}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuestion(e.target.value)}
              onKeyDown={onAskKeyDown}
              placeholder="Ask Socrates..."
              aria-label="Ask Socrates"
              disabled={socratesLoading}
            />
            <button
              type="button"
              style={{
                ...styles.sendBtn,
                opacity: socratesLoading || !question.trim() ? 0.55 : 1,
              }}
              onClick={() => void askSocrates()}
              disabled={socratesLoading || !question.trim()}
            >
              {socratesLoading ? "..." : "Send"}
            </button>
          </div>
        </section>

        <button type="button" style={styles.lessonBanner} onClick={openLesson}>
          <span style={styles.lessonBadge}>3-MIN</span>
          <span style={styles.lessonText}>
            3-Min Lesson: ETF Basics with iShares (Powered by BlackRock)
          </span>
          <span style={styles.lessonCta}>{lessonDone ? "Review" : "Start"}</span>
        </button>

        <footer style={styles.footer}>Matter · Built for the US · Stay consistent</footer>
      </div>

      {socratesOpen && (
        <div style={styles.overlay} onClick={closeSocrates} role="presentation">
          <div
            className="matter-slide-up"
            style={styles.sheet}
            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="socrates-title"
          >
            <div style={styles.sheetHandle} />
            <p style={styles.sheetKicker}>Socrates AI</p>
            <h3 id="socrates-title" style={styles.sheetTitle}>
              {socratesLoading
                ? "Socrates is thinking..."
                : socratesError
                  ? "Quick timeout"
                  : "Socrates"}
            </h3>
            <p style={{ ...styles.sheetBody, whiteSpace: "pre-wrap" }}>
              {socratesLoading
                ? "Give it a second — pulling a sharp take from your money mentor."
                : socratesError || socratesReply}
            </p>
            <button
              type="button"
              style={{
                ...styles.primaryBtn,
                opacity: socratesLoading ? 0.55 : 1,
              }}
              onClick={closeSocrates}
              disabled={socratesLoading}
            >
              {socratesLoading ? "Thinking..." : "Got it"}
            </button>
          </div>
        </div>
      )}

      {lessonOpen && (
        <div style={styles.overlay} onClick={closeLesson} role="presentation">
          <div
            className="matter-pop"
            style={styles.modal}
            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lesson-title"
          >
            <p style={styles.sheetKicker}>Micro-learning · Step {lessonStep + 1} of 3</p>
            <h3 id="lesson-title" style={styles.sheetTitle}>
              {LESSON_STEPS[lessonStep].emoji} {LESSON_STEPS[lessonStep].title}
            </h3>
            <p style={styles.sheetBody}>{LESSON_STEPS[lessonStep].body}</p>

            <div style={styles.stepDots}>
              {LESSON_STEPS.map((_, i) => (
                <span
                  key={i}
                  style={{
                    ...styles.dot,
                    background: i === lessonStep ? "#10B981" : "#334155",
                    width: i === lessonStep ? 22 : 8,
                  }}
                />
              ))}
            </div>

            <div style={styles.lessonNav}>
              {lessonStep > 0 ? (
                <button
                  type="button"
                  style={styles.ghostBtn}
                  onClick={() => setLessonStep((s: number) => s - 1)}
                >
                  Back
                </button>
              ) : (
                <button type="button" style={styles.ghostBtn} onClick={closeLesson}>
                  Close
                </button>
              )}

              {lessonStep < LESSON_STEPS.length - 1 ? (
                <button
                  type="button"
                  style={styles.primaryBtn}
                  onClick={() => setLessonStep((s: number) => s + 1)}
                >
                  Next
                </button>
              ) : (
                <button type="button" style={styles.primaryBtn} onClick={completeLesson}>
                  {lessonDone ? "Lesson complete" : "Complete Lesson (+50 Pts)"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    margin: 0,
    background: "#0F172A",
    color: "#F8FAFC",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    padding: "24px 16px 48px",
    boxSizing: "border-box",
  },
  shell: {
    maxWidth: 480,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  brand: {
    margin: 0,
    letterSpacing: "0.22em",
    fontSize: 11,
    fontWeight: 700,
    color: "#10B981",
  },
  hello: {
    margin: "4px 0 0",
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  subhead: {
    margin: "4px 0 0",
    color: "#94A3B8",
    fontSize: 14,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  streak: {
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    color: "#6EE7B7",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #10B981, #059669)",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 18,
    color: "#042F2E",
    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.25)",
  },
  pointsToast: {
    background: "#064E3B",
    color: "#A7F3D0",
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
  },
  scoreCard: {
    background: "linear-gradient(180deg, #1E293B 0%, #162032 100%)",
    border: "1px solid #334155",
    borderRadius: 20,
    padding: 20,
    boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
  },
  scoreRow: {
    display: "flex",
    gap: 16,
    alignItems: "center",
  },
  ringWrap: {
    position: "relative",
    width: 140,
    height: 140,
    flexShrink: 0,
  },
  ringLabel: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1,
    color: "#F8FAFC",
  },
  scoreMax: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
  },
  scoreCopy: {
    flex: 1,
  },
  scoreKicker: {
    margin: 0,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  scoreTitle: {
    margin: "6px 0 8px",
    fontSize: 20,
    fontWeight: 800,
  },
  scoreBody: {
    margin: "0 0 12px",
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 1.45,
  },
  snowballTag: {
    display: "inline-block",
    background: "rgba(16, 185, 129, 0.14)",
    color: "#6EE7B7",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
  },
  dualGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  toolsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  toolCard: {
    background: "#1E293B",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 16,
  },
  toolHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  toolTitle: {
    margin: "6px 0 0",
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  sliderValueRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  sliderHint: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: 600,
  },
  sliderCurrent: {
    fontSize: 22,
    fontWeight: 800,
    color: "#10B981",
    letterSpacing: "-0.03em",
  },
  slider: {
    width: "100%",
    margin: "10px 0 12px",
    accentColor: "#10B981",
    cursor: "pointer",
  },
  impactBox: {
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    color: "#A7F3D0",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.45,
  },
  payRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "10px 0 14px",
    background: "#0F172A",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "0 12px",
  },
  payPrefix: {
    color: "#10B981",
    fontWeight: 800,
    fontSize: 18,
  },
  payInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: 800,
    padding: "12px 0",
    outline: "none",
  },
  splitBar: {
    display: "flex",
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
    background: "#0F172A",
    marginBottom: 14,
  },
  splitNeeds: {
    background: "#10B981",
  },
  splitWants: {
    background: "#6EE7B7",
  },
  splitSave: {
    background: "#047857",
  },
  splitLegend: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  splitItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#E2E8F0",
    fontWeight: 600,
  },
  splitDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  statCard: {
    background: "#1E293B",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 16,
    minHeight: 148,
  },
  fundHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  statLabel: {
    margin: 0,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: 600,
  },
  statValue: {
    margin: "10px 0 8px",
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  statMuted: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: 600,
  },
  statHint: {
    margin: "8px 0 0",
    fontSize: 11,
    color: "#94A3B8",
    lineHeight: 1.4,
  },
  plusBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "none",
    background: "#10B981",
    color: "#042F2E",
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1,
    cursor: "pointer",
    transition: "transform 0.15s ease",
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    background: "#0F172A",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    background: "#10B981",
    borderRadius: 999,
    transition: "width 0.25s ease",
  },
  askCard: {
    background: "#1E293B",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 16,
  },
  askLabel: {
    margin: 0,
    fontWeight: 800,
    fontSize: 16,
  },
  askHint: {
    margin: "4px 0 12px",
    color: "#94A3B8",
    fontSize: 13,
  },
  askRow: {
    display: "flex",
    gap: 8,
  },
  askInput: {
    flex: 1,
    background: "#0F172A",
    border: "1px solid #334155",
    color: "#F8FAFC",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
  },
  sendBtn: {
    background: "#10B981",
    color: "#042F2E",
    border: "none",
    borderRadius: 12,
    padding: "0 16px",
    fontWeight: 800,
    cursor: "pointer",
  },
  lessonBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    background: "linear-gradient(90deg, rgba(16,185,129,0.16), #1E293B)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    borderRadius: 16,
    padding: 14,
    color: "#F8FAFC",
    cursor: "pointer",
  },
  lessonBadge: {
    background: "#10B981",
    color: "#042F2E",
    fontSize: 10,
    fontWeight: 800,
    borderRadius: 8,
    padding: "4px 6px",
    flexShrink: 0,
  },
  lessonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: 650,
    lineHeight: 1.35,
  },
  lessonCta: {
    color: "#6EE7B7",
    fontWeight: 800,
    fontSize: 13,
    flexShrink: 0,
  },
  footer: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 12,
    marginTop: 8,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(2, 6, 23, 0.72)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 40,
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    background: "#1E293B",
    border: "1px solid #334155",
    borderRadius: "24px 24px 16px 16px",
    padding: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 480,
    background: "#1E293B",
    border: "1px solid #334155",
    borderRadius: 20,
    padding: 20,
    margin: "auto",
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    background: "#475569",
    margin: "0 auto 14px",
  },
  sheetKicker: {
    margin: 0,
    color: "#10B981",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  sheetTitle: {
    margin: "8px 0 10px",
    fontSize: 22,
    fontWeight: 800,
  },
  sheetBody: {
    margin: 0,
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 1.55,
  },
  tipBox: {
    marginTop: 14,
    background: "#0F172A",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: "#E2E8F0",
    lineHeight: 1.45,
  },
  primaryBtn: {
    width: "100%",
    marginTop: 16,
    background: "#10B981",
    color: "#042F2E",
    border: "none",
    borderRadius: 12,
    padding: "12px 16px",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
  },
  ghostBtn: {
    flex: 1,
    marginTop: 16,
    background: "transparent",
    color: "#CBD5E1",
    border: "1px solid #475569",
    borderRadius: 12,
    padding: "12px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  lessonNav: {
    display: "flex",
    gap: 8,
  },
  stepDots: {
    display: "flex",
    gap: 6,
    marginTop: 18,
    alignItems: "center",
  },
  dot: {
    height: 8,
    borderRadius: 999,
    display: "inline-block",
    transition: "all 0.2s ease",
  },
};

const css = `
  @keyframes matterSlideUp {
    from { transform: translateY(28px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes matterPop {
    from { transform: translateY(12px) scale(0.98); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
  }
  .matter-slide-up { animation: matterSlideUp 0.28s ease-out; }
  .matter-pop { animation: matterPop 0.24s ease-out; }
  input::placeholder { color: #64748B; }
  button:disabled { cursor: default; }
  .matter-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 999px;
    background: #0F172A;
    outline: none;
  }
  .matter-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #10B981;
    border: 2px solid #042F2E;
    cursor: pointer;
    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2);
  }
  .matter-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #10B981;
    border: 2px solid #042F2E;
    cursor: pointer;
  }
`;

export default App;
