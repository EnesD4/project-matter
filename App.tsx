import {
  Banknote,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Coins,
  Landmark,
  Lock,
  Plus,
  ScrollText,
  Shield,
  Sparkles,
  ArrowUp,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
  Volume2,
  VolumeX,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { type Debt } from "./src/components/DebtSnowballManager";
import { formatCurrencyInput, formatCurrencyValue, safeFormatNumber, parseCurrency, toFiniteNumber } from "./src/lib/money";
import { privacyMoney } from "./src/lib/privacy";
import { categoryIcon } from "./src/lib/categoryIcons";
import AuthScreen from "./src/components/AuthScreen";
import DemoScenarioSwitcher from "./src/components/DemoScenarioSwitcher";
import InvestmentScreen, { type Holding } from "./src/components/InvestmentScreen";
import CashFlowScreen, { SafetyNetSection } from "./src/components/CashFlowScreen";
import FinancialHealthCard from "./src/components/FinancialHealthCard";
import OnboardingScreen from "./src/components/OnboardingScreen";
import BankConnectionScreen from "./src/components/BankConnectionScreen";
import RetirementScreen from "./src/components/RetirementScreen";
import LessonsScreen from "./src/components/LessonsScreen";
import ProfileScreen from "./src/components/ProfileScreen";
import FinancialOnboardingModal from "./src/components/FinancialOnboardingModal";
import AchievementBanner from "./src/components/AchievementBanner";
import CertificateCelebration from "./src/components/CertificateCelebration";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import LoadingSpinner from "./src/components/LoadingSpinner";
import { evaluateTrophies } from "./src/lib/achievements";
import { STREAK_UPDATED_EVENT } from "./src/lib/streakService";
import {
  getRetirementDepositCount,
  RETIREMENT_UPDATED_EVENT,
  seedRetirementFromAssets,
} from "./src/components/RetirementPlanner";
import {
  COMPLETED_USER_SETTINGS,
  DEFAULT_USER_SETTINGS,
  clearSession,
  emptyCashFlow,
  fetchCashFlow,
  getStoredSettings,
  getStoredUser,
  getToken,
  isDemoOrGuestSession,
  isGoogleAuthUser,
  clearGuestSessionFallbacks,
  restoreSupabaseAuthSession,
  subscribeAuthSession,
  needsBankSetup,
  normalizeUserSettings,
  persistLocalUserSettings,
  queueFinancialSnapshotSync,
  readCashFlowCache,
  resetLocalAppState,
  resetRemoteUserProgress,
  saveCashFlow,
  saveSession,
  saveUserSettings,
  updateStoredUser,
  withTimeout,
  writeCashFlowCache,
  type AuthUser,
  type CashFlowExpense,
  type CashFlowSnapshot,
  type UserSettings,
} from "./src/lib/auth";
import { useSoundEnabled } from "./src/lib/audioService";
import { OPEN_LESSON_EVENT } from "./src/lib/lessons";
import { cashReservesFromAccounts, reserveLinesFromBalances } from "./src/lib/bankAccounts";
import {
  DEMO_SCENARIO_APPLIED_EVENT,
  inferProfileFromBalances,
  type DemoScenarioApplyDetail,
} from "./src/lib/demoScenarios";
import {
  OPEN_FINANCIAL_ONBOARDING_EVENT,
  loadFinancialProfile,
  saveFinancialProfile,
  type FinancialProfile,
} from "./src/lib/roadmapService";
import { saveAcademyStartPhase } from "./src/lib/certificates";
import { useSafetyNetQuotes } from "./src/hooks/useSafetyNetQuotes";
import {
  SAFETY_NET_RECOMMENDED_MONTHS,
  SAFETY_NET_STARTER_MONTHS,
  computeSafetyNetTotals,
  emptySafetyNet,
  type SafetyNetConfig,
} from "./src/lib/safetyNet";
import { buildFinancialDiagnostics } from "./src/lib/financialDiagnostics";
import { geminiParamsFromDiagnostics } from "./src/lib/gemini";
import { GeminiCoachError, requestGeminiCoach } from "./src/lib/geminiCoach";
import {
  EDUCATIONAL_DISCLAIMER,
  firstNameOf,
  stripEducationalDisclaimer,
  type SproutAiFinancialSnapshot,
} from "./src/lib/sproutAi";
import {
  PLAID_CONNECTED_EVENT,
  hydrateLinkedBank,
  type PlaidLinkResult,
} from "./src/lib/plaidLink";

type TabId = "dashboard" | "retirement" | "snowball" | "lessons" | "socrates" | "profile";

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

const TABS: Array<{ id: TabId; icon: LucideIcon; label: string }> = [
  { id: "dashboard", icon: TrendingUp, label: "Investment" },
  { id: "retirement", icon: Shield, label: "Retirement" },
  { id: "snowball", icon: Wallet, label: "Cash Flow" },
  { id: "lessons", icon: BookOpen, label: "Lessons" },
  { id: "socrates", icon: Sparkles, label: "Sprout AI" },
];

const HEADER_TABS: TabId[] = ["dashboard", "retirement", "snowball", "lessons", "profile"];

const SOCRATES_MOCK_REPLY =
  "No API key yet, so I'll keep it analog: organize spending, pay down high-interest debt, then build a 3-month safety net before any investing lessons. Add GEMINI_API_KEY on the server to unlock the live Sprout AI chat.";

const GREETING_WORDS = ["hi", "hello", "hey", "yo", "hiya", "howdy", "selam", "merhaba", "hola", "sup"];

/** True for short, plain greetings ("Hi", "Hey there", "Selam") — not real questions. */
function isSimpleGreeting(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[!?.,]+$/g, "");
  if (!normalized) return false;
  const words = normalized.split(/\s+/);
  if (words.length > 3) return false;
  return GREETING_WORDS.includes(words[0]);
}

const MOBILE_FRAME_CLASS =
  "w-full max-w-md mx-auto min-h-screen bg-black shadow-2xl border-x border-slate-800";

function greetingReplies(userName: string) {
  return [
    `Hi, ${userName}! How are you doing? What are we talking about today?`,
    `Hey ${userName}! Good to see you — what's on your mind today?`,
    `Hello, ${userName}! How's everything going? What would you like to dig into?`,
  ];
}

function ChatInlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+?\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
          return (
            <strong key={index} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
          return (
            <code
              key={index}
              className="rounded-md bg-white/10 px-1 py-0.5 font-mono text-[13px] text-emerald-200"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}

function SproutChatMarkdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const heading = /^(#{1,3})\s+(.+)$/.exec(block);
        if (heading) {
          return (
            <p key={index} className="m-0 text-[15px] font-extrabold text-white">
              <ChatInlineMarkdown text={heading[2]} />
            </p>
          );
        }
        const lines = block.split("\n");
        const isList = lines.length > 0 && lines.every((line) => /^\s*(?:[-*•]|\d+\.)\s+/.test(line));
        if (isList) {
          return (
            <ul key={index} className="m-0 list-disc space-y-1 pl-4">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex} className="pl-0.5">
                  <ChatInlineMarkdown text={line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "")} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="m-0 whitespace-pre-wrap">
            <ChatInlineMarkdown text={block} />
          </p>
        );
      })}
    </div>
  );
}

function money(amount: unknown) {
  return safeFormatNumber(Math.round(toFiniteNumber(amount, 0)));
}

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

/** One editable line in the monthly spending breakdown. */
type ExpenseItem = CashFlowExpense;

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

function cashFlowPayloadKey(snapshot: Pick<CashFlowSnapshot, "monthlyIncome" | "emergencyFund" | "extraPayoff" | "expenses" | "debts" | "safetyNet">) {
  return JSON.stringify({
    monthlyIncome: snapshot.monthlyIncome,
    emergencyFund: snapshot.emergencyFund,
    extraPayoff: snapshot.extraPayoff,
    expenses: snapshot.expenses,
    debts: snapshot.debts,
    safetyNet: snapshot.safetyNet,
  });
}

const App: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [cashFlowBoot] = useState<CashFlowSnapshot>(() => emptyCashFlow());
  const [cashFlowReady, setCashFlowReady] = useState(false);
  const [emergencyFund, setEmergencyFund] = useState(cashFlowBoot.emergencyFund);
  const [safetyNet, setSafetyNet] = useState<SafetyNetConfig>(cashFlowBoot.safetyNet ?? emptySafetyNet());
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [socratesLoading, setSocratesLoading] = useState(false);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const askInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState(cashFlowBoot.monthlyIncome);
  const [cashFlowLinked, setCashFlowLinked] = useState(
    () => cashFlowBoot.monthlyIncome > 0 || cashFlowBoot.expenses.length > 0
  );
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const lastContentTabRef = useRef<TabId>("dashboard");
  const [privacyMode, setPrivacyMode] = useState(false);
  const [netWorthModalOpen, setNetWorthModalOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [soundEnabled, setSoundEnabled] = useSoundEnabled();
  const [retirementBalance, setRetirementBalance] = useState(0);
  const [financialModalOpen, setFinancialModalOpen] = useState(false);
  const [financialModalCancelable, setFinancialModalCancelable] = useState(false);
  const [financialDraft, setFinancialDraft] = useState<FinancialProfile | null>(null);
  const [demoPanelOpen, setDemoPanelOpen] = useState(false);

  // Cash Flow & Debt Management module state.
  const [expenses, setExpenses] = useState<ExpenseItem[]>(cashFlowBoot.expenses);
  const [spendingModalOpen, setSpendingModalOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(EMPTY_EXPENSE_FORM);
  const [expenseFormError, setExpenseFormError] = useState("");
  const [extraPayoff, setExtraPayoff] = useState(cashFlowBoot.extraPayoff);
  const [debts, setDebts] = useState<Debt[]>(cashFlowBoot.debts);
  const [debtAccordionOpen, setDebtAccordionOpen] = useState(false);

  // Live mirror of child-owned portfolio state, kept in sync via a callback prop so
  // Socrates AI can reference the user's real holdings.
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [holdingsReady, setHoldingsReady] = useState(false);

  // Guard mapped dashboard arrays so undefined never reaches charts/tables.
  const stocks = holdings?.filter((h): h is Extract<Holding, { kind: "stock" }> => h?.kind === "stock") || [];
  const safeHoldings = holdings || [];
  const safeExpenses = expenses || [];
  const safeDebts = debts || [];

  const userName = authUser?.name?.trim() || "Investor";
  const firstName = firstNameOf(userName);
  const profileInitials = (authUser?.name || authUser?.email || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    const settleAuthenticated = (
      payload: { token: string; user: AuthUser; settings?: UserSettings | null }
    ) => {
      if (cancelled || settled || !payload.user?.id) return;
      settled = true;
      saveSession(payload.token, payload.user);
      setCashFlowReady(false);
      setHoldingsReady(false);
      setAuthUser(payload.user);
      setUserSettings(payload.settings ?? getStoredSettings());
      setAuthChecking(false);
    };

    const settleUnauthenticated = () => {
      if (cancelled || settled) return;
      settled = true;
      try {
        clearSession();
      } catch {
        // storage may be unavailable
      }
      setAuthUser(null);
      setUserSettings(null);
      setHoldings([]);
      setHoldingsReady(false);
      setRetirementBalance(0);
      setMonthlyIncome(0);
      setEmergencyFund(0);
      setSafetyNet(emptySafetyNet());
      setExtraPayoff(0);
      setExpenses([]);
      setDebts([]);
      setCashFlowReady(true);
      setAuthChecking(false);
    };

    // Last-resort only. Must stay above OAuth / getSession restore time so we never
    // clearSession → signOut while Supabase is still restoring (redirect loop).
    const safetyTimer = window.setTimeout(() => {
      if (!cancelled && !settled) settleUnauthenticated();
    }, 10000);

    try {
      clearGuestSessionFallbacks();
    } catch {
      // Guest cleanup must not block session restore.
    }

    const unsubscribe = subscribeAuthSession((payload, event) => {
      if (cancelled) return;
      if (payload?.user?.id) {
        if (!settled) {
          settleAuthenticated(payload);
        } else {
          // Live auth updates after bootstrap — do not toggle loading.
          saveSession(payload.token, payload.user);
          setAuthUser(payload.user);
          if (payload.settings != null) setUserSettings(payload.settings);
        }
        return;
      }
      // Ignore INITIAL_SESSION / transient null while still restoring; only sign-out clears.
      if (event === "SIGNED_OUT" && settled) {
        setAuthUser(null);
        setUserSettings(null);
        setAuthChecking(false);
      }
    });

    void (async () => {
      try {
        // Await full restore — do not race a short withTimeout that kicks to login early.
        const restored = await restoreSupabaseAuthSession();
        if (cancelled || settled) return;
        if (restored?.user?.id) {
          settleAuthenticated(restored);
          return;
        }

        const token = getToken();
        const stored = getStoredUser();
        // Keep a real local session; guest/demo must log in again after cleanup.
        if (token && stored?.id && !isDemoOrGuestSession(token, stored)) {
          settleAuthenticated({ token, user: stored, settings: getStoredSettings() });
          return;
        }

        settleUnauthenticated();
      } catch {
        if (cancelled || settled) return;
        const token = getToken();
        const stored = getStoredUser();
        if (token && stored?.id && !isDemoOrGuestSession(token, stored)) {
          settleAuthenticated({ token, user: stored, settings: getStoredSettings() });
          return;
        }
        settleUnauthenticated();
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  const cashFlowHydratedJsonRef = useRef(cashFlowPayloadKey(cashFlowBoot));

  const applyCashFlow = (snapshot: CashFlowSnapshot | null | undefined) => {
    const next: CashFlowSnapshot = {
      monthlyIncome: snapshot?.monthlyIncome ?? 0,
      emergencyFund: snapshot?.emergencyFund ?? 0,
      extraPayoff: snapshot?.extraPayoff ?? 0,
      expenses: snapshot?.expenses || [],
      debts: snapshot?.debts || [],
      safetyNet: snapshot?.safetyNet ?? emptySafetyNet(),
      updatedAt: snapshot?.updatedAt ?? 0,
    };
    cashFlowHydratedJsonRef.current = cashFlowPayloadKey(next);
    setMonthlyIncome(next.monthlyIncome);
    setEmergencyFund(next.emergencyFund);
    setSafetyNet(next.safetyNet);
    setExtraPayoff(next.extraPayoff);
    setExpenses(next.expenses);
    setDebts(next.debts);
  };

  const cashFlowSnapshot = useMemo<CashFlowSnapshot>(
    () => ({
      monthlyIncome,
      emergencyFund,
      extraPayoff,
      expenses,
      debts,
      safetyNet,
      updatedAt: 0,
    }),
    [monthlyIncome, emergencyFund, extraPayoff, expenses, debts, safetyNet]
  );
  const cashFlowPersistRef = useRef({
    userId: null as string | null,
    snapshot: emptyCashFlow(),
  });
  cashFlowPersistRef.current = {
    userId: authUser?.id ?? null,
    snapshot: cashFlowSnapshot,
  };

  useEffect(() => {
    if (!authUser?.id) {
      applyCashFlow(emptyCashFlow());
      setCashFlowReady(true);
      return;
    }

    let cancelled = false;
    const cached = readCashFlowCache(authUser.id);
    applyCashFlow(cached);
    setCashFlowReady(true);

    (async () => {
      try {
        const remote = await withTimeout(fetchCashFlow(), 2000, "Cash flow");
        if (cancelled) return;
        const latest = readCashFlowCache(authUser.id);
        const live = cashFlowPersistRef.current.snapshot;
        const liveKey = cashFlowPayloadKey(live);
        const startedKey = cashFlowPayloadKey(cached);
        const remoteKey = cashFlowPayloadKey(remote);
        if (liveKey !== startedKey && liveKey !== remoteKey) {
          const pending: CashFlowSnapshot = { ...live, updatedAt: Date.now() };
          applyCashFlow(pending);
          writeCashFlowCache(pending, authUser.id);
          try {
            const saved = await saveCashFlow(pending);
            if (!cancelled) {
              writeCashFlowCache(
                { ...pending, updatedAt: saved.updatedAt || pending.updatedAt },
                authUser.id
              );
            }
          } catch {
            if (!cancelled) writeCashFlowCache(pending, authUser.id);
          }
        } else if (latest.updatedAt > remote.updatedAt) {
          applyCashFlow(latest);
          try {
            const saved = await saveCashFlow(latest);
            if (!cancelled) {
              writeCashFlowCache(
                { ...latest, updatedAt: saved.updatedAt || Date.now() },
                authUser.id
              );
            }
          } catch {
            if (!cancelled) writeCashFlowCache(latest, authUser.id);
          }
        } else {
          applyCashFlow(remote);
          writeCashFlowCache(remote, authUser.id);
        }
      } catch {
        if (!cancelled) applyCashFlow(readCashFlowCache(authUser.id));
      } finally {
        if (!cancelled) setCashFlowReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser?.id) return;
    if (cashFlowPayloadKey(cashFlowSnapshot) === cashFlowHydratedJsonRef.current) return;
    const next: CashFlowSnapshot = { ...cashFlowSnapshot, updatedAt: Date.now() };
    writeCashFlowCache(next, authUser.id);
    if (!cashFlowReady) return;
    const timer = window.setTimeout(() => {
      void saveCashFlow(next)
        .then((saved) => {
          writeCashFlowCache(
            { ...next, updatedAt: saved.updatedAt || next.updatedAt },
            authUser.id
          );
        })
        .catch(() => {
          // Keep the local cache so a refresh still restores the latest inputs.
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [cashFlowReady, authUser?.id, cashFlowSnapshot]);

  useEffect(() => {
    const flush = () => {
      const { userId, snapshot } = cashFlowPersistRef.current;
      if (!userId) return;
      if (cashFlowPayloadKey(snapshot) === cashFlowHydratedJsonRef.current) return;
      const next: CashFlowSnapshot = { ...snapshot, updatedAt: Date.now() };
      writeCashFlowCache(next, userId);
      void saveCashFlow(next).catch(() => {});
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "dashboard") setNetWorthModalOpen(false);
    if (activeTab !== "profile") lastContentTabRef.current = activeTab;
    setProfileMenuOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [profileMenuOpen]);

  const handleAuthenticated = (user: AuthUser, settings?: UserSettings | null) => {
    if (!user?.id) return;
    setCashFlowReady(false);
    setHoldingsReady(false);
    setHoldings([]);
    setAuthUser(user);
    setActiveTab("dashboard");
    setUserSettings(
      normalizeUserSettings(
        settings ?? {
          ...DEFAULT_USER_SETTINGS,
          hasCompletedOnboarding: Boolean(user.hasCompletedOnboarding),
        }
      )
    );
  };

  const openFinancialProfile = (cancelable = true) => {
    setFinancialDraft(loadFinancialProfile(authUser?.id));
    setFinancialModalCancelable(cancelable);
    setFinancialModalOpen(true);
  };

  useEffect(() => {
    const onOpen = (event: Event) => {
      const cancelable = (event as CustomEvent<{ cancelable?: boolean }>).detail?.cancelable !== false;
      openFinancialProfile(cancelable);
    };
    window.addEventListener(OPEN_FINANCIAL_ONBOARDING_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FINANCIAL_ONBOARDING_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onOpenLesson = () => setActiveTab("lessons");
    window.addEventListener(OPEN_LESSON_EVENT, onOpenLesson);
    return () => window.removeEventListener(OPEN_LESSON_EVENT, onOpenLesson);
  }, []);

  useEffect(() => {
    const onPlaidSandbox = (event: Event) => {
      const detail = (event as CustomEvent<PlaidLinkResult>).detail;
      if (!detail) return;
      const userId = getStoredUser()?.id;
      const reserves = cashReservesFromAccounts(detail.accounts);
      const linkedDebts = detail.debts?.length ? detail.debts : [];
      setEmergencyFund(reserves.liquidCash || detail.chaseChecking);
      setSafetyNet((prev) => ({
        ...prev,
        hysaCash: reserves.yieldCash || detail.marcusHysa + (detail.moneyMarket ?? 0),
        reserveLines:
          reserves.lines.length > 0
            ? reserves.lines
            : reserveLinesFromBalances({
                cash: detail.chaseChecking,
                hysa: detail.marcusHysa,
                moneyMarket: detail.moneyMarket,
              }),
      }));
      setDebts(linkedDebts);
      setMonthlyIncome(detail.monthlyIncome);
      const portfolioStocks = detail?.holdings || [];
      const linkedExpenses = detail?.expenses || [];
      setExpenses(linkedExpenses);
      setCashFlowLinked(true);
      const investments = portfolioStocks.reduce(
        (sum, lot) => sum + toFiniteNumber(lot?.shares, 0) * toFiniteNumber(lot?.buyPrice, 0),
        0
      );
      const monthlyEssentialExpenses = linkedExpenses.reduce(
        (sum, item) => sum + toFiniteNumber(item?.amount, 0),
        0
      );
      saveFinancialProfile(
        inferProfileFromBalances({
          cash: detail.chaseChecking,
          hysa: detail.marcusHysa + (detail.moneyMarket ?? 0),
          investments,
          debt: linkedDebts.reduce((sum, debt) => sum + toFiniteNumber(debt?.balance, 0), 0),
          monthlyIncome: detail.monthlyIncome,
          monthlyEssentialExpenses,
        }),
        userId
      );
      setUserSettings((prev) => {
        const next = {
          ...(prev ?? DEFAULT_USER_SETTINGS),
          hasActiveDebts: linkedDebts.length > 0,
          hasActiveInvestments: portfolioStocks.length > 0,
          hasCompletedOnboarding: true,
          hasCompletedBankSetup: true,
        };
        void saveUserSettings({
          hasActiveInvestments: next.hasActiveInvestments,
          hasActiveDebts: next.hasActiveDebts,
          wantsCapitalGrowth: next.wantsCapitalGrowth,
          wantsFinancialLiteracy: next.wantsFinancialLiteracy,
          hasCompletedOnboarding: true,
          hasCompletedBankSetup: true,
        }).catch(() => {});
        return next;
      });
      if (detail.retirement?.present && userId) {
        seedRetirementFromAssets(userId, {
          savings: detail.retirement.savings,
          accountType: detail.retirement.accountType,
          age: getStoredSettings().age ?? null,
        });
      }
    };
    window.addEventListener(PLAID_CONNECTED_EVENT, onPlaidSandbox);
    return () => window.removeEventListener(PLAID_CONNECTED_EVENT, onPlaidSandbox);
  }, []);

  useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;
    void hydrateLinkedBank((result) => {
      if (cancelled) return;
      window.dispatchEvent(new CustomEvent<PlaidLinkResult>(PLAID_CONNECTED_EVENT, { detail: result }));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  useEffect(() => {
    const onDemo = (event: Event) => {
      const detail = (event as CustomEvent<DemoScenarioApplyDetail>).detail;
      if (!detail) return;
      setEmergencyFund(detail.cash);
      setSafetyNet((prev) => ({
        ...prev,
        hysaCash: detail.hysa,
        reserveLines: reserveLinesFromBalances({ cash: detail.cash, hysa: detail.hysa }),
      }));
      setMonthlyIncome(detail.monthlyIncome);
      setDebts(detail.debts);
      setExpenses(detail.expenses);
      setCashFlowLinked(true);
      const userId = getStoredUser()?.id;
      if (detail.retirement?.present && userId) {
        seedRetirementFromAssets(userId, {
          savings: detail.retirement.savings,
          accountType: detail.retirement.accountType,
          age: getStoredSettings().age ?? null,
        });
      }
      setUserSettings((prev) => {
        const next = {
          ...(prev ?? DEFAULT_USER_SETTINGS),
          hasActiveDebts: detail.hasActiveDebts,
          hasActiveInvestments: detail.hasActiveInvestments,
          hasCompletedOnboarding: true,
          hasCompletedBankSetup: true,
        };
        void saveUserSettings({
          hasActiveInvestments: next.hasActiveInvestments,
          hasActiveDebts: next.hasActiveDebts,
          wantsCapitalGrowth: next.wantsCapitalGrowth,
          wantsFinancialLiteracy: next.wantsFinancialLiteracy,
          hasCompletedOnboarding: true,
          hasCompletedBankSetup: true,
        }).catch(() => {});
        return next;
      });
    };
    window.addEventListener(DEMO_SCENARIO_APPLIED_EVENT, onDemo);
    return () => window.removeEventListener(DEMO_SCENARIO_APPLIED_EVENT, onDemo);
  }, []);

  const persistAge = (nextAge: number, nextBirthDate: string) => {
    const previous = userSettings ?? COMPLETED_USER_SETTINGS;
    const ageNum = Number.isFinite(nextAge) ? nextAge : parseInt(String(nextAge), 10) || 20;
    const optimistic: UserSettings = {
      ...previous,
      age: ageNum,
      birthDate: nextBirthDate,
      hasCompletedOnboarding: true,
    };
    // Local-first — update React state and localStorage immediately.
    setUserSettings(optimistic);
    persistLocalUserSettings({
      hasActiveInvestments: optimistic.hasActiveInvestments,
      hasActiveDebts: optimistic.hasActiveDebts,
      wantsCapitalGrowth: optimistic.wantsCapitalGrowth,
      wantsFinancialLiteracy: optimistic.wantsFinancialLiteracy,
      hasCompletedOnboarding: true,
      hasCompletedBankSetup: previous.hasCompletedBankSetup,
      age: ageNum,
      birthDate: nextBirthDate,
    });
    // Background cloud sync — never block the UI.
    void saveUserSettings({
      hasActiveInvestments: optimistic.hasActiveInvestments,
      hasActiveDebts: optimistic.hasActiveDebts,
      wantsCapitalGrowth: optimistic.wantsCapitalGrowth,
      wantsFinancialLiteracy: optimistic.wantsFinancialLiteracy,
      hasCompletedOnboarding: true,
      hasCompletedBankSetup: previous.hasCompletedBankSetup,
      age: ageNum,
      birthDate: nextBirthDate,
    }).catch((err) => {
      console.warn("Supabase update failed, continuing with local state", err);
    });
  };

  const returnToLogin = () => {
    cashFlowHydratedJsonRef.current = cashFlowPayloadKey(emptyCashFlow());
    applyCashFlow(emptyCashFlow());
    setAuthUser(null);
    setUserSettings(null);
    setAuthChecking(false);
    setHoldings([]);
    setHoldingsReady(false);
    setRetirementBalance(0);
    setMonthlyIncome(0);
    setEmergencyFund(0);
    setSafetyNet(emptySafetyNet());
    setExtraPayoff(0);
    setExpenses([]);
    setDebts([]);
    setCashFlowLinked(false);
    setCashFlowReady(true);
    setMessages([]);
    setQuestion("");
    setActiveTab("dashboard");
    setPrivacyMode(false);
    setNetWorthModalOpen(false);
    setProfileMenuOpen(false);
    setFinancialModalOpen(false);
    setFinancialDraft(null);
    setDemoPanelOpen(false);
    setSpendingModalOpen(false);
    setExpenseFormOpen(false);
    setDebtAccordionOpen(false);
  };

  const handleLogout = () => {
    resetLocalAppState();
    returnToLogin();
  };

  const handleResetAppState = () => {
    void (async () => {
      await resetRemoteUserProgress();
      resetLocalAppState();
      returnToLogin();
    })();
  };

  const emergencyGoal = 1000;

  const categoryExpenses = useMemo(
    () => safeExpenses.reduce((sum, item) => sum + toFiniteNumber(item?.amount, 0), 0),
    [safeExpenses]
  );
  const totalDebt = useMemo(
    () => safeDebts.reduce((sum, d) => sum + toFiniteNumber(d?.balance, 0), 0),
    [safeDebts]
  );
  const activeDebts = useMemo(
    () => safeDebts.filter((d) => toFiniteNumber(d?.balance, 0) > 0),
    [safeDebts]
  );
  const totalMinPayment = useMemo(
    () => activeDebts.reduce((sum, d) => sum + toFiniteNumber(d?.minPayment, 0), 0),
    [activeDebts]
  );
  // Active debt minimums count toward monthly expenses so users never enter them twice.
  const monthlyExpenses = categoryExpenses + totalMinPayment;

  const netCashFlow = monthlyIncome - monthlyExpenses;
  const isSurplus = netCashFlow >= 0;
  const hasCashFlowInputs = monthlyIncome > 0 || safeExpenses.length > 0 || totalMinPayment > 0;
  const flowTone = !hasCashFlowInputs
    ? { value: "#F8FAFC", text: "#94A3B8", bg: "rgba(255,255,255,0.04)", border: "#1F1F1F" }
    : isSurplus
    ? SURPLUS_TONE
    : DEFICIT_TONE;
  const spendRatio = monthlyIncome > 0 ? Math.min(100, (monthlyExpenses / monthlyIncome) * 100) : 0;

  const avgApr = useMemo(() => {
    if (totalDebt <= 0) return 0;
    return (
      safeDebts.reduce(
        (sum, d) => sum + toFiniteNumber(d?.balance, 0) * toFiniteNumber(d?.apr, 0),
        0
      ) / totalDebt
    );
  }, [safeDebts, totalDebt]);

  // Snowball focus: every extra dollar lands on the smallest remaining balance.
  const focusDebt = useMemo(
    () =>
      safeDebts
        .filter((d) => toFiniteNumber(d?.balance, 0) > 0)
        .sort(
          (a, b) =>
            toFiniteNumber(a?.balance, 0) - toFiniteNumber(b?.balance, 0) ||
            toFiniteNumber(b?.apr, 0) - toFiniteNumber(a?.apr, 0)
        )[0] ?? null,
    [safeDebts]
  );

  // Live portfolio context — real holdings, so Socrates can answer "which stocks do I own?" accurately.
  const portfolioContext = useMemo(() => {
    if (safeHoldings.length === 0) return "No investments or connected accounts yet.";
    const totalValue = safeHoldings.reduce((sum, h) => {
      if (h?.kind === "stock") {
        return sum + toFiniteNumber(h?.quantity, 0) * toFiniteNumber(h?.currentPrice, 0);
      }
      return sum + toFiniteNumber(h?.balance, 0);
    }, 0);
    const lines = safeHoldings.map((h) => {
      if (h?.kind === "stock") {
        const qty = toFiniteNumber(h?.quantity, 0);
        const price = toFiniteNumber(h?.currentPrice, 0);
        const dayPct = toFiniteNumber(h?.dayChangePct, 0);
        return `${h.symbol} (${h.description}, ${h.account === "verified" ? "Verified Brokerage" : "Paper Account"}): ${qty} shares @ $${price.toFixed(2)} = $${money(
          qty * price
        )} (today ${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}%)`;
      }
      return `${h.name} (${h.account === "verified" ? "Verified Brokerage" : "Paper Account"} balance): $${money(h?.balance)}`;
    });
    return `Total portfolio value: $${money(totalValue)}. Investment achievement badges only count Verified Brokerage holdings; Paper Account lots are excluded. Holdings:\n- ${lines.join("\n- ")}`;
  }, [safeHoldings]);

  const stockHoldingsValue = useMemo(
    () =>
      stocks.reduce(
        (sum, h) => sum + toFiniteNumber(h?.quantity, 0) * toFiniteNumber(h?.currentPrice, 0),
        0
      ),
    [stocks]
  );
  const brokerCashValue = useMemo(
    () =>
      safeHoldings
        .filter((h) => h?.kind === "broker")
        .reduce((sum, h) => sum + toFiniteNumber(h?.balance, 0), 0),
    [safeHoldings]
  );
  const { goldPricePerOz, bondPrices, loading: safetyQuotesLoading } = useSafetyNetQuotes(safetyNet);
  const safetyTotals = useMemo(
    () =>
      computeSafetyNetTotals({
        cash: emergencyFund,
        portfolioValue: stockHoldingsValue,
        config: safetyNet,
        goldPricePerOz,
        bondPrices,
      }),
    [emergencyFund, stockHoldingsValue, safetyNet, goldPricePerOz, bondPrices]
  );
  const liquidCashValue = brokerCashValue + Math.max(0, emergencyFund);
  const hysaCashValue = Math.max(0, safetyNet.hysaCash ?? 0);
  const availableCash = liquidCashValue + hysaCashValue;
  const netWorth =
    stockHoldingsValue + retirementBalance + liquidCashValue + hysaCashValue + safetyTotals.gold + safetyTotals.bonds;

  useEffect(() => {
    if (!authUser?.id || !cashFlowReady) return;
    queueFinancialSnapshotSync({
      cashBalance: availableCash,
      debt: totalDebt,
      investmentAssets: stockHoldingsValue,
      monthlyIncome,
    });
  }, [authUser?.id, cashFlowReady, availableCash, totalDebt, stockHoldingsValue, monthlyIncome]);

  useEffect(() => {
    if (!authUser) return;
    const userId = authUser.id;
    const refresh = () => {
      evaluateTrophies({
        userId,
        holdings: safeHoldings,
        netWorth,
        portfolioValue: stockHoldingsValue,
        retirementDeposits: getRetirementDepositCount(userId),
        safetyNetValue: safetyTotals.total,
        monthlyExpenses,
        holdingsReady,
      });
    };
    refresh();
    window.addEventListener(RETIREMENT_UPDATED_EVENT, refresh);
    window.addEventListener(STREAK_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(RETIREMENT_UPDATED_EVENT, refresh);
      window.removeEventListener(STREAK_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [authUser, safeHoldings, holdingsReady, netWorth, stockHoldingsValue, safetyTotals.total, monthlyExpenses]);

  // Live debt context — real debts, so Socrates can answer "how's my debt payoff going?" accurately.
  const debtContext = useMemo(() => {
    if (safeDebts.length === 0) return "No active debts — currently debt-free.";
    const lines = safeDebts.map(
      (d) => `${d.title}: $${money(d.balance)} remaining of $${money(d.originalBalance)}, ${d.apr}% APR, $${money(d.minPayment)}/mo minimum`
    );
    return `Total remaining debt: $${money(totalDebt)} across ${safeDebts.length} debt(s):\n- ${lines.join("\n- ")}`;
  }, [safeDebts, totalDebt]);

  // Live cash-flow context from the Cash Flow & Debt Management module.
  const cashFlowContext = useMemo(() => {
    const categoryBreakdown =
      safeExpenses.length === 0
        ? "No spending categories tracked yet."
        : `Spending breakdown: ${safeExpenses
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
    safeExpenses,
    monthlyIncome,
    monthlyExpenses,
    categoryExpenses,
    totalMinPayment,
    activeDebts,
    isSurplus,
    netCashFlow,
  ]);

  const financialDiagnostics = useMemo(() => {
    const profile = authUser?.id ? loadFinancialProfile(authUser.id) : loadFinancialProfile();
    return buildFinancialDiagnostics({
      income: monthlyIncome,
      expenses: safeExpenses.map((item) => ({
        id: item.id,
        label: item.label,
        amount: toFiniteNumber(item.amount, 0),
      })),
      creditDebt: totalDebt,
      preferPlaid: cashFlowLinked,
      profile: profile
        ? {
            monthlyIncome: profile.monthlyIncome,
            monthlyEssentialExpenses: profile.monthlyEssentialExpenses,
            creditDebt: totalDebt,
          }
        : null,
    });
  }, [authUser?.id, monthlyIncome, safeExpenses, totalDebt, cashFlowLinked]);

  const geminiFinancialParams = useMemo(
    () =>
      geminiParamsFromDiagnostics(financialDiagnostics, {
        userName: firstName,
        debt: Math.max(financialDiagnostics.creditDebt, totalDebt),
      }),
    [financialDiagnostics, firstName, totalDebt]
  );

  const educationalSnapshot = useMemo<SproutAiFinancialSnapshot>(() => {
    const safetyNetMonths = monthlyExpenses > 0 ? safetyTotals.total / monthlyExpenses : null;
    const highestApr =
      safeDebts.length === 0 ? null : Math.max(...safeDebts.map((d) => toFiniteNumber(d?.apr, 0)));
    return {
      userName: firstName,
      cash: {
        liquidCash: safetyTotals.liquidCash,
        hysaCash: safetyTotals.hysaCash,
        safetyNetTotal: safetyTotals.total,
        safetyNetMonths,
        starterCashGoal: emergencyGoal,
        starterMonths: SAFETY_NET_STARTER_MONTHS,
        recommendedMonths: SAFETY_NET_RECOMMENDED_MONTHS,
        recommendedGoal: monthlyExpenses * SAFETY_NET_RECOMMENDED_MONTHS,
      },
      debt: {
        total: totalDebt,
        count: safeDebts.length,
        highestApr,
        focusTitle: focusDebt?.title ?? null,
        summary: debtContext,
      },
      spending: {
        monthlyIncome: financialDiagnostics.income || monthlyIncome,
        monthlyExpenses: financialDiagnostics.recurringExpenses || monthlyExpenses,
        netCashFlow: financialDiagnostics.netCashFlow,
        isSurplus: financialDiagnostics.isSurplus,
        categories: financialDiagnostics.categories.map((item) => ({
          label: item.label,
          amount: item.amount,
        })),
        summary: cashFlowContext,
      },
    };
  }, [
    firstName,
    safetyTotals.liquidCash,
    safetyTotals.hysaCash,
    safetyTotals.total,
    monthlyExpenses,
    emergencyGoal,
    safeDebts,
    totalDebt,
    focusDebt?.title,
    debtContext,
    monthlyIncome,
    financialDiagnostics,
    cashFlowContext,
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
      const replies = greetingReplies(firstName);
      const reply = replies[Math.floor(Math.random() * replies.length)];
      window.setTimeout(() => {
        setMessages((prev) => [...prev, createChatMessage("socrates", reply)]);
        setSocratesLoading(false);
      }, 450);
      return;
    }

    let draftId: string | null = null;
    try {
      const history = thread
        .slice(-12)
        .map((msg) => `${msg.sender === "user" ? "User" : "Sprout AI"}: ${msg.text}`)
        .join("\n");
      const applyCoachText = (text: string) => {
        if (!draftId) {
          const draft = createChatMessage("socrates", text);
          draftId = draft.id;
          setSocratesLoading(false);
          setMessages((prev) => [...prev, draft]);
          return;
        }
        const id = draftId;
        setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, text } : msg)));
      };

      const text = await requestGeminiCoach(
        {
          snapshot: educationalSnapshot,
          conversation: history,
          portfolioContext,
          financial: geminiFinancialParams,
        },
        { stream: true, onDelta: applyCoachText }
      );
      applyCoachText(text);
    } catch (err) {
      const fallback =
        err instanceof GeminiCoachError && (err.code === "unavailable" || err.status === 503)
          ? SOCRATES_MOCK_REPLY
          : err instanceof GeminiCoachError && err.code === "rate_limit"
            ? "Sprout AI hit a request limit. Give it a minute, then ask again — I can still help with spending, debt, or your safety net."
            : err instanceof GeminiCoachError && err.code === "timeout"
              ? "That took too long. Try a shorter question — I can still help with spending, debt, or your safety net."
              : `Couldn't reach Gemini just now. Organize spending, work high-interest debt, then grow a 3-month safety net — and try again in a minute.`;
      if (draftId) {
        const id = draftId;
        setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, text: fallback } : msg)));
      } else {
        setMessages((prev) => [...prev, createChatMessage("socrates", fallback)]);
      }
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

  // Auth / bootstrap gate: never mount dashboard screens until session + initial data resolve.
  if (authChecking) {
    return (
      <div className={MOBILE_FRAME_CLASS}>
        <LoadingSpinner fullScreen label="Checking your session…" />
      </div>
    );
  }

  if (!authUser?.id) {
    return (
      <div className={MOBILE_FRAME_CLASS}>
        <ErrorBoundary label="sign in">
          <Suspense fallback={<LoadingSpinner fullScreen label="Loading…" />}>
            <AuthScreen onAuthenticated={handleAuthenticated} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  // Wait for cash-flow hydrate so expense/debt arrays are never undefined on first paint.
  if (!cashFlowReady) {
    return (
      <div className={MOBILE_FRAME_CLASS}>
        <LoadingSpinner fullScreen label="Loading your account…" />
      </div>
    );
  }

  const resolvedSettings = userSettings ?? DEFAULT_USER_SETTINGS;

  if (!resolvedSettings.hasCompletedOnboarding) {
    return (
      <div className={MOBILE_FRAME_CLASS}>
        <ErrorBoundary label="onboarding">
          <Suspense fallback={<LoadingSpinner fullScreen label="Loading onboarding…" />}>
            <OnboardingScreen
              initialName={authUser.name}
              initialBirthDate={resolvedSettings.birthDate ?? ""}
              skipNameStep={isGoogleAuthUser(authUser)}
              onComplete={(name, settings) => {
                const nextUser = updateStoredUser({ name, hasCompletedOnboarding: true }) ?? {
                  ...authUser,
                  name,
                  hasCompletedOnboarding: true,
                };
                saveSession(getToken() || "local-demo", nextUser);
                setAuthUser(nextUser);
                // Local settings already include user_age / onboarding_complete from OnboardingScreen.
                // Skip forcing bank gate when onboarding keys say we're done — land on dashboard.
                const nextSettings = persistLocalUserSettings({
                  ...settings,
                  hasCompletedOnboarding: true,
                  // Bank step remains available later; do not block the main dashboard.
                  hasCompletedBankSetup: true,
                });
                setUserSettings(nextSettings);
                setActiveTab("dashboard");
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  if (needsBankSetup(resolvedSettings)) {
    return (
      <div className={MOBILE_FRAME_CLASS}>
        <ErrorBoundary label="bank setup">
          <Suspense fallback={<LoadingSpinner fullScreen label="Loading bank setup…" />}>
            <BankConnectionScreen
              currentSettings={resolvedSettings}
              onComplete={(settings) => {
                setUserSettings(settings);
                setActiveTab("dashboard");
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  const sproutChat = (
    <div className="matter-tab-panel flex h-full min-h-0 flex-1 flex-col bg-black">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/5 bg-black/80 px-4 py-3 backdrop-blur-md">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-800 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
          aria-hidden="true"
        >
          <Sparkles size={16} color="#ECFDF5" />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-[15px] font-extrabold tracking-tight text-white">Sprout AI</p>
          <p className="m-0 truncate text-[12px] font-semibold text-slate-400">Personal Finance Educational Coach</p>
        </div>
      </div>

      <div
        ref={chatLogRef}
        className="matter-touch-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5"
        aria-live="polite"
      >
        {messages.length === 0 && !socratesLoading && (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-4 text-center">
            <div
              className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-800 shadow-[0_0_0_4px_rgba(16,185,129,0.16)]"
              aria-hidden="true"
            >
              <Sparkles size={22} color="#ECFDF5" />
            </div>
            <p className="mt-4 text-[22px] font-extrabold tracking-tight text-white">Hey {firstName}</p>
            <p className="mt-2 max-w-[280px] text-[14px] font-medium leading-relaxed text-slate-400">
              Ask about budgeting, compound interest, or debt. Educational guidance only — never stock picks or tax
              advice.
            </p>
          </div>
        )}
        {(messages ?? []).map((msg = {} as any) => {
          if (!msg) return null;
          const isUser = msg.sender === "user";
          if (isUser) {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[82%] rounded-2xl rounded-br-md bg-gradient-to-br from-emerald-600 to-emerald-950 px-3.5 py-2.5 text-[15px] leading-relaxed text-white shadow-[0_10px_24px_rgba(6,78,59,0.35)]">
                  <p className="m-0 whitespace-pre-wrap break-words">{msg.text}</p>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className="flex items-start gap-2.5">
              <div
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-800"
                aria-hidden="true"
              >
                <Sparkles size={12} color="#ECFDF5" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5 text-[15px] leading-relaxed text-slate-100">
                <SproutChatMarkdown text={stripEducationalDisclaimer(msg.text)} />
                <p className="mt-2 text-[10px] font-semibold italic leading-snug text-slate-500">
                  {EDUCATIONAL_DISCLAIMER}
                </p>
              </div>
            </div>
          );
        })}
        {socratesLoading && (
          <div className="flex items-start gap-2.5">
            <div
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-800"
              aria-hidden="true"
            >
              <Sparkles size={12} color="#ECFDF5" />
            </div>
            <p className="m-0 pt-1 text-[14px] font-semibold italic text-emerald-300/80">Sprout AI is thinking…</p>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-white/5 bg-black/95 px-3 pb-2.5 pt-2 backdrop-blur-md">
        <div className="flex items-end gap-2">
          <textarea
            ref={askInputRef}
            className="matter-ask-input min-h-12 max-h-[129px] w-full flex-1 resize-none rounded-[26px] border border-[#262626] bg-[#121212] px-4 py-3 text-[16px] leading-snug text-slate-50 outline-none placeholder:text-slate-500 focus:border-emerald-500/50"
            rows={1}
            value={question}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuestion(e.target.value)}
            onKeyDown={onAskKeyDown}
            placeholder="Ask Sprout AI…"
            aria-label="Ask Sprout AI"
            disabled={socratesLoading}
          />
          <button
            type="button"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-500 text-[#042F2E] shadow-[0_8px_20px_rgba(16,185,129,0.28)] transition enabled:active:scale-95 disabled:opacity-45"
            onClick={() => void askSocrates()}
            disabled={socratesLoading || !question.trim()}
            aria-label="Send message"
          >
            <ArrowUp size={20} strokeWidth={2.4} />
          </button>
        </div>
        <p className="mb-0 mt-2 text-center text-[10px] font-semibold italic leading-snug text-slate-500">
          {EDUCATIONAL_DISCLAIMER}
        </p>
      </div>
    </div>
  );

  return (
    <ErrorBoundary label="your dashboard">
    <Suspense fallback={<LoadingSpinner fullScreen label="Loading your dashboard…" />}>
    <div className={`${MOBILE_FRAME_CLASS}${activeTab === "socrates" ? " h-[100dvh] overflow-hidden" : ""}`}>
      <div
        style={{
          ...styles.page,
          ...(activeTab === "socrates"
            ? {
                height: "100%",
                maxHeight: "100%",
                overflow: "hidden",
                paddingTop: 0,
                paddingLeft: 0,
                paddingRight: 0,
                paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
                display: "flex",
                flexDirection: "column",
              }
            : {}),
        }}
      >
      <style>{css}</style>
      <AchievementBanner userName={userName} />
      <CertificateCelebration />
      <FinancialOnboardingModal
        key={financialModalOpen ? (financialDraft?.updatedAt ?? "create") : "closed"}
        open={financialModalOpen}
        allowCancel={financialModalCancelable}
        initialAnswers={financialDraft}
        onClose={() => setFinancialModalOpen(false)}        onComplete={(roadmap) => {
          saveAcademyStartPhase(authUser.id, roadmap.recommendedPhaseId);
        }}
      />
      {import.meta.env.DEV && activeTab !== "socrates" ? (
        <div className="fixed bottom-[76px] left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 justify-end px-3">
          <div className="flex max-w-[min(92vw,360px)] flex-col items-end gap-2">
            {demoPanelOpen ? (
              <div className="w-[min(92vw,360px)]">
                <DemoScenarioSwitcher compact onApplied={() => setDemoPanelOpen(false)} />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setDemoPanelOpen((open) => !open)}
              className="rounded-full border border-emerald-500/40 bg-[#0A0A0A] px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-300 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            >
              {demoPanelOpen ? "Close demo" : "Demo bank"}
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={
          activeTab === "socrates"
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "overflow-y-auto overscroll-auto"
        }
        style={{ WebkitOverflowScrolling: "touch", pointerEvents: "auto" }}
      >
      <div
        style={{
          ...styles.shell,
          ...(activeTab === "socrates"
            ? { flex: 1, minHeight: 0, maxWidth: "100%", height: "100%", gap: 0 }
            : {}),
        }}
      >
        {HEADER_TABS.includes(activeTab) && (
          <header style={styles.investHeader}>
            <p style={styles.brandLogo}>Sprout</p>
            <div style={styles.headerActions}>
              {activeTab === "dashboard" && (
                <button
                  type="button"
                  style={styles.netWorthBtn}
                  aria-label="Open secure net worth breakdown"
                  aria-haspopup="dialog"
                  aria-expanded={netWorthModalOpen}
                  title="Open secure Net Worth breakdown"
                  onClick={() => setNetWorthModalOpen(true)}
                >
                  <Shield size={18} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
              <button type="button" style={styles.notifBtn} aria-label="Notifications">
                <Bell size={20} strokeWidth={1.75} />
              </button>
              <div ref={profileMenuRef} style={styles.profileMenuWrap}>
                <button
                  type="button"
                  style={{
                    ...styles.profileBtn,
                    ...(activeTab === "profile" || profileMenuOpen ? styles.profileBtnActive : {}),
                  }}
                  aria-label="Profile menu"
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  aria-current={activeTab === "profile" ? "page" : undefined}
                  title={authUser.name || "Profile"}
                  onClick={() => setProfileMenuOpen((open) => !open)}
                >
                  {authUser.avatarUrl ? (
                    <img
                      src={authUser.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      style={styles.profileBtnImg}
                    />
                  ) : (
                    <span style={styles.profileBtnInitials}>{profileInitials}</span>
                  )}
                </button>
                {profileMenuOpen ? (
                  <div role="menu" aria-label="Profile settings" className="matter-pop" style={styles.profileMenu}>
                    <button
                      type="button"
                      role="menuitem"
                      className="matter-profile-menu-item"
                      style={styles.profileMenuItem}
                      onClick={() => {
                        setProfileMenuOpen(false);
                        if (activeTab === "profile") {
                          const previous = lastContentTabRef.current;
                          setActiveTab(previous === "profile" ? "dashboard" : previous);
                          return;
                        }
                        setActiveTab("profile");
                      }}
                    >
                      <User size={15} color="#10B981" />
                      <span style={styles.profileMenuLabel}>
                        {activeTab === "profile" ? "Close profile" : "Profile"}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="matter-profile-menu-item"
                      style={styles.profileMenuItem}
                      aria-pressed={soundEnabled}
                      onClick={() => setSoundEnabled(!soundEnabled)}
                    >
                      {soundEnabled ? (
                        <Volume2 size={15} color="#10B981" />
                      ) : (
                        <VolumeX size={15} color="#9CA3AF" />
                      )}
                      <span style={styles.profileMenuLabel}>Sound</span>
                      <span
                        style={{
                          ...styles.profileMenuSoundChip,
                          color: soundEnabled ? "#10B981" : "#9CA3AF",
                          borderColor: soundEnabled ? "rgba(16, 185, 129, 0.35)" : "#2A2A2A",
                          background: soundEnabled ? "rgba(16, 185, 129, 0.12)" : "#111111",
                        }}
                      >
                        {soundEnabled ? "On" : "Off"}
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>
        )}

        {netWorthModalOpen && (
          <div
            style={styles.modalOverlay}
            onClick={() => setNetWorthModalOpen(false)}
            role="presentation"
          >
            <div
              className="matter-pop"
              style={styles.netWorthModal}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="net-worth-modal-title"
            >
              <div style={styles.spendingModalHead}>
                <div style={styles.spendingModalTitleRow}>
                  <span style={{ ...styles.spendingModalIcon, fontSize: 18 }} aria-hidden="true">
                    <Lock size={16} strokeWidth={2.25} />
                  </span>
                  <div>
                    <h3 id="net-worth-modal-title" style={styles.spendingModalTitle}>
                      Total Net Worth
                    </h3>
                    <p style={styles.spendingModalSub}>Secure breakdown — checking and HYSA are listed separately</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNetWorthModalOpen(false)}
                  aria-label="Close net worth breakdown"
                  style={styles.iconBtn}
                >
                  <X size={15} />
                </button>
              </div>

              <p style={styles.netWorthModalTotal}>
                {privacyMoney(false, netWorth)}
              </p>

              <ul style={styles.netWorthBreakdown}>
                <li style={styles.netWorthRow}>
                  <span style={styles.netWorthRowLabel}>
                    <TrendingUp size={14} aria-hidden="true" /> Portfolio Value
                  </span>
                  <span style={styles.netWorthRowValue}>
                    {privacyMoney(false, stockHoldingsValue)}
                  </span>
                </li>
                <li style={styles.netWorthRow}>
                  <span style={styles.netWorthRowLabel}>
                    <Shield size={14} aria-hidden="true" /> Retirement Savings
                  </span>
                  <span style={styles.netWorthRowValue}>
                    {privacyMoney(false, retirementBalance)}
                  </span>
                </li>
                <li style={styles.netWorthRow}>
                  <span style={styles.netWorthRowLabel}>
                    <Banknote size={14} aria-hidden="true" /> Checking / Liquid Cash
                  </span>
                  <span style={styles.netWorthRowValue}>
                    {privacyMoney(false, liquidCashValue)}
                  </span>
                </li>
                <li style={styles.netWorthRow}>
                  <span style={styles.netWorthRowLabel}>
                    <Landmark size={14} aria-hidden="true" /> HYSA (High-Yield Savings)
                  </span>
                  <span style={styles.netWorthRowValue}>
                    {privacyMoney(false, hysaCashValue)}
                  </span>
                </li>
                {safetyTotals.gold > 0 && (
                  <li style={styles.netWorthRow}>
                    <span style={styles.netWorthRowLabel}>
                      <Coins size={14} aria-hidden="true" /> Gold
                    </span>
                    <span style={styles.netWorthRowValue}>
                      {privacyMoney(false, safetyTotals.gold)}
                    </span>
                  </li>
                )}
                {safetyTotals.bonds > 0 && (
                  <li style={styles.netWorthRow}>
                    <span style={styles.netWorthRowLabel}>
                      <ScrollText size={14} aria-hidden="true" /> Bonds / T-bills
                    </span>
                    <span style={styles.netWorthRowValue}>
                      {privacyMoney(false, safetyTotals.bonds)}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        <div
          className={activeTab === "dashboard" ? "matter-tab-panel" : undefined}
          style={{
            ...styles.tabPanel,
            display: activeTab === "dashboard" ? undefined : "none",
          }}
        >
          <ErrorBoundary label="portfolio">
            <Suspense fallback={<LoadingSpinner label="Loading portfolio…" />}>
              <InvestmentScreen
                key={authUser.id}
                holdings={safeHoldings}
                totalPortfolioValue={stockHoldingsValue}
                onHoldingsChange={(next) => {
                  setHoldings(next || []);
                  setHoldingsReady(true);
                }}
                onConsultSocrates={() => setActiveTab("socrates")}
                cashBalance={emergencyFund}
                privacyMode={privacyMode}
                onTogglePrivacy={() => setPrivacyMode((v) => !v)}
              />
            </Suspense>
          </ErrorBoundary>
        </div>

        <div
          className={activeTab === "retirement" ? "matter-tab-panel" : undefined}
          style={{
            ...styles.tabPanel,
            display: activeTab === "retirement" ? undefined : "none",
          }}
          aria-hidden={activeTab !== "retirement"}
        >
          <ErrorBoundary label="retirement">
            <Suspense fallback={<LoadingSpinner label="Loading retirement…" />}>
              <RetirementScreen
                key={authUser.id}
                visible={activeTab === "retirement"}
                userId={authUser.id}
                age={userSettings?.age ?? null}
                birthDate={userSettings?.birthDate ?? null}
                onAgeChange={(nextAge, nextBirthDate) => {
                  void persistAge(nextAge, nextBirthDate);
                }}
                onBalanceChange={setRetirementBalance}
              />
            </Suspense>
          </ErrorBoundary>
        </div>

        {activeTab === "snowball" && (
          <div className="matter-tab-panel" style={styles.tabPanel} aria-busy={!cashFlowReady}>
            <CashFlowScreen
              holdings={safeHoldings}
              privacyMode={privacyMode}
            />

            {/* 1. One panel: earnings in, spendings out, net result. */}
            <article
              style={{ ...styles.flowPanel, borderColor: flowTone.border }}
              aria-label="Monthly cash flow"
            >
              <div style={styles.flowPanelHead}>
                <p style={styles.sectionLabel}>
                  Monthly Cash Flow
                  {cashFlowLinked ? (
                    <span style={{ marginLeft: 8, color: "#6EE7B7", fontSize: 10, letterSpacing: "0.08em" }}>
                      FROM BANK
                    </span>
                  ) : null}
                </p>
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
                  <button
                    type="button"
                    onClick={openSpendingModal}
                    className="matter-spend-trigger"
                    style={{ ...styles.flowAmount, color: EXPENSE_RED }}
                    aria-label="Open spending breakdown"
                    aria-haspopup="dialog"
                    aria-expanded={spendingModalOpen}
                    aria-controls="spending-breakdown-dialog"
                  >
                    <span>${money(monthlyExpenses)}</span>
                    <ChevronRight size={18} strokeWidth={2.5} className="matter-spend-trigger-arrow" aria-hidden />
                  </button>
                  <p style={styles.flowCellHint}>
                    {safeExpenses.length === 0 && totalMinPayment <= 0
                      ? "No categories yet"
                      : [
                          safeExpenses.length > 0
                            ? `${safeExpenses.length} ${safeExpenses.length === 1 ? "category" : "categories"}`
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
                  : cashFlowLinked
                    ? "Imported from your connected bank. Edit any number if you want to override it."
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
                  id="spending-breakdown-dialog"
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
                    {safeExpenses.length === 0 && activeDebts.length === 0 ? (
                      <div style={styles.emptyExpenses}>
                        Nothing tracked yet. Add rent, groceries, utilities, subscriptions — anything
                        that leaves your account each month. Debt minimums from Active Debt Payoff are
                        included automatically.
                      </div>
                    ) : (
                      <ul style={styles.expenseList}>
                        {(safeExpenses ?? []).map((item = {} as any) => {
                          if (!item) return null;
                          const amount = toFiniteNumber(
                            (item as any).total_value ?? (item as any).value ?? item.amount,
                            0
                          );
                          return (
                          <ExpenseRow
                            key={item.id}
                            item={item}
                            share={
                              monthlyExpenses > 0
                                ? (amount / monthlyExpenses) * 100
                                : 0
                            }
                            onAmountChange={(next) => setExpenseAmount(item.id, next)}
                            onRemove={() => removeExpense(item.id)}
                          />
                          );
                        })}
                        {(activeDebts ?? []).map((debt = {} as any) => {
                          if (!debt) return null;
                          const minPayment = toFiniteNumber(debt.minPayment, 0);
                          return (
                          <DebtPaymentRow
                            key={debt.id}
                            debt={debt}
                            share={
                              monthlyExpenses > 0
                                ? (minPayment / monthlyExpenses) * 100
                                : 0
                            }
                          />
                          );
                        })}
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

                  <div className="mt-3 grid grid-cols-3 gap-1.5 min-[400px]:gap-2">
                    <div className="min-w-0 rounded-xl border border-neutral-800 bg-black/40 px-2 py-2 min-[400px]:px-2.5">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-neutral-500">Total Debt</p>
                      <p className="mt-1 truncate text-sm font-extrabold tracking-tight text-white">${money(totalDebt)}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-neutral-800 bg-black/40 px-2 py-2 min-[400px]:px-2.5">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-neutral-500">Minimums</p>
                      <p className="mt-1 truncate text-sm font-extrabold tracking-tight text-white">
                        ${money(totalMinPayment)}
                        <span className="text-[10px] font-semibold text-neutral-500">/mo</span>
                      </p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-neutral-800 bg-black/40 px-2 py-2 min-[400px]:px-2.5">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                        <span className="min-[400px]:hidden">APR</span>
                        <span className="hidden min-[400px]:inline">Avg Interest</span>
                      </p>
                      <p className="mt-1 truncate text-sm font-extrabold tracking-tight text-[#10B981]">
                        {safeDebts.length === 0 ? "—" : `${avgApr.toFixed(1)}%`}
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
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <p className="min-w-0 text-[11px] font-semibold text-neutral-500">
                          {safeDebts.length > 0
                            ? "From connected cards & loans"
                            : "Balances sync from your bank"}
                        </p>
                        {safeDebts.length > 0 ? (
                          <span className="flex-shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-300">
                            Auto
                          </span>
                        ) : null}
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

                      {safeDebts.length === 0 ? (
                        <div style={styles.emptyDebts}>
                          No credit cards or loans on your connected accounts. Active Debt Payoff
                          fills in automatically when a card or loan is linked.
                        </div>
                      ) : (
                        <div style={styles.debtList}>
                          {(safeDebts ?? []).map((debt = {} as any) => {
                            if (!debt) return null;
                            return (
                            <DebtPayoffCard
                              key={debt.id}
                              debt={debt}
                              isFocus={debt.id === focusDebt?.id}
                              extraPayoff={extraPayoff}
                              onLogPayment={() => logDebtPayment(debt.id)}
                            />
                            );
                          })}
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

            <FinancialHealthCard
              diagnostics={financialDiagnostics}
              privacyMode={privacyMode}
              className="mt-3"
            />

            {/* 4. Multi-asset safety net, sized off the real spending total. */}
            <SafetyNetSection
              holdings={safeHoldings}
              monthlyExpenses={monthlyExpenses}
              cash={emergencyFund}
              onCashChange={setEmergencyFund}
              config={safetyNet}
              onConfigChange={setSafetyNet}
              goldPricePerOz={goldPricePerOz}
              bondPrices={bondPrices}
              quotesLoading={safetyQuotesLoading}
              privacyMode={privacyMode}
            />
          </div>
        )}

        <div
          className={activeTab === "lessons" ? "matter-tab-panel" : undefined}
          style={{
            ...styles.tabPanel,
            display: activeTab === "lessons" ? undefined : "none",
          }}
          aria-hidden={activeTab !== "lessons"}
        >
          <LessonsScreen
            active={activeTab === "lessons"}
            onOpenPaperPortfolio={() => setActiveTab("dashboard")}
          />
        </div>

        {activeTab === "socrates" && sproutChat}

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
            settings={resolvedSettings}
            onSettingsChange={setUserSettings}
            onLogout={handleLogout}
            onResetAppState={handleResetAppState}
            holdings={safeHoldings}
            holdingsReady={holdingsReady}
            netWorth={netWorth}
            portfolioValue={stockHoldingsValue}
            safetyNetValue={safetyTotals.total}
            monthlyExpenses={monthlyExpenses}
            onEditFinancialProfile={() => openFinancialProfile(true)}
          />
        </div>

        {activeTab !== "socrates" && activeTab !== "profile" && (
        <footer style={styles.footer}>Sprout · Built for the US · Stay consistent</footer>
        )}
      </div>

      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-neutral-800/60 bg-black"
      >
        <div style={styles.tabBar}>
          {TABS.map((tab) => {
            if (!tab) return null;
            const active = activeTab === tab.id;
            const TabIcon = tab.icon;
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
                <span style={styles.tabEmoji}>
                  <TabIcon size={16} strokeWidth={2.15} aria-hidden="true" />
                </span>
                <span style={styles.tabLabel}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      </div>
      </div>
    </div>
    </Suspense>
    </ErrorBoundary>
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
  if (!item) return null;
  const amount = toFiniteNumber(
    (item as any).total_value ?? (item as any).value ?? item.amount,
    0
  );
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
          value={amount}
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
  if (!debt) return null;
  const minPayment = toFiniteNumber(debt.minPayment, 0);
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
        <span style={styles.expenseLockedAmount}>{money(minPayment)}</span>
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
}: {
  debt: Debt;
  isFocus: boolean;
  extraPayoff: number;
  onLogPayment: () => void;
}) {
  if (!debt) return null;
  const balance = toFiniteNumber(debt.balance ?? (debt as any).value ?? (debt as any).total_value, 0);
  const originalBalance = toFiniteNumber(debt.originalBalance, 0);
  const apr = toFiniteNumber(debt.apr, 0);
  const minPayment = toFiniteNumber(debt.minPayment, 0);
  const isPaid = balance <= 0;
  const paidPct =
    originalBalance > 0
      ? Math.min(100, Math.round(((originalBalance - balance) / originalBalance) * 100))
      : 0;
  const monthlyPayment = minPayment + (isFocus && !isPaid ? extraPayoff : 0);
  const payoffMonths = monthsToPayoff(balance, apr, monthlyPayment);
  const interestPerMonth = (balance * apr) / 100 / 12;
  const tone = aprTone(apr);

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
              {apr > 0 ? `${apr}% APR` : "0% APR"}
            </span>
            {isFocus && !isPaid && <span style={styles.focusChip}>Paying now</span>}
            {isPaid && (
              <span style={styles.paidChip}>
                <Check size={11} aria-hidden="true" /> Paid off
              </span>
            )}
            <span style={styles.bankChip}>From bank</span>
          </div>
        </div>
      </div>

      <div style={styles.debtBalanceRow}>
        <p style={styles.debtBalance}>${money(balance)}</p>
        <p style={styles.debtOriginal}>of ${money(originalBalance)}</p>
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
    padding: "max(16px, env(safe-area-inset-top, 0px)) 16px calc(96px + env(safe-area-inset-bottom, 0px))",
    boxSizing: "border-box",
    overflowX: "hidden",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    overscrollBehaviorY: "auto",
    touchAction: "pan-y",
    pointerEvents: "auto",
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
    flexWrap: "wrap",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  netWorthBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    border: "1px solid #1F1F1F",
    background: "#0A0A0A",
    color: "#10B981",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  },
  netWorthModal: {
    width: "100%",
    maxWidth: 400,
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 20,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  netWorthModalTotal: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    color: "#10B981",
    fontVariantNumeric: "tabular-nums",
    textAlign: "right" as const,
  },
  netWorthBreakdown: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  netWorthRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    background: "#111111",
    border: "1px solid #1F1F1F",
    borderRadius: 12,
    padding: "12px 14px",
  },
  netWorthRowLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#E5E7EB",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  netWorthRowValue: {
    fontSize: 14,
    fontWeight: 800,
    color: "#FFFFFF",
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
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
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid #1F1F1F",
    background: "linear-gradient(135deg, #10B981, #059669)",
    color: "#042F2E",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
    overflow: "hidden",
  },
  profileBtnActive: {
    boxShadow: "0 0 0 2px #10B981",
    borderColor: "#10B981",
  },
  profileBtnImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  profileBtnInitials: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    lineHeight: 1,
  },
  profileMenuWrap: {
    position: "relative",
    flexShrink: 0,
    zIndex: 90,
  },
  profileMenu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 8px)",
    zIndex: 80,
    minWidth: 204,
    padding: 6,
    borderRadius: 14,
    border: "1px solid #1F1F1F",
    background: "#0A0A0A",
    boxShadow: "0 18px 40px rgba(0, 0, 0, 0.48)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  profileMenuItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    margin: 0,
    border: "none",
    borderRadius: 10,
    background: "transparent",
    color: "#E5E7EB",
    cursor: "pointer",
    padding: "10px 10px",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "left" as const,
  },
  profileMenuLabel: {
    flex: 1,
    minWidth: 0,
  },
  profileMenuSoundChip: {
    flexShrink: 0,
    borderRadius: 999,
    border: "1px solid #2A2A2A",
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
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
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    width: "100%",
    margin: "9px 0 0",
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    padding: "8px 2px 8px 0",
    lineHeight: 1,
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 12,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
  flowCellHint: {
    margin: "8px 0 0",
    fontSize: 11,
    color: "#64748B",
    fontWeight: 600,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(2, 6, 23, 0.72)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
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
  bankChip: {
    display: "inline-block",
    flexShrink: 0,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#6EE7B7",
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.28)",
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
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
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
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    margin: "12px 0",
  },
  metricBox: {
    background: "#121212",
    border: "1px solid #1F1F1F",
    borderRadius: 10,
    padding: "8px 9px",
    minWidth: 0,
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
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
  tabBar: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 0,
    maxWidth: 560,
    margin: "0 auto",
    width: "100%",
    padding: "4px 2px calc(4px + env(safe-area-inset-bottom, 0px))",
  } as React.CSSProperties,
  tabBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    minWidth: 0,
    minHeight: 48,
    border: "none",
    background: "transparent",
    color: "#737373",
    borderRadius: 0,
    cursor: "pointer",
    padding: "6px 0",
    transition: "color 0.18s ease",
  },
  tabBtnActive: {
    color: "#10B981",
  },
  tabEmoji: {
    display: "grid",
    placeItems: "center",
    lineHeight: 1,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "-0.04em",
    textAlign: "center",
    lineHeight: 1.15,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
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
  .matter-ask-input { scrollbar-width: thin; scrollbar-color: #2A2A2A transparent; overflow-wrap: anywhere; word-break: break-word; }
  .matter-ask-input::-webkit-scrollbar { width: 6px; }
  .matter-ask-input::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 999px; }
  button:disabled { cursor: default; }
  .matter-profile-menu-item:hover { background: rgba(255, 255, 255, 0.045); }
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
