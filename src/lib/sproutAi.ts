import { safeFormatNumber, toFiniteNumber } from "./money";

/** Legal / educational notice appended to every Sprout AI recommendation and chat reply. */
export const EDUCATIONAL_DISCLAIMER =
  "For educational purposes only. Not financial or tax advice.";

/**
 * Gemini system persona for Sprout AI.
 * Strictly a Personal Finance Educational Coach — not a broker, advisor, or tax pro.
 */
export const SPROUT_SYSTEM_INSTRUCTION = `You are Sprout AI, a Personal Finance Educational Coach inside the Sprout Finance app.

Your only role is to teach general personal-finance concepts. You are a coach and tutor — never a broker, investment adviser, tax preparer, or attorney.

Hard rules (never break these):
- NEVER offer specific stock picks or name individual tickers to buy, sell, or avoid.
- NEVER give individual trade signals (buy / sell / hold timing, price targets, or "you should trade X").
- NEVER give licensed tax advice, filing instructions, deduction claims, or legal counsel.
- If asked for a pick, trade signal, or tax advice, refuse in one short sentence and redirect to general education.

Stay focused on:
- General budgeting and organizing automated expenses
- Compound interest math and time-value-of-money examples
- Debt-reduction frameworks (snowball and avalanche) as education, not a mandate
- Educational milestones sequenced from the user's cash, debt, and spending snapshot (for example: build a 3-month safety net before discussing investing concepts)

Style:
- Warm, encouraging, and concise — usually under 4 short sentences
- Clear everyday language and relatable analogies; never lecture
- Address the learner by first name only — never a full legal name
- Use the provided snapshot numbers; do not invent balances
- Holdings in the snapshot are facts about what the user already owns. Do not recommend buying, selling, or adding any ticker.

After every recommendation or chat reply, append this exact notice on its own final line:
${EDUCATIONAL_DISCLAIMER}`;

const DISCLAIMER_TAIL =
  /(?:\n|\s)*For educational purposes only\.\s*Not financial or tax advice\.?\s*$/i;

export function stripEducationalDisclaimer(text: string): string {
  return String(text || "").replace(DISCLAIMER_TAIL, "").trim();
}

/** Ensures the educational notice is present exactly once at the end of a reply. */
export function withEducationalDisclaimer(text: string): string {
  const body = stripEducationalDisclaimer(text);
  if (!body) return EDUCATIONAL_DISCLAIMER;
  return `${body}\n\n${EDUCATIONAL_DISCLAIMER}`;
}

function usd(amount: unknown): string {
  return safeFormatNumber(Math.round(toFiniteNumber(amount, 0)));
}

export type SproutSpendingCategory = {
  label: string;
  amount: number;
};

export type SproutPortfolioSleeve = {
  label: string;
  weightPct: number;
};

export type SproutAiFinancialSnapshot = {
  userName: string;
  cash: {
    liquidCash: number;
    hysaCash: number;
    safetyNetTotal: number;
    safetyNetMonths: number | null;
    starterCashGoal: number;
    starterMonths: number;
    recommendedMonths: number;
    recommendedGoal: number;
  };
  debt: {
    total: number;
    count: number;
    highestApr: number | null;
    focusTitle: string | null;
    summary: string;
  };
  spending: {
    monthlyIncome: number;
    monthlyExpenses: number;
    netCashFlow: number;
    isSurplus: boolean;
    categories: SproutSpendingCategory[];
    summary: string;
  };
  /** Linked / paper holdings facts for diversification coaching (not trade advice). */
  portfolio?: {
    equityValue: number;
    brokerageCash: number;
    holdingCount: number;
    diversificationLabel: string;
    diversificationDetail: string;
    topSleeves: SproutPortfolioSleeve[];
    summary: string;
  };
};

/** Tailored educational milestones from automated cash, debt, and spending context. */
export function buildEducationalMilestones(snapshot: SproutAiFinancialSnapshot): string[] {
  const { cash, debt, spending } = snapshot;
  const milestones: string[] = [];
  const months = cash.safetyNetMonths;

  if (spending.monthlyIncome > 0 && !spending.isSurplus) {
    milestones.push(
      "Organize spending categories and close the monthly deficit before treating leftover cash as investable."
    );
  }

  const spendableCash = cash.liquidCash + cash.hysaCash;
  if (spendableCash < cash.starterCashGoal) {
    milestones.push(
      `Build a starter cash cushion toward $${usd(cash.starterCashGoal)} so a small surprise does not become new debt.`
    );
  }

  if (months == null || months < cash.starterMonths) {
    milestones.push(
      `Teach why a ${cash.starterMonths}-month safety net of essential expenses comes before extra investing.`
    );
  } else if (months < cash.recommendedMonths) {
    milestones.push(
      `Safety net is about ${months.toFixed(1)} months — explain how stretching toward ${cash.recommendedMonths} months adds resilience.`
    );
  }

  if (debt.total > 0 && (debt.highestApr ?? 0) >= 8) {
    milestones.push(
      "Walk through high-interest debt reduction (avalanche vs snowball) before extra investing — interest avoided is a guaranteed math win."
    );
  } else if (debt.total > 0) {
    milestones.push(
      "Keep minimums current and show how extra payments shorten the calendar, without naming investments."
    );
  }

  const readyToLearnInvesting =
    spending.isSurplus &&
    months != null &&
    months >= cash.starterMonths &&
    (debt.highestApr == null || debt.highestApr < 8);

  if (readyToLearnInvesting) {
    milestones.push(
      "With a 3-month cushion and no high-interest debt, introduce compound-interest math and automating surplus toward long-term goals — no stock picks."
    );
    const tilt = snapshot.portfolio?.diversificationLabel;
    if (tilt && /tech heavy|concentrated|name heavy/i.test(tilt)) {
      milestones.push(
        `Explain how a "${tilt}" book differs from broad market index exposure (S&P 500 / total market) — teach diversification concepts only, never recommend trades.`
      );
    } else if ((snapshot.portfolio?.holdingCount ?? 0) > 0) {
      milestones.push(
        "Use the linked holdings only as context to teach diversification vs concentration — never recommend buying or selling any ticker."
      );
    }
  }

  if (milestones.length === 0) {
    milestones.push(
      "Reinforce budgeting, automated expense organization, and compound-interest basics."
    );
  }

  return milestones;
}

/** First token of a display name for greetings and AI context ("Enes Dadak" → "Enes"). */
export function firstNameOf(name: string, fallback = "Investor"): string {
  const first = String(name || "")
    .trim()
    .split(/\s+/)
    .find(Boolean);
  return first || fallback;
}

export function formatEducationalContext(snapshot: SproutAiFinancialSnapshot): string {
  const { cash, debt, spending, portfolio } = snapshot;
  const userName = firstNameOf(snapshot.userName);
  const monthsLabel =
    cash.safetyNetMonths == null ? "spending not tracked yet" : `${cash.safetyNetMonths.toFixed(1)} months of spending`;
  const topSpend = [...spending.categories]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .map((item) => `${item.label} $${usd(item.amount)}/mo`)
    .join(", ");

  const milestones = buildEducationalMilestones(snapshot);
  const portfolioLine = portfolio?.summary
    ? `- Portfolio diversification (facts only): ${portfolio.summary}`
    : "- Portfolio diversification: no linked brokerage holdings yet.";

  return [
    `${userName}'s automated financial context (use these numbers; do not invent others):`,
    `- Cash: liquid $${usd(cash.liquidCash)}, HYSA $${usd(cash.hysaCash)}, safety net $${usd(cash.safetyNetTotal)} (${monthsLabel}). Starter cash goal $${usd(cash.starterCashGoal)}; ${cash.starterMonths}-month reserve target $${usd(spending.monthlyExpenses * cash.starterMonths)}; ${cash.recommendedMonths}-month target $${usd(cash.recommendedGoal)}.`,
    `- Debt: ${debt.summary}`,
    `- Spending patterns: ${spending.summary}${topSpend ? ` Largest categories: ${topSpend}.` : ""}`,
    portfolioLine,
    `- Tailored educational milestones to teach (in this order, only as education):`,
    ...milestones.map((line, index) => `  ${index + 1}. ${line}`),
  ].join("\n");
}

export function buildSproutUserPrompt(args: {
  snapshot: SproutAiFinancialSnapshot;
  conversation: string;
}): string {
  const { snapshot, conversation } = args;
  return `${formatEducationalContext(snapshot)}

Conversation:
${conversation}

Reply to the latest user message as a Personal Finance Educational Coach. If ${firstNameOf(snapshot.userName)} asks about income, spending, budget, debts, or safety net, use the real snapshot above. Address them by first name only. Sequence any next-step teaching around the milestones (for example, a 3-month safety net before investing concepts). Do not give stock picks, trade signals, or tax advice.`;
}
