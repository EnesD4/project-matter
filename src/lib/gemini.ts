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
