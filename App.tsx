import { GoogleGenerativeAI } from "@google/generative-ai";
import React, { useEffect, useMemo, useRef, useState } from "react";
import DebtSnowballManager, { type Debt } from "./src/components/DebtSnowballManager";
import HealthScoreBadge from "./src/components/HealthScoreBadge";
import InvestmentPortfolioCard, { type Holding } from "./src/components/InvestmentPortfolioCard";
import LessonsPhase1 from "./src/components/LessonsPhase1";
import SocratesPortfolioReport from "./src/components/SocratesPortfolioReport";

type TabId = "dashboard" | "snowball" | "lessons" | "socrates";

type ChatSender = "user" | "socrates";

type ChatMessage = {
  id: string;
  sender: ChatSender;
  text: string;
  timestamp: number;
};

function createChatMessage(sender: ChatSender, text: string): ChatMessage {
  return {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sender,
    text,
    timestamp: Date.now(),
  };
}

const TABS: Array<{ id: TabId; emoji: string; label: string }> = [
  { id: "dashboard", emoji: "📊", label: "Investment" },
  { id: "snowball", emoji: "❄️", label: "Debt" },
  { id: "lessons", emoji: "🎓", label: "Lessons" },
  { id: "socrates", emoji: "🏛️", label: "Socrates AI" },
];

const GEMINI_API_KEY = "AQ.Ab8RN6LVBGK2nK4hRt3tLM01jc1i7r3CWL7paFYfl8QdYO4Rjg";
const USER_NAME = "Enes";
const SOCRATES_PERSONA =
  "You are Socrates, a warm, sharp, and encouraging personal finance and investment mentor for people of any age or background. Keep answers under 4 short sentences, use clear everyday language with relatable analogies, and sound like a supportive guide having a real conversation — never a lecture.";
const SOCRATES_MOCK_REPLY =
  "No API key yet, so I'll keep it analog: pay the high-interest debt first, keep stacking that emergency fund, then automate a broad ETF. Add VITE_GEMINI_API_KEY to unlock the live Socrates chat.";

const GREETING_WORDS = ["hi", "hello", "hey", "yo", "hiya", "howdy", "selam", "merhaba", "hola", "sup"];

/** True for short, plain greetings ("Hi", "Hey there", "Selam") — not real questions. */
function isSimpleGreeting(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[!?.,]+$/g, "");
  if (!normalized) return false;
  const words = normalized.split(/\s+/);
  if (words.length > 3) return false;
  return GREETING_WORDS.includes(words[0]);
}

const GREETING_REPLIES = [
  `Hi, ${USER_NAME}! How are you doing? What are we talking about today?`,
  `Hey ${USER_NAME}! Good to see you — what's on your mind today?`,
  `Hello, ${USER_NAME}! How's everything going? What would you like to dig into?`,
];

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

function money(amount: number) {
  return Math.round(amount).toLocaleString("en-US");
}

const App: React.FC = () => {
  const [emergencyFund, setEmergencyFund] = useState(400);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [socratesLoading, setSocratesLoading] = useState(false);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const [plusPulse, setPlusPulse] = useState(false);
  const [takeHome, setTakeHome] = useState(2500);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  // Live mirrors of child-owned state, kept in sync via callback props so Socrates AI
  // can reference the user's real portfolio and debt data.
  const [debts, setDebts] = useState<Debt[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);

  const emergencyGoal = 1000;
  const score = 785;
  const scoreMax = 1000;

  const emergencyPct = Math.min(100, Math.round((emergencyFund / emergencyGoal) * 100));
  const fundComplete = emergencyFund >= emergencyGoal;

  const budgetSplit = useMemo(() => {
    const pay = Math.max(0, takeHome);
    return {
      needs: pay * 0.5,
      wants: pay * 0.3,
      savings: pay * 0.2,
    };
  }, [takeHome]);

  // Live portfolio context — real holdings, so Socrates can answer "which stocks do I own?" accurately.
  const portfolioContext = useMemo(() => {
    if (holdings.length === 0) return "No investments or connected accounts yet.";
    const totalValue = holdings.reduce(
      (sum, h) => sum + (h.kind === "stock" ? h.quantity * h.currentPrice : h.balance),
      0
    );
    const lines = holdings.map((h) =>
      h.kind === "stock"
        ? `${h.symbol} (${h.description}): ${h.quantity} shares @ $${h.currentPrice.toFixed(2)} = $${money(
            h.quantity * h.currentPrice
          )} (today ${h.dayChangePct >= 0 ? "+" : ""}${h.dayChangePct.toFixed(2)}%)`
        : `${h.name} (connected account balance): $${money(h.balance)}`
    );
    return `Total portfolio value: $${money(totalValue)}. Holdings:\n- ${lines.join("\n- ")}`;
  }, [holdings]);

  // Live debt context — real debts, so Socrates can answer "how's my debt payoff going?" accurately.
  const debtContext = useMemo(() => {
    if (debts.length === 0) return "No active debts — currently debt-free.";
    const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
    const lines = debts.map(
      (d) => `${d.title}: $${money(d.balance)} remaining of $${money(d.originalBalance)}, ${d.apr}% APR, $${money(d.minPayment)}/mo minimum`
    );
    return `Total remaining debt: $${money(totalDebt)} across ${debts.length} debt(s):\n- ${lines.join("\n- ")}`;
  }, [debts]);

  useEffect(() => {
    const log = chatLogRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages, socratesLoading, activeTab]);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;

      // Ignore tiny jitters so the bar doesn't flicker on minor scroll noise.
      if (Math.abs(delta) < 6) {
        return;
      }

      if (delta > 0 && currentY > 80) {
        setNavVisible(false); // scrolling down -> hide
      } else {
        setNavVisible(true); // scrolling up (or near top) -> show
      }

      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

    const userMessage = createChatMessage("user", prompt);
    const thread = [...messages, userMessage];
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setSocratesLoading(true);

    // Simple greetings get a warm, direct reply instead of a full model round-trip —
    // keeps the very first hello feeling natural rather than clinical.
    if (isSimpleGreeting(prompt)) {
      const reply = GREETING_REPLIES[Math.floor(Math.random() * GREETING_REPLIES.length)];
      window.setTimeout(() => {
        setMessages((prev) => [...prev, createChatMessage("socrates", reply)]);
        setSocratesLoading(false);
      }, 450);
      return;
    }

    try {
      const apiKey = getGeminiApiKey();
      const history = thread
        .slice(-12)
        .map((msg) => `${msg.sender === "user" ? "User" : "Socrates"}: ${msg.text}`)
        .join("\n");
      const userPrompt = `${USER_NAME}'s live snapshot:\n- Emergency fund: $${emergencyFund} / $1,000\n- Financial health score: ${score} / ${scoreMax}\n- Debt: ${debtContext}\n- Investment portfolio: ${portfolioContext}\n\nConversation:\n${history}\n\nReply to the latest user message. If ${USER_NAME} asks about their investments, debts, or portfolio balance, answer using the real snapshot data above.`;

      if (!apiKey) {
        setMessages((prev) => [...prev, createChatMessage("socrates", SOCRATES_MOCK_REPLY)]);
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
      const result = await model.generateContent(`${SOCRATES_PERSONA}\n\n${userPrompt}`);
      const text = result.response.text().trim();
      if (!text) {
        throw new Error("Socrates came back blank. Try that question again.");
      }

      setMessages((prev) => [...prev, createChatMessage("socrates", text)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something glitched. Try again.";
      setMessages((prev) => [
        ...prev,
        createChatMessage(
          "socrates",
          `Couldn't reach Gemini just now: ${message} Crush high-interest debt, keep the emergency fund growing, then automate investing — and try again in a minute.`
        ),
      ]);
    } finally {
      setSocratesLoading(false);
    }
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
        {activeTab !== "socrates" && (
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
        )}

        {activeTab === "dashboard" && (
          <div className="matter-tab-panel" style={styles.tabPanel}>
            <HealthScoreBadge score={score} scoreMax={scoreMax} />

            <SocratesPortfolioReport onConsultSocrates={() => setActiveTab("socrates")} />

            <InvestmentPortfolioCard onHoldingsChange={setHoldings} />

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
          </div>
        )}

        {activeTab === "snowball" && (
          <div className="matter-tab-panel" style={styles.tabPanel}>
            <DebtSnowballManager onOpenLessons={() => setActiveTab("lessons")} onDebtsChange={setDebts} />
          </div>
        )}

        {activeTab === "lessons" && (
          <div className="matter-tab-panel" style={styles.tabPanel}>
            <LessonsPhase1 />
          </div>
        )}

        {activeTab === "socrates" && (
          <div className="matter-tab-panel" style={styles.chatWindow}>
            <div style={styles.chatHeader}>
              <div style={styles.socratesAvatar} aria-hidden="true">
                🏛️
              </div>
              <div>
                <p style={styles.askLabel}>Socrates AI</p>
                <p style={styles.askHint}>Your Personal Finance & Investment Guide</p>
              </div>
            </div>

            <div ref={chatLogRef} style={styles.chatLog} aria-live="polite">
              {messages.length === 0 && !socratesLoading && (
                <p style={styles.chatEmpty}>Ask anything about debt, budget, or investing. The thread stays here.</p>
              )}
              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                return (
                  <div
                    key={msg.id}
                    style={{
                      ...styles.chatRow,
                      justifyContent: isUser ? "flex-end" : "flex-start",
                    }}
                  >
                    {!isUser && (
                      <div style={styles.socratesAvatarSm} aria-hidden="true">
                        🏛️
                      </div>
                    )}
                    <div style={isUser ? styles.bubbleUser : styles.bubbleSocrates}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              {socratesLoading && (
                <div style={{ ...styles.chatRow, justifyContent: "flex-start" }}>
                  <div style={styles.socratesAvatarSm} aria-hidden="true">
                    🏛️
                  </div>
                  <div style={styles.thinkingBubble}>Socrates is thinking...</div>
                </div>
              )}
            </div>

            <div style={styles.chatComposer}>
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
          </div>
        )}

        {activeTab !== "socrates" && (
        <footer style={styles.footer}>Matter · Built for the US · Stay consistent</footer>
        )}
      </div>

      <nav
        style={styles.tabBar}
        aria-label="Primary"
        className={`-translate-x-1/2 transition-transform duration-300 ease-in-out ${
          navVisible ? "translate-y-0" : "translate-y-[calc(100%+32px)]"
        }`}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={active ? "page" : undefined}
              style={{
                ...styles.tabBtn,
                ...(active ? styles.tabBtnActive : {}),
              }}
            >
              <span style={styles.tabEmoji}>{tab.emoji}</span>
              <span style={styles.tabLabel}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    margin: 0,
    background: "#000000",
    color: "#F8FAFC",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    padding: "24px 16px 132px",
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
  toolsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  toolCard: {
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
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
    background: "#121212",
    border: "1px solid #1F1F1F",
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
    background: "#121212",
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
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    padding: 16,
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
    background: "#121212",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    background: "#10B981",
    borderRadius: 999,
    transition: "width 0.25s ease",
  },
  askCard: {
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    padding: 16,
  },
  askLabel: {
    margin: 0,
    fontWeight: 800,
    fontSize: 16,
  },
  askHint: {
    margin: "4px 0 0",
    color: "#94A3B8",
    fontSize: 13,
  },
  askRow: {
    display: "flex",
    gap: 8,
  },
  askInput: {
    flex: 1,
    background: "#121212",
    border: "1px solid #1F1F1F",
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
  footer: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 12,
    marginTop: 8,
  },
  tabPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  chatWindow: {
    display: "flex",
    flexDirection: "column",
    minHeight: "calc(100vh - 148px)",
    background: "linear-gradient(180deg, #0A0A0A 0%, #000000 100%)",
    border: "1px solid #1F1F1F",
    borderRadius: 20,
    overflow: "hidden",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(16, 185, 129, 0.22)",
    background: "rgba(0, 0, 0, 0.72)",
  },
  chatLog: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 12px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 280,
  },
  chatEmpty: {
    margin: "auto",
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 1.5,
    maxWidth: 280,
  },
  chatRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
  },
  bubbleUser: {
    maxWidth: "78%",
    background: "linear-gradient(180deg, #1C1917 0%, #0C0A09 100%)",
    border: "1px solid #44403C",
    color: "#F5F5F4",
    borderRadius: "16px 16px 4px 16px",
    padding: "10px 12px",
    fontSize: 14,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    boxShadow: "0 8px 20px rgba(0,0,0,0.28)",
  },
  bubbleSocrates: {
    maxWidth: "78%",
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.38)",
    color: "#ECFDF5",
    borderRadius: "16px 16px 16px 4px",
    padding: "10px 12px",
    fontSize: 14,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
  },
  thinkingBubble: {
    background: "rgba(16, 185, 129, 0.08)",
    border: "1px dashed rgba(16, 185, 129, 0.4)",
    color: "#6EE7B7",
    borderRadius: "16px 16px 16px 4px",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 650,
    fontStyle: "italic",
  },
  socratesAvatar: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #10B981, #064E3B)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontSize: 18,
    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.22)",
  },
  socratesAvatarSm: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #10B981, #064E3B)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontSize: 13,
  },
  chatComposer: {
    display: "flex",
    gap: 8,
    padding: 12,
    borderTop: "1px solid #1F1F1F",
    background: "rgba(0, 0, 0, 0.85)",
  },
  tabBar: {
    position: "fixed",
    left: "50%",
    bottom: 16,
    width: "calc(100% - 24px)",
    maxWidth: 480,
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 4,
    padding: 8,
    borderRadius: 22,
    background: "rgba(0, 0, 0, 0.6)",
    border: "1px solid rgba(16, 185, 129, 0.28)",
    boxShadow: "0 18px 40px rgba(2, 6, 23, 0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    zIndex: 30,
  } as React.CSSProperties,
  tabBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 58,
    border: "none",
    background: "transparent",
    color: "#94A3B8",
    borderRadius: 16,
    cursor: "pointer",
    padding: "8px 4px",
    transition: "background 0.22s ease, color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease",
  },
  tabBtnActive: {
    background: "rgba(16, 185, 129, 0.16)",
    color: "#6EE7B7",
    boxShadow: "inset 0 0 0 1px rgba(16, 185, 129, 0.45), 0 8px 18px rgba(16, 185, 129, 0.12)",
    transform: "translateY(-1px)",
  },
  tabEmoji: {
    fontSize: 16,
    lineHeight: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    textAlign: "center",
    lineHeight: 1.2,
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
  .matter-tab-panel { animation: matterPop 0.22s ease-out; }
  .matter-slide-up { animation: matterSlideUp 0.28s ease-out; }
  .matter-pop { animation: matterPop 0.24s ease-out; }
  input::placeholder { color: #64748B; }
  button:disabled { cursor: default; }
  .matter-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 999px;
    background: #121212;
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
