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
  isIndividualStockQuery,
  latestUserUtterance,
  type SproutAiFinancialSnapshot,
} from "./sproutAi";

export { isIndividualStockQuery, latestUserUtterance };

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
  // Individual stock questions must get analysis — never cash-flow / cutback / $0 spend templates.
  if (isIndividualStockQuery(latestUserUtterance(conversation))) {
    return `${base}

---
Stock-analysis mode (mandatory): answer the company/ticker question with educational financial analysis, market news context, and stock performance commentary.
Forbidden in this reply: cash-flow lectures, non-essential spending cuts, $0 spending templates, safety-net checklists, or budget pivots.`;
  }

  return `${base}

---
Additional real-data diagnostic brief (prioritize these live numbers when discussing budget, spending, or investing concepts — skip this brief if the user asked about a specific stock or company):
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
  fallback?: SproutStockAnalysis | null
): SproutStockAnalysis | null {
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
          : fallback?.sentiment || "Hold";
  const source = rec.source === "ai" || rec.source === "fallback" ? rec.source : fallback?.source || "ai";
  if (growthDrivers.length === 0 || keyRisks.length === 0 || !analystConsensus) {
    return null;
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
        : fallback?.disclaimer,
  };
}

export type StockBriefingPerformance = {
  /** Approx. 1-week price change percent when known. */
  weekChangePct?: number | null;
  /** Approx. 1-month price change percent when known. */
  monthChangePct?: number | null;
  /** Optional short tape note (e.g. "underperformed XLK"). */
  note?: string;
};

export type GenerateStockBriefingInput = {
  symbol: string;
  name: string;
  price?: number;
  changePct?: number;
  positionNote?: string;
  fundamentals: StockBriefingFundamentals;
  performance?: StockBriefingPerformance;
  /** Recent headlines from roughly the last 7 days. */
  weekHeadlines?: string[];
  /** Headlines spanning roughly the last 30 days. */
  monthHeadlines?: string[];
  /** @deprecated Prefer weekHeadlines / monthHeadlines. */
  headlines?: string[];
  systemInstruction?: string;
};

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Prompt body for the Sprout AI stock briefing generator (live news + fundamentals). */
export function buildStockBriefingPrompt(args: GenerateStockBriefingInput): string {
  const f = args.fundamentals;
  const rec = f.recommendation;
  const recLine = rec
    ? `Strong Buy ${rec.strongBuy}, Buy ${rec.buy}, Hold ${rec.hold}, Sell ${rec.sell}, Strong Sell ${rec.strongSell} (period ${rec.period || "latest"})`
    : "No live analyst rating snapshot available.";
  const week =
    args.weekHeadlines && args.weekHeadlines.length > 0
      ? args.weekHeadlines.map((h, i) => `${i + 1}. ${h}`).join("\n")
      : "No headlines captured for the last 7 days — use Google Search grounding for live catalysts.";
  const monthSource =
    args.monthHeadlines && args.monthHeadlines.length > 0
      ? args.monthHeadlines
      : args.headlines && args.headlines.length > 0
        ? args.headlines
        : [];
  const month =
    monthSource.length > 0
      ? monthSource.map((h, i) => `${i + 1}. ${h}`).join("\n")
      : "No headlines captured for the last 30 days — use Google Search grounding for live catalysts.";
  const priceLine =
    args.price != null
      ? `Current price: $${args.price.toFixed(2)}${
          args.changePct != null
            ? ` (day ${args.changePct >= 0 ? "+" : ""}${args.changePct.toFixed(2)}%)`
            : ""
        }`
      : "Current price: not provided.";
  const perf = args.performance || {};
  const performanceLine = `1-week performance: ${formatPct(perf.weekChangePct)} | 1-month performance: ${formatPct(
    perf.monthChangePct
  )}${perf.note ? ` | Note: ${perf.note}` : ""}`;
  const system = args.systemInstruction || "";

  return `${system ? `${system}\n\n` : ""}Write a detailed educational briefing about ${args.name} (${args.symbol}). Teach context only — never a stock pick or trade signal.

Use the live market news, 1-month performance, and fundamentals below. Prefer Google Search grounding for anything missing or stale. Cover BOTH:
1) Macro / market context that affects this name (rates, sector tape, risk appetite, peers), and
2) Company-specific catalysts from the last 1 week and last 1 month (earnings, guidance, deals, product launches, regulatory news, capital actions).

Stock: ${args.symbol} (${args.name})
${priceLine}
${performanceLine}
Revenue growth YoY: ${f.revenueGrowthYoy != null ? `${f.revenueGrowthYoy.toFixed(1)}%` : "n/a"}
P/E: ${f.pe != null ? f.pe.toFixed(1) : "n/a"} (${f.peTag || "N/A"})
Cash: ${f.cash != null ? Math.round(f.cash) : "n/a"}  Debt: ${f.debt != null ? Math.round(f.debt) : "n/a"}
Free cash flow: ${f.fcf != null ? Math.round(f.fcf) : "n/a"}
Published analyst ratings (report as facts, not as your recommendation): ${recLine}
${args.positionNote ? `User already holds or viewed this name: ${args.positionNote}` : ""}

Last 7 days — market & company news:
${week}

Last 30 days — market & company news:
${month}

Return ONLY valid JSON (no markdown) with exactly these keys:
{
  "growthDrivers": ["2-4 specific bullets that cite recent catalysts, financial performance, strategic updates, and relevant macro/sector backdrop — not generic filler"],
  "keyRisks": ["2-4 specific bullets on material risks tied to recent news, competition, valuation, or macro sensitivity"],
  "analystConsensus": "1-2 sentences summarizing published Buy/Hold/Sell ratings in plain English, optionally noting how recent news may frame Street debate. This is Street data, not your advice.",
  "sentiment": "Buy" | "Hold" | "Sell"
}

Rules:
- Be specific and non-generic. Reference themes from the supplied headlines and 1-month performance when present (without inventing precise dollar figures that are not implied above).
- Everyday language. No ticker-dump. Educational briefing only — do not tell the user to buy, sell, or hold.
- sentiment must mirror published Street ratings, never a Sprout trade signal.
- Never return a generic fundamentals-only filler briefing. If news is thin, ground on the web and say what you found.
- No licensed tax advice. Keep each bullet to 1-2 sentences, but make them information-dense.`;
}

/**
 * Build + validate the educational stock briefing payload.
 * Callers supply model text from Gemini (with Google Search grounding). Returns null on parse failure —
 * never invents a fundamentals-based fallback briefing.
 */
export function generateStockBriefing(
  input: GenerateStockBriefingInput,
  modelText: string
): Omit<SproutStockAnalysis, "source" | "warning" | "disclaimer"> | null {
  const prompt = buildStockBriefingPrompt(input);
  if (!prompt.trim() || !String(modelText || "").trim()) return null;
  return parseStockBriefingJson(modelText);
}

/** Gemini tool config: live Google Search grounding for stock / market questions. */
export const GEMINI_GOOGLE_SEARCH_TOOL = { googleSearch: {} } as const;
