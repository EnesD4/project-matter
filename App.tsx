import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Plus,
  Receipt,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { type Debt } from "./src/components/DebtSnowballManager";
import { formatCurrencyInput, formatCurrencyValue, parseCurrency } from "./src/lib/money";
import { categoryIcon } from "./src/lib/categoryIcons";
import AuthScreen from "./src/components/AuthScreen";
import OnboardingScreen from "./src/components/OnboardingScreen";
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
  type UserSettings,
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
  { id: "snowball", emoji: "💸", label: "Cash Flow" },
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

type DebtFormState = { title: string; balance: string; minPayment: string; apr: string };
const EMPTY_DEBT_FORM: DebtFormState = { title: "", balance: "", minPayment: "", apr: "" };

/** One editable line in the monthly spending breakdown. */
type ExpenseItem = { id: string; label: string; amount: number };

type ExpenseFormState = { label: string; amount: string };
const EMPTY_EXPENSE_FORM: ExpenseFormState = { label: "", amount: "" };

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

function CurrencyInput({
  value,
  onValueChange,
  style,
  ...rest
}: {
  value: number;
  onValueChange: (next: number) => void;
  style?: React.CSSProperties;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [draft, setDraft] = useState(() => formatCurrencyValue(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(formatCurrencyValue(value));
    }
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      style={style}
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true;
        rest.onFocus?.(event);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        setDraft(formatCurrencyValue(value));
        rest.onBlur?.(event);
      }}
      onChange={(event) => {
        const formatted = formatCurrencyInput(event.target.value);
        setDraft(formatted);
        onValueChange(parseCurrency(formatted));
      }}
    />
  );
}

let debtIdSeed = 0;
function nextDebtId() {
  debtIdSeed += 1;
  return `debt-${Date.now()}-${debtIdSeed}`;
}

const App: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getStoredUser());
  const [authChecking, setAuthChecking] = useState(() => Boolean(getToken()));
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [settingsReady, setSettingsReady] = useState(() => !getToken());
  const [emergencyFund, setEmergencyFund] = useState(0);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [socratesLoading, setSocratesLoading] = useState(false);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const askInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  // Cash Flow & Debt Management module state.
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [spendingModalOpen, setSpendingModalOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(EMPTY_EXPENSE_FORM);
  const [expenseFormError, setExpenseFormError] = useState("");
  const [extraPayoff, setExtraPayoff] = useState(0);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtFormOpen, setDebtFormOpen] = useState(false);
  const [debtForm, setDebtForm] = useState<DebtFormState>(EMPTY_DEBT_FORM);
  const [debtFormError, setDebtFormError] = useState("");
  const [debtAccordionOpen, setDebtAccordionOpen] = useState(false);

  // Live mirror of child-owned portfolio state, kept in sync via a callback prop so
  // Socrates AI can reference the user's real holdings.
  const [holdings, setHoldings] = useState<Holding[]>([]);

  const userName = authUser?.name?.trim() || "Investor";

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthChecking(false);
      setAuthUser(null);
      setUserSettings(null);
      setSettingsReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        saveSession(token, me.user);
        setAuthUser(me.user);
        setUserSettings(me.settings);
      } catch {
        if (cancelled) return;
        clearSession();
        setAuthUser(null);
        setUserSettings(null);
        setHoldings([]);
      } finally {
        if (!cancelled) {
          setSettingsReady(true);
          setAuthChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = (user: AuthUser, settings?: UserSettings | null) => {
    setAuthUser(user);
    setActiveTab("dashboard");
    if (settings !== undefined) {
      setUserSettings(settings);
      setSettingsReady(true);
      return;
    }
    setSettingsReady(false);
    void (async () => {
      try {
        const me = await fetchMe();
        setUserSettings(me.settings);
      } catch {
        setUserSettings(null);
      } finally {
        setSettingsReady(true);
      }
    })();
  };

  const handleOnboardingComplete = (settings: UserSettings) => {
    setUserSettings(settings);
    setActiveTab("dashboard");
  };

  const handleLogout = () => {
    clearSession();
    setAuthUser(null);
    setUserSettings(null);
    setSettingsReady(true);
    setHoldings([]);
    setMessages([]);
    setActiveTab("dashboard");
  };

  const emergencyGoal = 1000;

  const categoryExpenses = useMemo(
    () => expenses.reduce((sum, item) => sum + item.amount, 0),
    [expenses]
  );
  const totalDebt = useMemo(() => debts.reduce((sum, d) => sum + d.balance, 0), [debts]);
  const activeDebts = useMemo(() => debts.filter((d) => d.balance > 0), [debts]);
  const totalMinPayment = useMemo(
    () => activeDebts.reduce((sum, d) => sum + d.minPayment, 0),
    [activeDebts]
  );
  // Active debt minimums count toward monthly expenses so users never enter them twice.
  const monthlyExpenses = categoryExpenses + totalMinPayment;

  const netCashFlow = monthlyIncome - monthlyExpenses;
  const isSurplus = netCashFlow >= 0;
  const hasCashFlowInputs = monthlyIncome > 0 || expenses.length > 0 || totalMinPayment > 0;
  const flowTone = !hasCashFlowInputs
    ? { value: "#F8FAFC", text: "#94A3B8", bg: "rgba(255,255,255,0.04)", border: "#1F1F1F" }
    : isSurplus
    ? SURPLUS_TONE
    : DEFICIT_TONE;
  const spendRatio = monthlyIncome > 0 ? Math.min(100, (monthlyExpenses / monthlyIncome) * 100) : 0;

  const emergencyTarget = monthlyExpenses * EMERGENCY_MONTHS;
  const emergencyTargetPct =
    emergencyTarget > 0 ? Math.min(100, Math.round((emergencyFund / emergencyTarget) * 100)) : 0;
  const monthsCovered = monthlyExpenses > 0 ? emergencyFund / monthlyExpenses : 0;
  const avgApr = useMemo(() => {
    if (totalDebt <= 0) return 0;
    return debts.reduce((sum, d) => sum + d.balance * d.apr, 0) / totalDebt;
  }, [debts, totalDebt]);

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
    const categoryBreakdown =
      expenses.length === 0
        ? "No spending categories tracked yet."
        : `Spending breakdown: ${expenses
            .map((item) => `${item.label} $${money(item.amount)}/mo`)
            .join(", ")}.`;
    const debtBreakdown =
      totalMinPayment > 0
        ? ` Active debt minimums included in expenses: ${activeDebts
            .map((d) => `${d.title} $${money(d.minPayment)}/mo`)
            .join(", ")}.`
        : "";
    return `Monthly income $${money(monthlyIncome)}, total monthly spending $${money(
      monthlyExpenses
    )} (categories $${money(categoryExpenses)} + debt minimums $${money(
      totalMinPayment
    )}), net cash flow ${isSurplus ? "+" : "-"}$${money(Math.abs(netCashFlow))} (${
      isSurplus ? "surplus" : "deficit"
    }). ${categoryBreakdown}${debtBreakdown}`;
  }, [
    expenses,
    monthlyIncome,
    monthlyExpenses,
    categoryExpenses,
    totalMinPayment,
    activeDebts,
    isSurplus,
    netCashFlow,
  ]);

  useEffect(() => {
    const log = chatLogRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages, socratesLoading, activeTab]);

  useEffect(() => {
    const el = askInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 21;
    const paddingY = 24;
    const maxHeight = lineHeight * 5 + paddingY;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [question, activeTab]);

  const contributeEmergency = (amount: number, cap: number) => {
    setEmergencyFund((prev: number) => Math.max(prev, Math.min(cap, prev + amount)));
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
    const amount = parseCurrency(expenseForm.amount);

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
    setDebtAccordionOpen(true);
    setDebtForm(EMPTY_DEBT_FORM);
    setDebtFormError("");
    setDebtFormOpen(true);
  };

  const submitDebt = (event: React.FormEvent) => {
    event.preventDefault();
    const balance = parseCurrency(debtForm.balance);
    const minPayment = parseCurrency(debtForm.minPayment);
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
      )}; full ${EMERGENCY_MONTHS}-month goal $${money(emergencyTarget)})\n- Cash flow: ${cashFlowContext}\n- Debt: ${debtContext}\n- Investment portfolio: ${portfolioContext}\n\nConversation:\n${history}\n\nReply to the latest user message. If ${userName} asks about their income, spending, budget, debts, or portfolio balance, answer using the real snapshot data above.`;

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

  const onAskKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void askSocrates();
    }
  };

  if (authChecking || (authUser && !settingsReady)) {
    return (
      <div style={{ ...styles.page, display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <p style={{ color: "#9CA3AF", fontWeight: 700, fontSize: 14 }}>Checking your session…</p>
      </div>
    );
  }

  if (!authUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (!userSettings?.hasCompletedOnboarding) {
    return (
      <OnboardingScreen
        onComplete={handleOnboardingComplete}
      />
    );
  }

  return (
    <div style={styles.page}>
      <style>{css}</style>

      <div style={styles.shell}>
        {(activeTab === "dashboard" || activeTab === "snowball" || activeTab === "lessons") && (
          <header style={styles.investHeader}>
            <p style={styles.brandLogo}>MatterPro</p>
            <button type="button" style={styles.notifBtn} aria-label="Notifications">
              <Bell size={20} strokeWidth={1.75} />
            </button>
          </header>
        )}

        {activeTab === "dashboard" && (
          <div className="matter-tab-panel" style={styles.tabPanel}>
            <InvestmentPortfolioCard
              key={authUser.id}
              onHoldingsChange={setHoldings}
              onConsultSocrates={() => setActiveTab("socrates")}
            />
          </div>
        )}

        {activeTab === "snowball" && (
          <div className="matter-tab-panel" style={styles.tabPanel}>
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
                  {!hasCashFlowInputs ? "Add yours" : isSurplus ? "Surplus" : "Deficit"}
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
                    <CurrencyInput
                      style={styles.flowInput}
                      value={monthlyIncome}
                      onValueChange={setMonthlyIncome}
                      placeholder="0"
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
                    {expenses.length === 0 && totalMinPayment <= 0
                      ? "No categories yet"
                      : [
                          expenses.length > 0
                            ? `${expenses.length} ${expenses.length === 1 ? "category" : "categories"}`
                            : null,
                          totalMinPayment > 0 ? "debt payments included" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
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
                          Edit categories — totals update cash flow live. Debt minimums are counted
                          automatically.
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
                    {expenses.length === 0 && activeDebts.length === 0 ? (
                      <div style={styles.emptyExpenses}>
                        Nothing tracked yet. Add rent, groceries, utilities, subscriptions — anything
                        that leaves your account each month. Debt minimums from Active Debt Payoff are
                        included automatically.
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
                        {activeDebts.map((debt) => (
                          <DebtPaymentRow
                            key={debt.id}
                            debt={debt}
                            share={monthlyExpenses > 0 ? (debt.minPayment / monthlyExpenses) * 100 : 0}
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
                    {totalMinPayment > 0 && (
                      <p style={styles.expenseShareNote}>
                        ${money(categoryExpenses)} in categories + ${money(totalMinPayment)} in debt
                        minimums
                      </p>
                    )}

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
                          Monthly Amount
                          <input
                            style={styles.debtFormInput}
                            inputMode="decimal"
                            value={expenseForm.amount}
                            onChange={(e) =>
                              setExpenseForm((f) => ({
                                ...f,
                                amount: formatCurrencyInput(e.target.value, { symbol: true }),
                              }))
                            }
                            placeholder="$0"
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

            {/* 3. Active debt payoff — collapsed summary accordion */}
            <section aria-label="Active debt payoff">
              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/80">
                <button
                  type="button"
                  onClick={() => setDebtAccordionOpen((open) => !open)}
                  aria-expanded={debtAccordionOpen}
                  aria-controls="debt-accordion-panel"
                  className="w-full p-4 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#10B981]">
                      Active Debt Payoff
                    </p>
                    {debtAccordionOpen ? (
                      <ChevronUp size={18} className="flex-shrink-0 text-[#10B981]" aria-hidden="true" />
                    ) : (
                      <ChevronDown size={18} className="flex-shrink-0 text-neutral-500" aria-hidden="true" />
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-neutral-800 bg-black/40 px-2.5 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Total Debt</p>
                      <p className="mt-1 text-sm font-extrabold tracking-tight text-white">${money(totalDebt)}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-800 bg-black/40 px-2.5 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Minimums</p>
                      <p className="mt-1 text-sm font-extrabold tracking-tight text-white">
                        ${money(totalMinPayment)}
                        <span className="text-[10px] font-semibold text-neutral-500">/mo</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-neutral-800 bg-black/40 px-2.5 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Avg Interest</p>
                      <p className="mt-1 text-sm font-extrabold tracking-tight text-[#10B981]">
                        {debts.length === 0 ? "—" : `${avgApr.toFixed(1)}%`}
                      </p>
                    </div>
                  </div>
                </button>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    debtAccordionOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div
                    className={`min-h-0 overflow-hidden ${debtAccordionOpen ? "" : "pointer-events-none"}`}
                    aria-hidden={!debtAccordionOpen}
                    id="debt-accordion-panel"
                  >
                    <div className="space-y-3 border-t border-neutral-800 px-4 pb-4 pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-neutral-500">Breakdown & snowball plan</p>
                        <button type="button" onClick={openDebtForm} style={styles.addChip}>
                          <Plus size={13} />
                          Add Debt
                        </button>
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
                          {monthlyIncome <= 0
                            ? "Add your earnings above to see how much extra you can put toward debt. "
                            : isSurplus && netCashFlow > 0
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
                              Balance
                              <input
                                style={styles.debtFormInput}
                                inputMode="decimal"
                                value={debtForm.balance}
                                onChange={(e) =>
                                  setDebtForm((f) => ({
                                    ...f,
                                    balance: formatCurrencyInput(e.target.value, { symbol: true }),
                                  }))
                                }
                                placeholder="$0"
                              />
                            </label>
                            <label style={styles.debtFormLabel}>
                              Min. Payment /mo
                              <input
                                style={styles.debtFormInput}
                                inputMode="decimal"
                                value={debtForm.minPayment}
                                onChange={(e) =>
                                  setDebtForm((f) => ({
                                    ...f,
                                    minPayment: formatCurrencyInput(e.target.value, { symbol: true }),
                                  }))
                                }
                                placeholder="$0"
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
                                placeholder="0"
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
                        <div style={styles.emptyDebts}>No debts added yet</div>
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

                      <button
                        type="button"
                        onClick={() => setActiveTab("lessons")}
                        style={styles.lessonsLink}
                      >
                        Learn the payoff playbook →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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
              <textarea
                ref={askInputRef}
                className="matter-ask-input"
                style={styles.askInput}
                rows={1}
                value={question}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuestion(e.target.value)}
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
          <ProfileScreen
            user={authUser}
            settings={userSettings}
            onSettingsChange={setUserSettings}
            onLogout={handleLogout}
          />
        </div>

        {activeTab !== "socrates" && activeTab !== "profile" && (
        <footer style={styles.footer}>Matter · Built for the US · Stay consistent</footer>
        )}
      </div>

      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-800/60 bg-black"
      >
        <div style={styles.tabBar}>
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
        </div>
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
      <span style={styles.expenseIcon}>{categoryIcon(item.label)}</span>

      <div style={styles.expenseMain}>
        <p style={styles.expenseLabel}>{item.label}</p>
        <div style={styles.expenseShareTrack}>
          <div style={{ ...styles.expenseShareFill, width: `${Math.min(100, share)}%` }} />
        </div>
        <p style={styles.expenseShareNote}>{Math.round(share)}% of spending</p>
      </div>

      <div style={styles.expenseInputRow}>
        <span style={styles.expensePrefix}>$</span>
        <CurrencyInput
          style={styles.expenseInput}
          value={item.amount}
          onValueChange={onAmountChange}
          placeholder="0"
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

function DebtPaymentRow({
  debt,
  share,
}: {
  debt: Debt;
  share: number;
}) {
  return (
    <li style={styles.expenseRow}>
      <span style={styles.expenseIcon}>{categoryIcon(debt.title)}</span>

      <div style={styles.expenseMain}>
        <div style={styles.expenseLabelRow}>
          <p style={styles.expenseLabel}>{debt.title}</p>
          <span style={styles.autoChip}>Auto</span>
        </div>
        <div style={styles.expenseShareTrack}>
          <div style={{ ...styles.expenseShareFill, width: `${Math.min(100, share)}%` }} />
        </div>
        <p style={styles.expenseShareNote}>{Math.round(share)}% of spending · min. payment</p>
      </div>

      <div style={styles.expenseInputRow}>
        <span style={styles.expensePrefix}>$</span>
        <span style={styles.expenseLockedAmount}>{money(debt.minPayment)}</span>
      </div>

      <span style={styles.rowSpacer} aria-hidden="true" />
    </li>
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
        <span style={styles.debtIconBox}>{categoryIcon(debt.title)}</span>
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
    padding: "24px 16px 96px",
    boxSizing: "border-box",
    overflowX: "hidden",
  },
  shell: {
    maxWidth: 480,
    width: "100%",
    minWidth: 0,
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
    zIndex: 60,
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
  expenseLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
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
    minWidth: 0,
    flex: 1,
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
    width: 118,
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
  expenseLockedAmount: {
    flex: 1,
    minWidth: 0,
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    padding: "9px 0",
    textAlign: "right",
  },
  autoChip: {
    display: "inline-block",
    flexShrink: 0,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#FDA4AF",
    background: "rgba(244, 63, 94, 0.12)",
    border: "1px solid rgba(244, 63, 94, 0.28)",
    borderRadius: 999,
    padding: "2px 6px",
  },
  rowSpacer: {
    width: 18,
    flexShrink: 0,
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
    flex: "1 1 0%",
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
    background: "#121212",
    border: "1px solid #1F1F1F",
    color: "#F8FAFC",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    lineHeight: 1.5,
    outline: "none",
    resize: "none",
    overflowX: "hidden",
    overflowY: "auto",
    minHeight: 44,
    maxHeight: 129,
    boxSizing: "border-box",
    fontFamily: "inherit",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  sendBtn: {
    background: "#10B981",
    color: "#042F2E",
    border: "none",
    borderRadius: 12,
    padding: "0 16px",
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
    alignSelf: "flex-end",
    height: 44,
    minHeight: 44,
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
    minHeight: "calc(100vh - 120px)",
    minWidth: 0,
    maxWidth: "100%",
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
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTop: "1px solid #1F1F1F",
    background: "rgba(0, 0, 0, 0.85)",
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
  },
  tabBar: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 0,
    maxWidth: 480,
    margin: "0 auto",
    width: "100%",
    padding: "4px 4px calc(4px + env(safe-area-inset-bottom, 0px))",
  } as React.CSSProperties,
  tabBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    minHeight: 48,
    border: "none",
    background: "transparent",
    color: "#737373",
    borderRadius: 0,
    cursor: "pointer",
    padding: "6px 2px",
    transition: "color 0.18s ease",
  },
  tabBtnActive: {
    color: "#10B981",
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
  input::placeholder, textarea::placeholder { color: #64748B; }
  .matter-ask-input { scrollbar-width: thin; scrollbar-color: #2A2A2A transparent; }
  .matter-ask-input::-webkit-scrollbar { width: 6px; }
  .matter-ask-input::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 999px; }
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
