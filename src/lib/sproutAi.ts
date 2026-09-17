import { safeFormatNumber, toFiniteNumber } from "./money";

/** Legal / educational notice appended to every Sprout AI recommendation and chat reply. */
export const EDUCATIONAL_DISCLAIMER =
  "For educational purposes only. Not financial or tax advice.";

/**
 * Gemini system persona for Sprout AI.
 * Personal Finance Educational Coach that may analyze individual stocks educationally —
 * never a broker, adviser, or tax pro.
 */
export const SPROUT_SYSTEM_INSTRUCTION = `You are Sprout AI, a Personal Finance Educational Coach inside the Sprout Finance app.

You teach personal finance AND may provide educational analysis of individual publicly traded companies when the learner asks (for example: "Why is Adobe struggling?", "Analyze AMD", recent earnings, competitive positioning, or market catalysts). You are a coach and tutor — never a broker, investment adviser, tax preparer, or attorney.

Hard rules (never break these):
- NEVER give trade signals or instructions to buy, sell, or hold a security (no timing, price targets, position sizing, or "you should trade X").
- NEVER give licensed tax advice, filing instructions, deduction claims, or legal counsel.
- NEVER invent live prices, earnings numbers, or headlines. Prefer supplied context and Google Search grounding when available.
- If asked for a pick ("what should I buy?"), a trade signal, or tax advice, refuse in one short sentence and offer educational framing instead.
- Do NOT redirect individual-stock questions into cash-flow lectures, $0 non-essential spending templates, or safety-net checklists unless the user explicitly asks about their budget or spending.

You MAY (and should, when asked):
- Analyze a named company or ticker: business model, recent earnings and guidance, competitive positioning, sector backdrop, and 1-week / 1-month news catalysts
- Summarize published analyst rating tallies as public facts (Street data), while making clear they are not Sprout recommendations
- Use live web grounding for timely market and company news when the tools are available

Also stay ready for core coaching:
- Budgeting and organizing automated expenses
- Compound interest math and time-value-of-money examples
- Debt-reduction frameworks (snowball and avalanche) as education, not a mandate
- Educational milestones from the user's cash, debt, and spending snapshot — only when the question is about their personal finances

Style:
- Warm, encouraging, and concise — usually under 5 short sentences for chat; longer only when the user asks for a deep stock briefing
- Clear everyday language and relatable analogies; never lecture
- Address the learner by first name only — never a full legal name
- Use the provided snapshot numbers for personal-finance questions; do not invent balances
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
  /** Optional post-bank goal intake for roadmap / milestone tailoring. */
  goals?: {
    primaryGoalLabel: string | null;
    primaryGoalId: string | null;
    liquidSavings: number | null;
  };
};

/** Tailored educational milestones from automated cash, debt, and spending context. */
export function buildEducationalMilestones(snapshot: SproutAiFinancialSnapshot): string[] {
  const { cash, debt, spending, goals } = snapshot;
  const milestones: string[] = [];
  const months = cash.safetyNetMonths;
  const reportedLiquid = goals?.liquidSavings;
  const goalLabel = goals?.primaryGoalLabel;
  const goalId = goals?.primaryGoalId;

  if (spending.monthlyIncome > 0 && !spending.isSurplus) {
    milestones.push(
      "Organize spending categories and close the monthly deficit before treating leftover cash as investable."
    );
  }

  const spendableCash = Math.max(cash.liquidCash + cash.hysaCash, reportedLiquid ?? 0);
  if (spendableCash < cash.starterCashGoal) {
    milestones.push(
      `Build a starter cash cushion toward $${usd(cash.starterCashGoal)}${
        goalLabel ? ` while keeping ${goalLabel} in view` : ""
      } so a small surprise does not become new debt.`
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

  if (goalId === "home-down-payment") {
    milestones.push(
      "Separate a dedicated down-payment HYSA goal from long-term investing education — near-term purchase cash should stay liquid."
    );
  } else if (goalId === "buy-a-car") {
    milestones.push(
      "Show how saving cash for a car purchase avoids high-APR auto debt — keep that bucket distinct from brokerage lessons."
    );
  } else if (goalId === "financial-independence") {
    milestones.push(
      "Frame financial independence as tax-advantaged compounding plus expense control — not stock picks."
    );
  } else if (goalId === "wealth-growth") {
    milestones.push(
      "After the safety net, teach surplus automation and broad-market compounding concepts for long-term wealth growth."
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
  const { cash, debt, spending, portfolio, goals } = snapshot;
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
  const goalsLine = goals
    ? `- Primary goal intake: ${goals.primaryGoalLabel ?? "not set"}; reported liquid savings $${
        goals.liquidSavings == null ? "n/a" : usd(goals.liquidSavings)
      }.`
    : "- Primary goal intake: not set yet.";

  return [
    `${userName}'s automated financial context (use these numbers; do not invent others):`,
    `- Cash: liquid $${usd(cash.liquidCash)}, HYSA $${usd(cash.hysaCash)}, safety net $${usd(cash.safetyNetTotal)} (${monthsLabel}). Starter cash goal $${usd(cash.starterCashGoal)}; ${cash.starterMonths}-month reserve target $${usd(spending.monthlyExpenses * cash.starterMonths)}; ${cash.recommendedMonths}-month target $${usd(cash.recommendedGoal)}.`,
    goalsLine,
    `- Debt: ${debt.summary}`,
    `- Spending patterns: ${spending.summary}${topSpend ? ` Largest categories: ${topSpend}.` : ""}`,
    portfolioLine,
    `- Tailored educational milestones to teach (in this order, only as education):`,
    ...milestones.map((line, index) => `  ${index + 1}. ${line}`),
  ].join("\n");
}

/** True when the latest user turn is about a company, ticker, earnings, or market catalyst. */
export function isIndividualStockQuery(text: string): boolean {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (
    /\b(budget|cash flow|safety net|debt|avalanche|snowball|spending|non-essential|hysa|emergency fund)\b/i.test(
      lower
    ) &&
    !/\b(stock|ticker|earnings|shares?|equity|nasdaq|nyse|analyze|analysis|catalyst|compet)\b/i.test(lower)
  ) {
    return false;
  }
  if (
    /\b(analy[sz]e|analysis|earnings|guidance|catalyst|ticker|stock|shares?|valuation|competitor|competitive|market cap|pe ratio|why is .+ (struggling|down|up|falling|rallying|weak)|what happened (to|with)|news (on|about|for)|1[- ]?(week|month)|ytd performance)\b/i.test(
      lower
    )
  ) {
    return true;
  }
  // Bare ticker or well-known company name asks (e.g. "AMD", "Adobe", "Aeva").
  if (/^[A-Za-z]{1,5}$/.test(raw) && raw === raw.toUpperCase()) return true;
  if (
    /\b(adobe|apple|nvidia|amd|tesla|microsoft|amazon|meta|google|alphabet|aeva|avav|ondas|red cat|intel|netflix|palantir)\b/i.test(
      lower
    )
  ) {
    return true;
  }
  return false;
}

/** Extract the latest User: turn from a conversation transcript. */
export function latestUserUtterance(conversation: string): string {
  const lines = String(conversation || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (/^user:/i.test(line)) return line.replace(/^user:\s*/i, "").trim();
  }
  return lines[lines.length - 1] || "";
}

export function buildSproutUserPrompt(args: {
  snapshot: SproutAiFinancialSnapshot;
  conversation: string;
}): string {
  const { snapshot, conversation } = args;
  const latest = latestUserUtterance(conversation);
  const stockAsk = isIndividualStockQuery(latest);
  const name = firstNameOf(snapshot.userName);

  if (stockAsk) {
    return `${formatEducationalContext(snapshot)}

Conversation:
${conversation}

Reply to ${name}'s latest message as Sprout AI with educational individual-stock analysis.
Use Google Search grounding for real-time 1-week and 1-month news catalysts, earnings, and market context when available.
Cover financial analysis, recent earnings news, competitive positioning, and market updates as relevant.
Do NOT pivot to cash-flow, $0 non-essential spending, or safety-net templates unless they asked about their budget.
Do not give trade signals or tax advice. Address them by first name only.`;
  }

  return `${formatEducationalContext(snapshot)}

Conversation:
${conversation}

Reply to the latest user message as a Personal Finance Educational Coach. If ${name} asks about income, spending, budget, debts, or safety net, use the real snapshot above. Address them by first name only. Sequence any next-step teaching around the milestones (for example, a 3-month safety net before investing concepts). If they ask about a specific stock or company, analyze it educationally with timely news context — do not redirect to spending templates. Do not give trade signals or tax advice.`;
}
