/**
 * Client-side Plaid investment / brokerage helpers.
 * Link + exchange live in `plaidLink.ts`; this module shapes holdings,
 * uninvested cash, and diversification context for Sprout AI.
 */
import { analyzePortfolioHealth } from "./portfolioHealth";
import { toFiniteNumber } from "./money";
import type { Holding } from "../components/InvestmentPortfolioCard";
import {
  PLAID_CONNECTED_EVENT,
  parsePlaidLinkResult,
  type PlaidLinkAccount,
  type PlaidLinkHolding,
  type PlaidLinkResult,
} from "./plaidLink";

export {
  PLAID_CONNECTED_EVENT,
  createPlaidLinkToken,
  dispatchPlaidConnected,
  exchangePlaidPublicToken,
  hydrateLinkedBank,
  parsePlaidLinkResult,
  refreshPlaidAccounts,
  resultFromAccounts,
  type PlaidLinkAccount,
  type PlaidLinkHolding,
  type PlaidLinkResult,
} from "./plaidLink";

export type PlaidInvestmentDistributionSlice = {
  label: string;
  value: number;
  weightPct: number;
};

export type PlaidInvestmentSummary = {
  institution: string;
  equityValue: number;
  brokerageCash: number;
  totalValue: number;
  holdingCount: number;
  investmentAccounts: PlaidLinkAccount[];
  holdings: PlaidLinkHolding[];
  distribution: PlaidInvestmentDistributionSlice[];
  diversificationLabel: string;
  diversificationDetail: string;
};

const INVESTMENT_TYPE = "investment";
const BROKERAGE_SUBTYPE_RE =
  /\b(brokerage|investment|401\s*\(?k\)?|ira|roth|hsa|mutual\s*fund|trust|ugma|utma)\b/i;

/** True for Robinhood / Fidelity / Schwab / E*TRADE-style investment accounts. */
export function isPlaidInvestmentAccount(account: Pick<PlaidLinkAccount, "type" | "subtype" | "name" | "officialName">): boolean {
  if (String(account.type || "").toLowerCase() === INVESTMENT_TYPE) return true;
  const blob = `${account.subtype || ""} ${account.name || ""} ${account.officialName || ""}`;
  return BROKERAGE_SUBTYPE_RE.test(blob);
}

export function brokerageCashFromPlaidResult(result: Pick<PlaidLinkResult, "brokerageCash" | "accounts" | "holdings">): number {
  const explicit = toFiniteNumber(result.brokerageCash, 0);
  if (explicit > 0) return explicit;

  const equityValue = (result.holdings || []).reduce(
    (sum, lot) => sum + toFiniteNumber(lot.shares, 0) * toFiniteNumber(lot.buyPrice, 0),
    0
  );
  const investmentBalances = (result.accounts || [])
    .filter(isPlaidInvestmentAccount)
    .reduce((sum, account) => sum + toFiniteNumber(account.balance, 0), 0);
  return Math.max(0, investmentBalances - equityValue);
}

export function plaidHoldingsToStockHoldings(holdings: PlaidLinkHolding[]): Holding[] {
  return (holdings || [])
    .filter((item) => item?.symbol && toFiniteNumber(item.shares, 0) > 0)
    .map((item) => ({
      id: String(item.id),
      kind: "stock" as const,
      symbol: String(item.symbol).toUpperCase(),
      description: item.name || item.symbol,
      quantity: toFiniteNumber(item.shares, 0),
      avgCost: toFiniteNumber(item.buyPrice, 0),
      currentPrice: toFiniteNumber(item.buyPrice, 0),
      dayChangePct: 0,
      dayChangeAbs: 0,
      open: toFiniteNumber(item.buyPrice, 0),
      high: toFiniteNumber(item.buyPrice, 0),
      low: toFiniteNumber(item.buyPrice, 0),
      prevClose: toFiniteNumber(item.buyPrice, 0),
      purchasedAt: item.purchasedAt ?? null,
      account: "verified" as const,
    }));
}

export function summarizePlaidInvestments(result: PlaidLinkResult): PlaidInvestmentSummary {
  const holdings = result.holdings || [];
  const investmentAccounts = (result.accounts || []).filter(isPlaidInvestmentAccount);
  const equityValue = holdings.reduce(
    (sum, lot) => sum + toFiniteNumber(lot.shares, 0) * toFiniteNumber(lot.buyPrice, 0),
    0
  );
  const brokerageCash = brokerageCashFromPlaidResult(result);
  const totalValue = equityValue + brokerageCash;

  const bySymbol = new Map<string, number>();
  for (const lot of holdings) {
    const symbol = String(lot.symbol || "").toUpperCase();
    if (!symbol) continue;
    const value = toFiniteNumber(lot.shares, 0) * toFiniteNumber(lot.buyPrice, 0);
    if (value <= 0) continue;
    bySymbol.set(symbol, (bySymbol.get(symbol) || 0) + value);
  }
  if (brokerageCash > 0) bySymbol.set("Cash", (bySymbol.get("Cash") || 0) + brokerageCash);

  const distribution = [...bySymbol.entries()]
    .map(([label, value]) => ({
      label,
      value,
      weightPct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const health = analyzePortfolioHealth(plaidHoldingsToStockHoldings(holdings), brokerageCash);

  return {
    institution: result.institution,
    equityValue,
    brokerageCash,
    totalValue,
    holdingCount: holdings.length,
    investmentAccounts,
    holdings,
    distribution,
    diversificationLabel: health.empty ? "No holdings yet" : health.diversification.label,
    diversificationDetail: health.empty
      ? "Connect a brokerage to score sector mix"
      : health.diversification.detail,
  };
}

/** Compact diversification blurb for Sprout AI prompts. */
export function formatInvestmentDiversificationContext(summary: PlaidInvestmentSummary | null): string {
  if (!summary || (summary.holdingCount === 0 && summary.brokerageCash <= 0)) {
    return "No linked brokerage holdings yet.";
  }
  const top = summary.distribution
    .slice(0, 6)
    .map((slice) => `${slice.label} ${slice.weightPct.toFixed(0)}%`)
    .join(", ");
  return [
    `Linked brokerage (${summary.institution}): equity $${Math.round(summary.equityValue).toLocaleString("en-US")}, uninvested cash $${Math.round(summary.brokerageCash).toLocaleString("en-US")}.`,
    `Diversification: ${summary.diversificationLabel} — ${summary.diversificationDetail}.`,
    top ? `Weight mix: ${top}.` : "",
    "Teach concentration vs broad-market index exposure; do not recommend trades.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function parsePlaidInvestmentPayload(raw: unknown): PlaidLinkResult | null {
  return parsePlaidLinkResult(raw);
}
