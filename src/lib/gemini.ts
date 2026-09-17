import {
  futureValueOfMonthlyInvestment,
  tenYearWealthProjection,
  type FinancialDiagnostics,
  type RankedDiscretionaryCategory,
} from "./financialDiagnostics";
import { safeFormatNumber, toFiniteNumber } from "./money";
import {
  buildSproutUserPrompt,
  firstNameOf,
  type SproutAiFinancialSnapshot,
} from "./sproutAi";

/** Dynamic user financial parameters for Gemini diagnostic prompts. */
export type GeminiFinancialParams = {
  income: number;
  /** Total recurring monthly expenses. */
  expenses: number;
  discretionarySpend: number;
  debt: number;
  netCashFlow?: number;
  essentialSpend?: number;
  topDiscretionary?: RankedDiscretionaryCategory[];
  recommendationTarget?: RankedDiscretionaryCategory | null;
  /** Optional short Plaid transaction / category trend notes. */
  transactionTrends?: string;
  userName?: string;
  /** Monthly cutback amount the interactive UI is currently simulating. */
  proposedMonthlyCut?: number;
  cutCategoryLabel?: string;
};

function usd(amount: unknown): string {
  return `$${safeFormatNumber(Math.round(toFiniteNumber(amount, 0)))}`;
}

function flowLabel(net: number): string {
  if (net > 0) return `surplus of ${usd(net)}/mo`;
  if (net < 0) return `deficit of ${usd(Math.abs(net))}/mo`;
  return "break-even cash flow";
}

/**
 * Build Gemini instructions that analyze the user's live Plaid / profile numbers:
 * net cash flow, non-essential trends, an interactive cutback prompt, and 10-year compound growth.
 */
export function buildFinancialDiagnosticsPrompt(params: GeminiFinancialParams): string {
  const income = toFiniteNumber(params.income, 0);
  const expenses = toFiniteNumber(params.expenses, 0);
  const discretionary = toFiniteNumber(params.discretionarySpend, 0);
  const debt = toFiniteNumber(params.debt, 0);
  const net =
    params.netCashFlow != null ? toFiniteNumber(params.netCashFlow, 0) : income - expenses;
  const name = firstNameOf(params.userName || "Investor");
  const target = params.recommendationTarget || params.topDiscretionary?.[0] || null;
  const cut =
    params.proposedMonthlyCut != null
      ? Math.max(0, toFiniteNumber(params.proposedMonthlyCut, 0))
      : target
        ? Math.round(target.amount * 0.25)
        : Math.round(discretionary * 0.2);
  const cutLabel = params.cutCategoryLabel || target?.label || "non-essential spending";
  const wealth = tenYearWealthProjection(cut);
  const at8 = usd(wealth.at8);
  const at10 = usd(wealth.at10);

  const topLines =
    (params.topDiscretionary || [])
      .slice(0, 3)
      .map(
        (item, index) =>
          `  ${index + 1}. ${item.label}: ${usd(item.amount)}/mo (${Math.round(item.shareOfFlexible * 100)}% of flexible spend)`
      )
      .join("\n") || "  (no discretionary categories detected yet)";

  return `Live Plaid / profile financial diagnostics for ${name} (use these exact numbers; do not invent others):
- Monthly income: ${usd(income)}
- Recurring expenses: ${usd(expenses)}
- Discretionary / flexible spend: ${usd(discretionary)}${
    params.essentialSpend != null ? ` (essentials ${usd(params.essentialSpend)})` : ""
  }
- Credit / debt balance: ${usd(debt)}
- Net cash flow: ${flowLabel(net)}
- Highest-impact discretionary categories:
${topLines}
${params.transactionTrends ? `- Transaction trends: ${params.transactionTrends}` : ""}

Your reply must:
1. Highlight ${name}'s actual net cash flow (${flowLabel(net)}) and call out non-essential spending trends from the categories above.
2. Present an interactive-style recommendation that asks whether they want to reduce "${cutLabel}" by about ${usd(cut)}/mo (or another specific detected expense from the list).
3. Calculate and clearly state the educational 10-year compound wealth if that ${usd(cut)}/mo is invested at roughly 8–10% annual return: about ${at8} at 8% and ${at10} at 10% (monthly compounding illustration — not a prediction or advice to buy anything).
Keep the tone warm and under 5 short sentences, then append the educational disclaimer.`;
}

/** Merge a Sprout coach snapshot conversation with live diagnostics instructions. */
export function buildGeminiCoachDiagnosticsPrompt(args: {
  snapshot: SproutAiFinancialSnapshot;
  conversation: string;
  diagnostics?: FinancialDiagnostics | null;
  params?: Partial<GeminiFinancialParams>;
}): string {
  const { snapshot, conversation, diagnostics } = args;
  const spending = snapshot.spending;
  const params: GeminiFinancialParams = {
    income: args.params?.income ?? diagnostics?.income ?? spending.monthlyIncome,
    expenses: args.params?.expenses ?? diagnostics?.recurringExpenses ?? spending.monthlyExpenses,
    discretionarySpend:
      args.params?.discretionarySpend ??
      diagnostics?.discretionarySpend ??
      Math.max(0, spending.monthlyExpenses - (diagnostics?.essentialSpend ?? 0)),
    debt: args.params?.debt ?? diagnostics?.creditDebt ?? snapshot.debt.total,
    netCashFlow: args.params?.netCashFlow ?? diagnostics?.netCashFlow ?? spending.netCashFlow,
    essentialSpend: args.params?.essentialSpend ?? diagnostics?.essentialSpend,
    topDiscretionary: args.params?.topDiscretionary ?? diagnostics?.topDiscretionary,
    recommendationTarget:
      args.params?.recommendationTarget ?? diagnostics?.recommendationTarget ?? null,
    transactionTrends: args.params?.transactionTrends,
    userName: args.params?.userName ?? snapshot.userName,
    proposedMonthlyCut: args.params?.proposedMonthlyCut,
    cutCategoryLabel: args.params?.cutCategoryLabel,
  };

  const base = buildSproutUserPrompt({ snapshot, conversation });
  return `${base}

---
Additional real-data diagnostic brief (prioritize these live numbers when discussing budget, spending, or investing concepts):
${buildFinancialDiagnosticsPrompt(params)}`;
}

/** Compact params object from a diagnostics result for API / UI callers. */
export function geminiParamsFromDiagnostics(
  diagnostics: FinancialDiagnostics,
  extras: Partial<GeminiFinancialParams> = {}
): GeminiFinancialParams {
  return {
    income: diagnostics.income,
    expenses: diagnostics.recurringExpenses,
    discretionarySpend: diagnostics.discretionarySpend + diagnostics.flexibleSpend,
    debt: diagnostics.creditDebt,
    netCashFlow: diagnostics.netCashFlow,
    essentialSpend: diagnostics.essentialSpend,
    topDiscretionary: diagnostics.topDiscretionary,
    recommendationTarget: diagnostics.recommendationTarget,
    ...extras,
  };
}

export { futureValueOfMonthlyInvestment, tenYearWealthProjection };

/** Shared Sprout AI stock briefing payload used by /api/stocks/analysis. */
export type SproutStockAnalysis = {
  growthDrivers: string[];
  keyRisks: string[];
  analystConsensus: string;
  sentiment: "Buy" | "Hold" | "Sell";
  source: "ai" | "fallback";
  warning?: string;
  disclaimer?: string;
};

export type StockBriefingFundamentals = {
  symbol: string;
  name?: string;
  revenueGrowthYoy?: number | null;
  cash?: number | null;
  debt?: number | null;
  fcf?: number | null;
  pe?: number | null;
  peTag?: string;
  recommendation?: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    period?: string;
  } | null;
};

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split("\n")
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function extractJsonObject(text: string): string {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) return cleaned;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

/** Parse Gemini stock-briefing JSON with tolerant field recovery. */
export function parseStockBriefingJson(
  text: string
): Omit<SproutStockAnalysis, "source" | "warning" | "disclaimer"> | null {
  if (!text?.trim()) return null;
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    const growthDrivers = asStringList(parsed.growthDrivers ?? parsed.growth_drivers).slice(0, 4);
    const keyRisks = asStringList(parsed.keyRisks ?? parsed.key_risks).slice(0, 4);
    const analystConsensus = String(
      parsed.analystConsensus || parsed.analyst_consensus || parsed.consensus || ""
    ).trim();
    const rawSentiment = String(parsed.sentiment || "Hold").trim().toLowerCase();
    const sentiment: SproutStockAnalysis["sentiment"] =
      rawSentiment === "buy" ? "Buy" : rawSentiment === "sell" ? "Sell" : "Hold";
    if (growthDrivers.length === 0 || keyRisks.length === 0 || !analystConsensus) return null;
    return { growthDrivers, keyRisks, analystConsensus, sentiment };
  } catch {
    return null;
  }
}

/** Normalize partial API / model payloads so the UI never rejects a usable briefing. */
export function normalizeStockBriefing(
  raw: unknown,
  fallback: SproutStockAnalysis
): SproutStockAnalysis {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const growthDrivers = asStringList(rec.growthDrivers).slice(0, 4);
  const keyRisks = asStringList(rec.keyRisks).slice(0, 4);
  const analystConsensus = String(rec.analystConsensus || "").trim();
  const rawSentiment = String(rec.sentiment || "").trim().toLowerCase();
  const sentiment: SproutStockAnalysis["sentiment"] =
    rawSentiment === "buy"
      ? "Buy"
      : rawSentiment === "sell"
        ? "Sell"
        : rawSentiment === "hold"
          ? "Hold"
          : fallback.sentiment;
  const source = rec.source === "ai" || rec.source === "fallback" ? rec.source : fallback.source;
  if (growthDrivers.length === 0 || keyRisks.length === 0 || !analystConsensus) {
    return {
      ...fallback,
      warning:
        typeof rec.warning === "string" && rec.warning.trim()
          ? rec.warning.trim()
          : fallback.warning ||
            "Live Sprout AI synthesis was incomplete. Showing a fundamentals-based briefing.",
    };
  }
  return {
    growthDrivers,
    keyRisks,
    analystConsensus,
    sentiment,
    source,
    warning: typeof rec.warning === "string" ? rec.warning : undefined,
    disclaimer:
      typeof rec.disclaimer === "string" && rec.disclaimer.trim()
        ? rec.disclaimer.trim()
        : fallback.disclaimer,
  };
}

/** Fundamentals-only stock briefing when Gemini is unavailable or returns unusable JSON. */
export function buildFallbackStockBriefing(
  symbol: string,
  name: string,
  fundamentals: StockBriefingFundamentals = { symbol },
  disclaimer = "For educational purposes only. Not financial or tax advice."
): SproutStockAnalysis {
  const rec = fundamentals.recommendation;
  const total = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
  const bullish = rec ? rec.strongBuy + rec.buy : 0;
  const bearish = rec ? rec.sell + rec.strongSell : 0;
  const sentiment: SproutStockAnalysis["sentiment"] =
    total === 0 ? "Hold" : bullish / total >= 0.55 ? "Buy" : bearish / total >= 0.3 ? "Sell" : "Hold";

  const growth =
    fundamentals.revenueGrowthYoy != null
      ? `${name} (${symbol}) posted ${fundamentals.revenueGrowthYoy >= 0 ? "positive" : "negative"} revenue growth of ${fundamentals.revenueGrowthYoy.toFixed(1)}% year over year.`
      : `Recent product cycles, category demand, and operating execution remain the core growth narrative for ${symbol}.`;
  const cashFlow =
    fundamentals.fcf != null && fundamentals.fcf > 0
      ? "The company is generating free cash flow, which can fund reinvestment, buybacks, or a stronger balance sheet."
      : "Watch the next earnings print, major commercial wins, and any guidance updates for confirmation of the growth story.";
  const leverageRisk =
    fundamentals.debt != null &&
    fundamentals.cash != null &&
    fundamentals.debt > fundamentals.cash
      ? "Net leverage is worth monitoring if rates stay high or cash flow slows."
      : "A miss on growth, margins, or guidance could re-rate the stock quickly.";
  const consensus =
    rec && total > 0
      ? `Street sentiment leans ${sentiment}: ${bullish} buy-side ratings vs ${rec.hold} hold and ${bearish} sell in the latest snapshot.`
      : `Analyst coverage is thin right now — treat the setup as a Hold until a clearer Street consensus is available.`;

  return {
    growthDrivers: [growth, cashFlow],
    keyRisks: [
      "Valuation, competition, and macro sensitivity (rates, consumer, or enterprise spend) can all reverse the near-term tape.",
      leverageRisk,
    ],
    analystConsensus: consensus,
    sentiment,
    source: "fallback",
    disclaimer,
  };
}

/** Prompt body for the Sprout AI stock briefing generator. */
export function buildStockBriefingPrompt(args: {
  symbol: string;
  name: string;
  price?: number;
  changePct?: number;
  positionNote?: string;
  fundamentals: StockBriefingFundamentals;
  headlines?: string[];
  systemInstruction?: string;
}): string {
  const f = args.fundamentals;
  const rec = f.recommendation;
  const recLine = rec
    ? `Strong Buy ${rec.strongBuy}, Buy ${rec.buy}, Hold ${rec.hold}, Sell ${rec.sell}, Strong Sell ${rec.strongSell} (period ${rec.period || "latest"})`
    : "No live analyst rating snapshot available.";
  const headlineBlock =
    args.headlines && args.headlines.length > 0
      ? args.headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")
      : "No recent company headlines available.";
  const priceLine =
    args.price != null
      ? `Current price: $${args.price.toFixed(2)}${
          args.changePct != null
            ? ` (${args.changePct >= 0 ? "+" : ""}${args.changePct.toFixed(2)}%)`
            : ""
        }`
      : "Current price: not provided.";
  const system = args.systemInstruction || "";

  return `${system ? `${system}\n\n` : ""}Write a concise educational briefing about a company the user already opened. Teach context only — never a stock pick or trade signal.

Stock: ${args.symbol} (${args.name})
${priceLine}
Revenue growth YoY: ${f.revenueGrowthYoy != null ? `${f.revenueGrowthYoy.toFixed(1)}%` : "n/a"}
P/E: ${f.pe != null ? f.pe.toFixed(1) : "n/a"} (${f.peTag || "N/A"})
Cash: ${f.cash != null ? Math.round(f.cash) : "n/a"}  Debt: ${f.debt != null ? Math.round(f.debt) : "n/a"}
Free cash flow: ${f.fcf != null ? Math.round(f.fcf) : "n/a"}
Published analyst ratings (report as facts, not as your recommendation): ${recLine}
${args.positionNote ? `User already holds or viewed this name: ${args.positionNote}` : ""}
Recent headlines:
${headlineBlock}

Return ONLY valid JSON (no markdown) with exactly these keys:
{
  "growthDrivers": ["2-4 short educational bullets on recent earnings, key deals, product cycles, or operating highlights"],
  "keyRisks": ["2-4 short bullets on material risks to watch"],
  "analystConsensus": "1-2 sentences summarizing published Buy/Hold/Sell ratings in plain English. This is Street data, not your advice.",
  "sentiment": "Buy" | "Hold" | "Sell"
}

Rules:
- Everyday language. No ticker-dump. No fabricated precise earnings numbers that are not implied above.
- Educational briefing only. Do not tell the user to buy, sell, or hold. sentiment must mirror published Street ratings, never a Sprout trade signal.
- No licensed tax advice. Keep each bullet to 1-2 sentences.`;
}
