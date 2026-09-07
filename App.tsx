import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  Bell,
  Check,
  CircleDollarSign,
  CreditCard,
  Home,
  Landmark,
  Plus,
  Receipt,
  Repeat,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { type Debt } from "./src/components/DebtSnowballManager";
import AuthScreen from "./src/components/AuthScreen";
import HealthScoreBadge from "./src/components/HealthScoreBadge";
import InvestmentPortfolioCard, { type Holding } from "./src/components/InvestmentPortfolioCard";
import LessonsPhase1 from "./src/components/LessonsPhase1";
import ProfileScreen from "./src/components/ProfileScreen";
import {
  clearSession,
  fetchMe,
  getStoredUser,
  getToken,
  saveSession,
  type AuthUser,
} from "./src/lib/auth";

type TabId = "dashboard" | "snowball" | "lessons" | "socrates" | "profile";

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
  { id: "dashboard", emoji: "📊", label: "Investments" },
  { id: "snowball", emoji: "💸", label: "Cash Flow &\nDebt" },
  { id: "lessons", emoji: "🎓", label: "Lessons" },
  { id: "socrates", emoji: "🏛️", label: "Matter AI" },
  { id: "profile", emoji: "👤", label: "Profile" },
];

const GEMINI_API_KEY = "AQ.Ab8RN6LVBGK2nK4hRt3tLM01jc1i7r3CWL7paFYfl8QdYO4Rjg";
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

function greetingReplies(userName: string) {
  return [
    `Hi, ${userName}! How are you doing? What are we talking about today?`,
    `Hey ${userName}! Good to see you — what's on your mind today?`,
    `Hello, ${userName}! How's everything going? What would you like to dig into?`,
  ];
}

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

/** Months of spending the emergency fund should eventually cover. */
const EMERGENCY_MONTHS = 3;
const MAX_PAYOFF_MONTHS = 600;

/** Money in is emerald, money out is crimson — used everywhere in the cash flow module. */
const INCOME_GREEN = "#10B981";
const EXPENSE_RED = "#F43F5E";

const SURPLUS_TONE = {
  value: "#10B981",
  text: "#6EE7B7",
  bg: "rgba(16, 185, 129, 0.10)",
  border: "rgba(16, 185, 129, 0.35)",
};
const DEFICIT_TONE = {
  value: "#F43F5E",
  text: "#FDA4AF",
  bg: "rgba(244, 63, 94, 0.10)",
  border: "rgba(244, 63, 94, 0.35)",
};

const SEED_DEBTS: Debt[] = [
  {
    id: "debt-credit-card",
    title: "Credit Card Balance",
    originalBalance: 2400,
    balance: 1680,
    minPayment: 65,
    apr: 22.99,
  },
  {
    id: "debt-personal-loan",
    title: "Personal Loan",
    originalBalance: 6000,
    balance: 4200,
    minPayment: 145,
    apr: 9.5,
  },
];

type DebtFormState = { title: string; balance: string; minPayment: string; apr: string };
const EMPTY_DEBT_FORM: DebtFormState = { title: "", balance: "", minPayment: "", apr: "" };

/** One editable line in the monthly spending breakdown. */
type ExpenseItem = { id: string; label: string; amount: number };

const SEED_EXPENSES: ExpenseItem[] = [
  { id: "expense-rent", label: "Rent", amount: 950 },
  { id: "expense-groceries", label: "Groceries", amount: 420 },
  { id: "expense-utilities", label: "Utilities", amount: 180 },
  { id: "expense-subscriptions", label: "Subscriptions", amount: 90 },
];

type ExpenseFormState = { label: string; amount: string };
const EMPTY_EXPENSE_FORM: ExpenseFormState = { label: "", amount: "" };

/** Icon guessed from the category name so user-added rows get a fitting glyph too. */
function expenseIcon(label: string) {
  if (/rent|housing|mortgage|home|apartment/i.test(label)) return <Home size={15} />;
  if (/food|grocer|dining|eat|meal/i.test(label)) return <ShoppingCart size={15} />;
  if (/util|electric|water|internet|phone|heat/i.test(label)) return <Zap size={15} />;
  if (/debt|loan|credit|card|payment/i.test(label)) return <CreditCard size={15} />;
  if (/sub|stream|member|plan/i.test(label)) return <Repeat size={15} />;
  return <Receipt size={15} />;
}

let expenseIdSeed = 0;
function nextExpenseId() {
  expenseIdSeed += 1;
  return `expense-${Date.now()}-${expenseIdSeed}`;
}

/** Closed-form payoff length for one debt paid at a fixed monthly amount. */
function monthsToPayoff(balance: number, apr: number, payment: number) {
  if (balance <= 0) return 0;
  if (payment <= 0) return MAX_PAYOFF_MONTHS;
  const rate = apr / 100 / 12;
  if (rate === 0) return Math.ceil(balance / payment);
  // Payment never outpaces the interest — the balance would never clear.
  if (payment <= balance * rate) return MAX_PAYOFF_MONTHS;
  return Math.min(
    MAX_PAYOFF_MONTHS,
    Math.ceil(Math.log(payment / (payment - rate * balance)) / Math.log(1 + rate))
  );
}

function formatMonths(totalMonths: number) {
  if (totalMonths <= 0) return "Paid off";
  if (totalMonths >= MAX_PAYOFF_MONTHS) return "Never at this rate";
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} mo`;
  if (months === 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
}

/** APR badge colouring so expensive debt reads as urgent at a glance. */
function aprTone(apr: number) {
  if (apr >= 18) {
    return { color: "#FDA4AF", bg: "rgba(244, 63, 94, 0.12)", border: "rgba(244, 63, 94, 0.35)" };
  }
  if (apr >= 8) {
    return { color: "#FCD34D", bg: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.32)" };
  }
  return { color: "#6EE7B7", bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.32)" };
}

function debtIcon(title: string) {
  if (/card|visa|master|amex|credit/i.test(title)) return <CreditCard size={15} />;
  if (/loan|auto|car|student|mortgage/i.test(title)) return <Landmark size={15} />;
  return <Wallet size={15} />;
}

let debtIdSeed = 0;
function nextDebtId() {
  debtIdSeed += 1;
  return `debt-${Date.now()}-${debtIdSeed}`;
}

const App: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getStoredUser());
  const [authChecking, setAuthChecking] = useState(() => Boolean(getToken()));
  const [emergencyFund, setEmergencyFund] = useState(400);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [socratesLoading, setSocratesLoading] = useState(false);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const [plusPulse, setPlusPulse] = useState(false);
  const [monthlyIncome, setMonthlyIncome] = useState(2500);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  // Cash Flow & Debt Management module state.
  const [expenses, setExpenses] = useState<ExpenseItem[]>(SEED_EXPENSES);
  const [spendingModalOpen, setSpendingModalOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(EMPTY_EXPENSE_FORM);
  const [expenseFormError, setExpenseFormError] = useState("");
  const [extraPayoff, setExtraPayoff] = useState(100);
  const [debts, setDebts] = useState<Debt[]>(SEED_DEBTS);
  const [debtFormOpen, setDebtFormOpen] = useState(false);
  const [debtForm, setDebtForm] = useState<DebtFormState>(EMPTY_DEBT_FORM);
  const [debtFormError, setDebtFormError] = useState("");

  // Live mirror of child-owned portfolio state, kept in sync via a callback prop so
  // Socrates AI can reference the user's real holdings.
  const [holdings, setHoldings] = useState<Holding[]>([]);

  const userName = authUser?.name?.trim() || "Investor";

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthChecking(false);
      setAuthUser(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const user = await fetchMe();
        if (cancelled) return;
        saveSession(token, user);
        setAuthUser(user);
      } catch {
        if (cancelled) return;
        clearSession();
        setAuthUser(null);
        setHoldings([]);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = (user: AuthUser) => {
    setAuthUser(user);
    setActiveTab("dashboard");
  };

  const handleLogout = () => {
    clearSession();
    setAuthUser(null);
    setHoldings([]);
    setMessages([]);
    setActiveTab("dashboard");
  };

  const emergencyGoal = 1000;
  const score = 785;
  const scoreMax = 1000;

  const emergencyPct = Math.min(100, Math.round((emergencyFund / emergencyGoal) * 100));
  const fundComplete = emergencyFund >= emergencyGoal;

  const budgetSplit = useMemo(() => {
    const pay = Math.max(0, monthlyIncome);
    return {
      needs: pay * 0.5,
      wants: pay * 0.3,
      savings: pay * 0.2,
    };
  }, [monthlyIncome]);

  // Total spendings is always the sum of the itemized categories, so every keystroke
  // in the breakdown flows straight through to net cash flow.
  const monthlyExpenses = useMemo(
    () => expenses.reduce((sum, item) => sum + item.amount, 0),
    [expenses]
  );

  const netCashFlow = monthlyIncome - monthlyExpenses;
  const isSurplus = netCashFlow >= 0;
  const flowTone = isSurplus ? SURPLUS_TONE : DEFICIT_TONE;
  const spendRatio = monthlyIncome > 0 ? Math.min(100, (monthlyExpenses / monthlyIncome) * 100) : 0;

  const emergencyTarget = monthlyExpenses * EMERGENCY_MONTHS;
  const emergencyTargetPct =
    emergencyTarget > 0 ? Math.min(100, Math.round((emergencyFund / emergencyTarget) * 100)) : 0;
  const monthsCovered = monthlyExpenses > 0 ? emergencyFund / monthlyExpenses : 0;

  const totalDebt = useMemo(() => debts.reduce((sum, d) => sum + d.balance, 0), [debts]);
  const totalMinPayment = useMemo(
    () => debts.reduce((sum, d) => (d.balance > 0 ? sum + d.minPayment : sum), 0),
    [debts]
  );
  const monthlyInterest = useMemo(
    () => debts.reduce((sum, d) => sum + (d.balance * d.apr) / 100 / 12, 0),
    [debts]
  );

  // Snowball focus: every extra dollar lands on the smallest remaining balance.
  const focusDebt = useMemo(
    () =>
      debts
        .filter((d) => d.balance > 0)
        .sort((a, b) => a.balance - b.balance || b.apr - a.apr)[0] ?? null,
    [debts]
  );

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
    const lines = debts.map(
      (d) => `${d.title}: $${money(d.balance)} remaining of $${money(d.originalBalance)}, ${d.apr}% APR, $${money(d.minPayment)}/mo minimum`
    );
    return `Total remaining debt: $${money(totalDebt)} across ${debts.length} debt(s):\n- ${lines.join("\n- ")}`;
  }, [debts, totalDebt]);

  // Live cash-flow context from the Cash Flow & Debt Management module.
  const cashFlowContext = useMemo(() => {
    const breakdown =
      expenses.length === 0
        ? "No spending categories tracked yet."
        : `Spending breakdown: ${expenses
            .map((item) => `${item.label} $${money(item.amount)}/mo`)
            .join(", ")}.`;
    return `Monthly income $${money(monthlyIncome)}, total monthly spending $${money(
      monthlyExpenses
    )}, net cash flow ${isSurplus ? "+" : "-"}$${money(Math.abs(netCashFlow))} (${
      isSurplus ? "surplus" : "deficit"
    }). ${breakdown}`;
  }, [expenses, monthlyIncome, monthlyExpenses, isSurplus, netCashFlow]);

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

  const contributeEmergency = (amount: number, cap: number) => {
    setEmergencyFund((prev: number) => Math.max(prev, Math.min(cap, prev + amount)));
  };

  const addEmergency = () => {
    contributeEmergency(50, emergencyGoal);
    setPlusPulse(true);
    window.setTimeout(() => setPlusPulse(false), 280);
  };

  const setExpenseAmount = (id: string, amount: number) => {
    setExpenses((prev) => prev.map((item) => (item.id === id ? { ...item, amount } : item)));
  };

  const removeExpense = (id: string) => {
    setExpenses((prev) => prev.filter((item) => item.id !== id));
  };

  const openSpendingModal = () => {
    setSpendingModalOpen(true);
  };

  const closeSpendingModal = () => {
    setSpendingModalOpen(false);
    setExpenseFormOpen(false);
    setExpenseForm(EMPTY_EXPENSE_FORM);
    setExpenseFormError("");
  };

  const openExpenseForm = () => {
    setExpenseForm(EMPTY_EXPENSE_FORM);
    setExpenseFormError("");
    setExpenseFormOpen(true);
  };

  const submitExpense = (event: React.FormEvent) => {
    event.preventDefault();
    const label = expenseForm.label.trim();
    const amount = expenseForm.amount.trim() === "" ? 0 : Number(expenseForm.amount);

    if (!label) {
      setExpenseFormError("Give the category a name.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setExpenseFormError("Enter a monthly amount of $0 or more.");
      return;
    }

    setExpenses((prev) => [...prev, { id: nextExpenseId(), label, amount }]);
    setExpenseFormOpen(false);
    setExpenseForm(EMPTY_EXPENSE_FORM);
    setExpenseFormError("");
  };

  const logDebtPayment = (id: string) => {
    setDebts((prev) =>
      prev.map((debt) => {
        if (debt.id !== id) return debt;
        const boost = debt.id === focusDebt?.id ? extraPayoff : 0;
        return { ...debt, balance: Math.max(0, debt.balance - debt.minPayment - boost) };
      })
    );
  };

  const removeDebt = (id: string) => {
    setDebts((prev) => prev.filter((debt) => debt.id !== id));
  };

  const openDebtForm = () => {
    setDebtForm(EMPTY_DEBT_FORM);
    setDebtFormError("");
    setDebtFormOpen(true);
  };

  const submitDebt = (event: React.FormEvent) => {
    event.preventDefault();
    const balance = Number(debtForm.balance);
    const minPayment = Number(debtForm.minPayment);
    const apr = debtForm.apr.trim() === "" ? 0 : Number(debtForm.apr);

    if (!Number.isFinite(balance) || balance <= 0) {
      setDebtFormError("Enter a balance greater than $0.");
      return;
    }
    if (!Number.isFinite(minPayment) || minPayment <= 0) {
      setDebtFormError("Enter a minimum monthly payment greater than $0.");
      return;
    }
    if (!Number.isFinite(apr) || apr < 0) {
      setDebtFormError("Enter a valid interest rate, or leave it blank.");
      return;
    }

    setDebts((prev) => [
      ...prev,
      {
        id: nextDebtId(),
        title: debtForm.title.trim() || "Untitled Debt",
        originalBalance: balance,
        balance,
        minPayment,
        apr,
      },
    ]);
    setDebtFormOpen(false);
    setDebtForm(EMPTY_DEBT_FORM);
    setDebtFormError("");
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
      const replies = greetingReplies(userName);
      const reply = replies[Math.floor(Math.random() * replies.length)];
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
      const userPrompt = `${userName}'s live snapshot:\n- Emergency fund: $${money(emergencyFund)} (starter goal $${money(
        emergencyGoal
      )}; full ${EMERGENCY_MONTHS}-month goal $${money(emergencyTarget)})\n- Financial health score: ${score} / ${scoreMax}\n- Cash flow: ${cashFlowContext}\n- Debt: ${debtContext}\n- Investment portfolio: ${portfolioContext}\n\nConversation:\n${history}\n\nReply to the latest user message. If ${userName} asks about their income, spending, budget, debts, or portfolio balance, answer using the real snapshot data above.`;

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

  if (authChecking) {
    return (
      <div style={{ ...styles.page, display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <p style={{ color: "#9CA3AF", fontWeight: 700, fontSize: 14 }}>Checking your session…</p>
      </div>
    );
  }

  if (!authUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div style={styles.page}>
      <style>{css}</style>

      <div style={styles.shell}>
        {activeTab === "dashboard" && (
          <header style={styles.investHeader}>
            <p style={styles.brandLogo}>MatterPro</p>
            <button type="button" style={styles.notifBtn} aria-label="Notifications">
              <Bell size={20} strokeWidth={1.75} />
            </button>
          </header>
        )}

        {(activeTab === "snowball" || activeTab === "lessons") && (
          <header style={styles.header}>
            <div>
              <p style={styles.brand}>MATTER</p>
              <h1 style={styles.hello}>Hey, {userName} 👋</h1>
              <p style={styles.subhead}>Your money. Your move.</p>
            </div>
            <div style={styles.streak}>🔥 5-Day Streak</div>
          </header>
        )}

        {activeTab === "dashboard" && (
          <div className="matter-tab-panel" style={styles.tabPanel}>
            <HealthScoreBadge score={score} scoreMax={scoreMax} />

            <InvestmentPortfolioCard
              key={authUser.id}
              onHoldingsChange={setHoldings}
              onConsultSocrates={() => setActiveTab("socrates")}
            />

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
                  value={monthlyIncome}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const raw = e.target.value.replace(/[^0-9.]/g, "");
                    const next = Number(raw);
                    setMonthlyIncome(Number.isFinite(next) ? next : 0);
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
            <div style={styles.moduleHead}>
              <p style={styles.brand}>CASH FLOW &amp; DEBT</p>
              <h2 style={styles.moduleTitle}>Cash Flow &amp; Debt Management</h2>
              <p style={styles.moduleSub}>
                What comes in, what goes out, and what you owe — all in one place.
              </p>
            </div>

            {/* 1. One panel: earnings in, spendings out, net result. */}
            <article
              style={{ ...styles.flowPanel, borderColor: flowTone.border }}
              aria-label="Monthly cash flow"
            >
              <div style={styles.flowPanelHead}>
                <p style={styles.sectionLabel}>Monthly Cash Flow</p>
                <span
                  style={{
                    ...styles.netChip,
                    color: flowTone.text,
                    background: flowTone.bg,
                    border: `1px solid ${flowTone.border}`,
                  }}
                >
                  {isSurplus ? "Surplus" : "Deficit"}
                </span>
              </div>

              <div style={styles.flowSplit}>
                <div style={styles.flowCell}>
                  <div style={styles.flowCellHead}>
                    <span style={{ ...styles.flowCellIcon, color: INCOME_GREEN }}>
                      <TrendingUp size={13} />
                    </span>
                    <p style={styles.flowCellLabel}>Earnings</p>
                  </div>
                  <div style={styles.flowInputRow}>
                    <span style={{ ...styles.flowPrefix, color: INCOME_GREEN }}>$</span>
                    <input
                      style={styles.flowInput}
                      type="text"
                      inputMode="decimal"
                      value={monthlyIncome === 0 ? "" : monthlyIncome}
                      placeholder="0"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const next = Number(e.target.value.replace(/[^0-9.]/g, ""));
                        setMonthlyIncome(Number.isFinite(next) ? next : 0);
                      }}
                      aria-label="Monthly earnings"
                    />
                  </div>
                  <p style={styles.flowCellHint}>Monthly take-home pay</p>
                </div>

                <div style={styles.flowCellDivider} aria-hidden="true" />

                <div style={styles.flowCell}>
                  <div style={styles.flowCellHead}>
                    <span style={{ ...styles.flowCellIcon, color: EXPENSE_RED }}>
                      <TrendingDown size={13} />
                    </span>
                    <p style={styles.flowCellLabel}>Total Spendings</p>
                  </div>
                  <p style={{ ...styles.flowAmount, color: EXPENSE_RED }}>${money(monthlyExpenses)}</p>
                  <button
                    type="button"
                    onClick={openSpendingModal}
                    style={styles.detailBtn}
                    aria-haspopup="dialog"
                    aria-expanded={spendingModalOpen}
                  >
                    Detaylandır
                  </button>
                  <p style={styles.flowCellHint}>
                    {expenses.length === 0
                      ? "No categories yet"
                      : `Across ${expenses.length} ${expenses.length === 1 ? "category" : "categories"}`}
                  </p>
                </div>
              </div>

              <div style={styles.flowRule} aria-hidden="true" />

              <p style={styles.statLabel}>Net Cash Flow</p>
              <p style={{ ...styles.netValue, color: flowTone.value }}>
                {isSurplus ? "+" : "−"}${money(Math.abs(netCashFlow))}
                <span style={styles.netPer}>/mo</span>
              </p>
              <div style={styles.barTrack}>
                <div
                  style={{
                    ...styles.barFill,
                    width: `${spendRatio}%`,
                    background: flowTone.value,
                  }}
                />
              </div>
              <p style={styles.statHint}>
                {monthlyIncome > 0
                  ? `Spending ${Math.round(spendRatio)}% of your income. ${
                      isSurplus
                        ? `$${money(netCashFlow)} left to save or attack debt.`
                        : `You're short $${money(Math.abs(netCashFlow))} — trim a category or add income.`
                    }`
                  : "Add your monthly earnings to see your net cash flow."}
              </p>
            </article>

            {/* 2. Spending breakdown lives in a modal opened from Total Spendings. */}
            {spendingModalOpen && (
              <div
                style={styles.modalOverlay}
                onClick={closeSpendingModal}
                role="presentation"
              >
                <div
                  className="matter-pop"
                  style={styles.spendingModal}
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="spending-modal-title"
                >
                  <div style={styles.spendingModalHead}>
                    <div style={styles.spendingModalTitleRow}>
                      <span style={styles.spendingModalIcon}>
                        <Receipt size={17} />
                      </span>
                      <div>
                        <h3 id="spending-modal-title" style={styles.spendingModalTitle}>
                          Spending Breakdown
                        </h3>
                        <p style={styles.spendingModalSub}>
                          Edit categories — totals update cash flow live.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeSpendingModal}
                      aria-label="Close spending breakdown"
                      style={styles.iconBtn}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <div style={styles.spendingModalBody}>
                    {expenses.length === 0 ? (
                      <div style={styles.emptyExpenses}>
                        Nothing tracked yet. Add rent, groceries, utilities, subscriptions — anything
                        that leaves your account each month.
                      </div>
                    ) : (
                      <ul style={styles.expenseList}>
                        {expenses.map((item) => (
                          <ExpenseRow
                            key={item.id}
                            item={item}
                            share={monthlyExpenses > 0 ? (item.amount / monthlyExpenses) * 100 : 0}
                            onAmountChange={(next) => setExpenseAmount(item.id, next)}
                            onRemove={() => removeExpense(item.id)}
                          />
                        ))}
                      </ul>
                    )}

                    <div style={styles.expenseTotalRow}>
                      <p style={styles.expenseTotalLabel}>Total Spendings</p>
                      <p style={{ ...styles.expenseTotalValue, color: EXPENSE_RED }}>
                        ${money(monthlyExpenses)}
                        <span style={styles.netPer}>/mo</span>
                      </p>
                    </div>

                    <div style={styles.modalNetRow}>
                      <p style={styles.expenseTotalLabel}>Net Cash Flow</p>
                      <p style={{ ...styles.modalNetValue, color: flowTone.value }}>
                        {isSurplus ? "+" : "−"}${money(Math.abs(netCashFlow))}
                        <span style={styles.netPer}>/mo</span>
                      </p>
                    </div>
                  </div>

                  {!expenseFormOpen ? (
                    <button type="button" onClick={openExpenseForm} style={styles.addChip}>
                      <Plus size={13} />
                      Add Category
                    </button>
                  ) : (
                    <form className="matter-pop" onSubmit={submitExpense} style={styles.expenseForm}>
                      <div style={styles.debtFormHead}>
                        <p style={styles.expenseFormTitle}>Add a Spending Category</p>
                        <button
                          type="button"
                          onClick={() => setExpenseFormOpen(false)}
                          aria-label="Cancel add category"
                          style={styles.iconBtn}
                        >
                          <X size={15} />
                        </button>
                      </div>

                      <div style={styles.debtFormGrid}>
                        <label style={{ ...styles.debtFormLabel, gridColumn: "1 / -1" }}>
                          Category
                          <input
                            style={styles.debtFormInput}
                            value={expenseForm.label}
                            onChange={(e) => setExpenseForm((f) => ({ ...f, label: e.target.value }))}
                            placeholder="e.g. Transport"
                            autoFocus
                          />
                        </label>
                        <label style={{ ...styles.debtFormLabel, gridColumn: "1 / -1" }}>
                          Monthly Amount ($)
                          <input
                            style={styles.debtFormInput}
                            inputMode="decimal"
                            value={expenseForm.amount}
                            onChange={(e) =>
                              setExpenseForm((f) => ({
                                ...f,
                                amount: e.target.value.replace(/[^0-9.]/g, ""),
                              }))
                            }
                            placeholder="120"
                          />
                        </label>
                      </div>

                      {expenseFormError && <p style={styles.debtFormError}>{expenseFormError}</p>}

                      <button type="submit" style={styles.saveExpenseBtn}>
                        <Check size={15} />
                        Add Category
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* 3. Active debt payoff list */}
            <section style={styles.moduleSection}>
              <div style={styles.sectionHeadRow}>
                <p style={styles.sectionLabel}>Active Debt Payoff</p>
                <button type="button" onClick={openDebtForm} style={styles.addChip}>
                  <Plus size={13} />
                  Add Debt
                </button>
              </div>

              <div style={styles.statTiles}>
                <StatTile label="Total Debt" value={`$${money(totalDebt)}`} />
                <StatTile label="Minimums" value={`$${money(totalMinPayment)}/mo`} />
                <StatTile label="Interest" value={`$${money(monthlyInterest)}/mo`} tone="#FDA4AF" />
              </div>

              <article style={styles.toolCard} aria-label="Extra monthly payoff amount">
                <div style={styles.extraHead}>
                  <p style={styles.statLabel}>Extra payment each month</p>
                  <span style={styles.extraValue}>${extraPayoff}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={500}
                  step={5}
                  value={extraPayoff}
                  onChange={(e) => setExtraPayoff(Number(e.target.value))}
                  aria-label="Extra monthly payoff amount"
                  className="matter-slider"
                  style={styles.extraSlider}
                />
                <p style={styles.statHint}>
                  {isSurplus && netCashFlow > 0
                    ? `Your $${money(netCashFlow)}/mo surplus can cover this. `
                    : "You're spending everything you earn — trim a category above to free this up. "}
                  {focusDebt
                    ? `Extra dollars go to ${focusDebt.title} first, then roll onto the next balance.`
                    : "No active debt — send it all to savings and investing."}
                </p>
              </article>

              {debtFormOpen && (
                <form className="matter-pop" onSubmit={submitDebt} style={styles.debtForm}>
                  <div style={styles.debtFormHead}>
                    <p style={styles.debtFormTitle}>Add a Debt</p>
                    <button
                      type="button"
                      onClick={() => setDebtFormOpen(false)}
                      aria-label="Cancel add debt"
                      style={styles.iconBtn}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <div style={styles.debtFormGrid}>
                    <label style={{ ...styles.debtFormLabel, gridColumn: "1 / -1" }}>
                      Title
                      <input
                        style={styles.debtFormInput}
                        value={debtForm.title}
                        onChange={(e) => setDebtForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. Car Loan"
                      />
                    </label>
                    <label style={styles.debtFormLabel}>
                      Balance ($)
                      <input
                        style={styles.debtFormInput}
                        inputMode="decimal"
                        value={debtForm.balance}
                        onChange={(e) =>
                          setDebtForm((f) => ({ ...f, balance: e.target.value.replace(/[^0-9.]/g, "") }))
                        }
                        placeholder="1200"
                      />
                    </label>
                    <label style={styles.debtFormLabel}>
                      Min. Payment ($/mo)
                      <input
                        style={styles.debtFormInput}
                        inputMode="decimal"
                        value={debtForm.minPayment}
                        onChange={(e) =>
                          setDebtForm((f) => ({ ...f, minPayment: e.target.value.replace(/[^0-9.]/g, "") }))
                        }
                        placeholder="45"
                      />
                    </label>
                    <label style={{ ...styles.debtFormLabel, gridColumn: "1 / -1" }}>
                      Interest Rate — optional (APR %)
                      <input
                        style={styles.debtFormInput}
                        inputMode="decimal"
                        value={debtForm.apr}
                        onChange={(e) =>
                          setDebtForm((f) => ({ ...f, apr: e.target.value.replace(/[^0-9.]/g, "") }))
                        }
                        placeholder="22.99"
                      />
                    </label>
                  </div>

                  {debtFormError && <p style={styles.debtFormError}>{debtFormError}</p>}

                  <button type="submit" style={styles.saveDebtBtn}>
                    <Check size={15} />
                    Save Debt
                  </button>
                </form>
              )}

              {debts.length === 0 ? (
                <div style={styles.emptyDebts}>
                  No debts tracked. Add one above, or keep every extra dollar compounding.
                </div>
              ) : (
                <div style={styles.debtList}>
                  {debts.map((debt) => (
                    <DebtPayoffCard
                      key={debt.id}
                      debt={debt}
                      isFocus={debt.id === focusDebt?.id}
                      extraPayoff={extraPayoff}
                      onLogPayment={() => logDebtPayment(debt.id)}
                      onRemove={() => removeDebt(debt.id)}
                    />
                  ))}
                </div>
              )}

              <button type="button" onClick={() => setActiveTab("lessons")} style={styles.lessonsLink}>
                Learn the payoff playbook →
              </button>
            </section>

            {/* 4. Safety net, sized off the real spending total. */}
            <section style={styles.moduleSection}>
              <p style={styles.sectionLabel}>Safety Net</p>

              <article style={styles.toolCard} aria-label="Emergency fund progress">
                <div style={styles.cardHeadRow}>
                  <div style={styles.cardHeadIcon}>
                    <ShieldCheck size={16} />
                  </div>
                  <div style={styles.cardHeadGrow}>
                    <h3 style={styles.cardTitle}>Emergency Fund</h3>
                    <p style={styles.cardSub}>
                      Target: {EMERGENCY_MONTHS} months of spending (${money(monthlyExpenses)}/mo)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => contributeEmergency(100, Math.max(emergencyTarget, emergencyFund))}
                    aria-label="Add 100 dollars to emergency fund"
                    style={styles.addChip}
                  >
                    <Plus size={13} />
                    $100
                  </button>
                </div>

                <p style={styles.statValue}>
                  ${money(emergencyFund)}{" "}
                  <span style={styles.statMuted}>/ ${money(emergencyTarget)}</span>
                </p>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${emergencyTargetPct}%` }} />
                </div>
                <p style={styles.statHint}>
                  {emergencyTarget <= 0
                    ? "Add your spending categories above to set a target."
                    : emergencyFund >= emergencyTarget
                    ? `Fully funded — ${EMERGENCY_MONTHS} months of spending covered. 🎉`
                    : `${emergencyTargetPct}% funded · covers ${monthsCovered.toFixed(1)} months · $${money(
                        emergencyTarget - emergencyFund
                      )} to go`}
                </p>
              </article>
            </section>
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
                <p style={styles.askLabel}>Matter AI</p>
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

        {/* Keep Profile mounted so toggles/settings survive tab switches. */}
        <div
          className={activeTab === "profile" ? "matter-tab-panel" : undefined}
          style={{
            ...styles.tabPanel,
            display: activeTab === "profile" ? undefined : "none",
          }}
          aria-hidden={activeTab !== "profile"}
        >
          <ProfileScreen user={authUser} onLogout={handleLogout} />
        </div>

        {activeTab !== "socrates" && activeTab !== "profile" && (
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

/** One editable spending category. Typing here recomputes the whole cash flow panel. */
function ExpenseRow({
  item,
  share,
  onAmountChange,
  onRemove,
}: {
  item: ExpenseItem;
  share: number;
  onAmountChange: (next: number) => void;
  onRemove: () => void;
}) {
  return (
    <li style={styles.expenseRow}>
      <span style={styles.expenseIcon}>{expenseIcon(item.label)}</span>

      <div style={styles.expenseMain}>
        <p style={styles.expenseLabel}>{item.label}</p>
        <div style={styles.expenseShareTrack}>
          <div style={{ ...styles.expenseShareFill, width: `${Math.min(100, share)}%` }} />
        </div>
        <p style={styles.expenseShareNote}>{Math.round(share)}% of spending</p>
      </div>

      <div style={styles.expenseInputRow}>
        <span style={styles.expensePrefix}>$</span>
        <input
          style={styles.expenseInput}
          type="text"
          inputMode="decimal"
          value={item.amount === 0 ? "" : item.amount}
          placeholder="0"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const next = Number(e.target.value.replace(/[^0-9.]/g, ""));
            onAmountChange(Number.isFinite(next) ? next : 0);
          }}
          aria-label={`${item.label} monthly amount`}
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.label}`}
        style={styles.iconBtn}
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={styles.statTile}>
      <p style={styles.statTileLabel}>{label}</p>
      <p style={{ ...styles.statTileValue, color: tone ?? "#F8FAFC" }}>{value}</p>
    </div>
  );
}

function DebtPayoffCard({
  debt,
  isFocus,
  extraPayoff,
  onLogPayment,
  onRemove,
}: {
  debt: Debt;
  isFocus: boolean;
  extraPayoff: number;
  onLogPayment: () => void;
  onRemove: () => void;
}) {
  const isPaid = debt.balance <= 0;
  const paidPct =
    debt.originalBalance > 0
      ? Math.min(100, Math.round(((debt.originalBalance - debt.balance) / debt.originalBalance) * 100))
      : 0;
  const monthlyPayment = debt.minPayment + (isFocus && !isPaid ? extraPayoff : 0);
  const payoffMonths = monthsToPayoff(debt.balance, debt.apr, monthlyPayment);
  const interestPerMonth = (debt.balance * debt.apr) / 100 / 12;
  const tone = aprTone(debt.apr);

  return (
    <article
      style={{
        ...styles.debtCard,
        ...(isFocus && !isPaid ? styles.debtCardFocus : {}),
        ...(isPaid ? styles.debtCardPaid : {}),
      }}
    >
      <div style={styles.debtCardTop}>
        <span style={styles.debtIconBox}>{debtIcon(debt.title)}</span>
        <div style={styles.debtHeadGrow}>
          <p style={styles.debtTitle}>{debt.title}</p>
          <div style={styles.debtChipRow}>
            <span
              style={{
                ...styles.chip,
                color: tone.color,
                background: tone.bg,
                border: `1px solid ${tone.border}`,
              }}
            >
              {debt.apr > 0 ? `${debt.apr}% APR` : "0% APR"}
            </span>
            {isFocus && !isPaid && <span style={styles.focusChip}>Paying now</span>}
            {isPaid && <span style={styles.paidChip}>Paid off 🎉</span>}
          </div>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${debt.title}`} style={styles.iconBtn}>
          <Trash2 size={15} />
        </button>
      </div>

      <div style={styles.debtBalanceRow}>
        <p style={styles.debtBalance}>${money(debt.balance)}</p>
        <p style={styles.debtOriginal}>of ${money(debt.originalBalance)}</p>
      </div>

      <div style={styles.debtBar}>
        <div style={{ ...styles.debtBarFill, width: `${paidPct}%` }} />
      </div>
      <p style={styles.debtProgressNote}>{paidPct}% paid off</p>

      <div style={styles.debtMetrics}>
        <div style={styles.metricBox}>
          <p style={styles.metricLabel}>Paying</p>
          <p style={styles.metricValue}>${money(monthlyPayment)}/mo</p>
        </div>
        <div style={styles.metricBox}>
          <p style={styles.metricLabel}>Payoff in</p>
          <p style={styles.metricValue}>{formatMonths(payoffMonths)}</p>
        </div>
        <div style={styles.metricBox}>
          <p style={styles.metricLabel}>Interest</p>
          <p style={{ ...styles.metricValue, color: interestPerMonth > 0 ? "#FDA4AF" : "#F8FAFC" }}>
            ${money(interestPerMonth)}/mo
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onLogPayment}
        disabled={isPaid}
        style={{ ...styles.payBtn, opacity: isPaid ? 0.4 : 1 }}
      >
        <CircleDollarSign size={14} />
        {isPaid ? "Cleared" : `Log Payment (+$${money(monthlyPayment)})`}
      </button>
    </article>
  );
}

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
  investHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    minHeight: 40,
  },
  brandLogo: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    color: "#FFFFFF",
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    border: "1px solid #1F1F1F",
    background: "#0A0A0A",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
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
  // --- Cash Flow & Debt Management module ---
  moduleHead: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  moduleTitle: {
    margin: "6px 0 0",
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  moduleSub: {
    margin: "4px 0 0",
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 1.45,
  },
  moduleSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  sectionLabel: {
    margin: 0,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#64748B",
  },
  sectionHeadRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  // Unified cash flow panel: earnings, total spendings and net result in one container.
  flowPanel: {
    background: "linear-gradient(180deg, #0A0A0A 0%, #000000 100%)",
    border: "1px solid",
    borderRadius: 20,
    padding: 18,
  },
  flowPanelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  flowSplit: {
    display: "grid",
    gridTemplateColumns: "1fr 1px 1fr",
    gap: 14,
    alignItems: "start",
  },
  flowCell: {
    minWidth: 0,
  },
  flowCellHead: {
    display: "flex",
    alignItems: "center",
    gap: 7,
  },
  flowCellIcon: {
    display: "grid",
    placeItems: "center",
    width: 22,
    height: 22,
    borderRadius: 7,
    background: "rgba(255, 255, 255, 0.05)",
    flexShrink: 0,
  },
  flowCellLabel: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    color: "#E2E8F0",
  },
  flowCellDivider: {
    alignSelf: "stretch",
    background: "#1F1F1F",
  },
  flowInputRow: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    marginTop: 9,
    background: "#121212",
    border: "1px solid #1F1F1F",
    borderRadius: 12,
    padding: "0 9px",
  },
  flowPrefix: {
    fontWeight: 800,
    fontSize: 17,
  },
  flowInput: {
    flex: 1,
    minWidth: 0,
    background: "transparent",
    border: "none",
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    padding: "9px 0",
    outline: "none",
  },
  flowAmount: {
    margin: "9px 0 0",
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    padding: "9px 0",
    lineHeight: 1,
  },
  flowCellHint: {
    margin: "8px 0 0",
    fontSize: 11,
    color: "#64748B",
    fontWeight: 600,
  },
  detailBtn: {
    display: "inline-flex",
    alignItems: "center",
    marginTop: 8,
    background: "rgba(16, 185, 129, 0.12)",
    color: "#6EE7B7",
    border: "1px solid rgba(16, 185, 129, 0.4)",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.02em",
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#000000",
    padding: 16,
  },
  spendingModal: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 20,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  spendingModalHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  spendingModalTitleRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    minWidth: 0,
  },
  spendingModalIcon: {
    display: "grid",
    placeItems: "center",
    width: 36,
    height: 36,
    borderRadius: 12,
    background: "rgba(16, 185, 129, 0.14)",
    color: "#10B981",
    flexShrink: 0,
  },
  spendingModalTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#F8FAFC",
  },
  spendingModalSub: {
    margin: "3px 0 0",
    fontSize: 11,
    color: "#64748B",
    fontWeight: 600,
    lineHeight: 1.4,
  },
  spendingModalBody: {
    background: "#000000",
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    padding: 14,
  },
  flowRule: {
    height: 1,
    background: "#1F1F1F",
    margin: "16px 0 14px",
  },
  netChip: {
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "-0.01em",
  },
  netValue: {
    margin: "10px 0 10px",
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: "-0.04em",
  },
  netPer: {
    fontSize: 14,
    fontWeight: 700,
    color: "#64748B",
    marginLeft: 4,
  },
  cardHeadRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  cardHeadIcon: {
    display: "grid",
    placeItems: "center",
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "rgba(16, 185, 129, 0.14)",
    color: "#10B981",
    flexShrink: 0,
  },
  cardHeadGrow: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  cardSub: {
    margin: "2px 0 0",
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: 600,
  },
  // Itemized spending manager.
  expenseList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  expenseRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  expenseIcon: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    borderRadius: 10,
    background: "rgba(244, 63, 94, 0.10)",
    border: "1px solid rgba(244, 63, 94, 0.22)",
    color: "#FDA4AF",
    flexShrink: 0,
  },
  expenseMain: {
    flex: 1,
    minWidth: 0,
  },
  expenseLabel: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: "#E2E8F0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  expenseShareTrack: {
    height: 4,
    borderRadius: 999,
    background: "#121212",
    overflow: "hidden",
    marginTop: 6,
  },
  expenseShareFill: {
    height: "100%",
    borderRadius: 999,
    background: "#F43F5E",
    transition: "width 0.25s ease",
  },
  expenseShareNote: {
    margin: "5px 0 0",
    fontSize: 10,
    fontWeight: 700,
    color: "#64748B",
  },
  expenseInputRow: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    width: 96,
    background: "#121212",
    border: "1px solid #1F1F1F",
    borderRadius: 10,
    padding: "0 8px",
    flexShrink: 0,
  },
  expensePrefix: {
    fontSize: 13,
    fontWeight: 800,
    color: "#F43F5E",
  },
  expenseInput: {
    flex: 1,
    minWidth: 0,
    background: "transparent",
    border: "none",
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    padding: "9px 0",
    outline: "none",
    textAlign: "right",
  },
  expenseTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid #1F1F1F",
  },
  expenseTotalLabel: {
    margin: 0,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#64748B",
  },
  expenseTotalValue: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  modalNetRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
    marginTop: 10,
  },
  modalNetValue: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  emptyExpenses: {
    border: "1px dashed #1F1F1F",
    borderRadius: 12,
    padding: 18,
    textAlign: "center",
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.5,
  },
  expenseForm: {
    background: "rgba(16, 185, 129, 0.06)",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    borderRadius: 16,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  expenseFormTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    color: "#6EE7B7",
  },
  saveExpenseBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "#10B981",
    color: "#042F2E",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  addChipRed: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "rgba(244, 63, 94, 0.12)",
    color: "#FDA4AF",
    border: "1px solid rgba(244, 63, 94, 0.4)",
    borderRadius: 10,
    padding: "7px 11px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
  },
  addChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "#10B981",
    color: "#042F2E",
    border: "none",
    borderRadius: 10,
    padding: "7px 11px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
  },
  statTiles: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
  },
  statTile: {
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 14,
    padding: "10px 11px",
  },
  statTileLabel: {
    margin: 0,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#64748B",
  },
  statTileValue: {
    margin: "5px 0 0",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  extraHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  extraValue: {
    fontSize: 18,
    fontWeight: 800,
    color: "#10B981",
    letterSpacing: "-0.03em",
  },
  extraSlider: {
    width: "100%",
    margin: "12px 0 4px",
  },
  debtForm: {
    background: "rgba(16, 185, 129, 0.06)",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    borderRadius: 16,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  debtFormHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  debtFormTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    color: "#6EE7B7",
  },
  debtFormGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  debtFormLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    color: "#94A3B8",
  },
  debtFormInput: {
    background: "#121212",
    border: "1px solid #1F1F1F",
    borderRadius: 10,
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 10px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  debtFormError: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    color: "#FDA4AF",
  },
  saveDebtBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "#10B981",
    color: "#042F2E",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  iconBtn: {
    background: "transparent",
    border: "none",
    color: "#475569",
    cursor: "pointer",
    padding: 2,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  emptyDebts: {
    border: "1px dashed #1F1F1F",
    borderRadius: 16,
    padding: 22,
    textAlign: "center",
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.5,
  },
  debtList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  debtCard: {
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    padding: 14,
  },
  debtCardFocus: {
    border: "1px solid rgba(16, 185, 129, 0.45)",
    background: "linear-gradient(180deg, rgba(16, 185, 129, 0.07) 0%, #0A0A0A 60%)",
  },
  debtCardPaid: {
    opacity: 0.72,
  },
  debtCardTop: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  debtIconBox: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    borderRadius: 10,
    background: "rgba(255, 255, 255, 0.05)",
    color: "#CBD5E1",
    flexShrink: 0,
  },
  debtHeadGrow: {
    flex: 1,
    minWidth: 0,
  },
  debtTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  debtChipRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
    flexWrap: "wrap",
  },
  chip: {
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: 800,
  },
  focusChip: {
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: 800,
    color: "#042F2E",
    background: "#10B981",
  },
  paidChip: {
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: 800,
    color: "#6EE7B7",
    background: "rgba(16, 185, 129, 0.15)",
  },
  debtBalanceRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    margin: "14px 0 8px",
  },
  debtBalance: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  debtOriginal: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
  },
  debtBar: {
    height: 8,
    borderRadius: 999,
    background: "#121212",
    overflow: "hidden",
  },
  debtBarFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #047857, #10B981)",
    transition: "width 0.35s ease",
  },
  debtProgressNote: {
    margin: "6px 0 0",
    fontSize: 11,
    fontWeight: 700,
    color: "#6EE7B7",
  },
  debtMetrics: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    margin: "12px 0",
  },
  metricBox: {
    background: "#121212",
    border: "1px solid #1F1F1F",
    borderRadius: 10,
    padding: "8px 9px",
  },
  metricLabel: {
    margin: 0,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#64748B",
  },
  metricValue: {
    margin: "4px 0 0",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  payBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.4)",
    color: "#6EE7B7",
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  lessonsLink: {
    background: "transparent",
    border: "none",
    color: "#10B981",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    padding: 0,
    alignSelf: "flex-start",
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
    gridTemplateColumns: "repeat(5, 1fr)",
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
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    textAlign: "center",
    lineHeight: 1.15,
    whiteSpace: "pre-line",
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
