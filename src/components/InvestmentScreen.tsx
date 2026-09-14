import React from "react";
import InvestmentPortfolioCard, { type Holding } from "./InvestmentPortfolioCard";
import LoadingSpinner from "./LoadingSpinner";
import PortfolioHealthScoreCard from "./PortfolioHealthScoreCard";
import WatchlistScreen from "./WatchlistScreen";

export type { Holding };

export type InvestmentScreenProps = {
  holdings: Holding[];
  totalPortfolioValue: number;
  onHoldingsChange?: (holdings: Holding[]) => void;
  onConsultSocrates?: () => void;
  cashBalance?: number;
  privacyMode: boolean;
  onTogglePrivacy: () => void;
  /** Optional parent-driven loading flag (auth / cash-flow bootstrap). */
  loading?: boolean;
};

export default function InvestmentScreen({
  holdings,
  totalPortfolioValue,
  onHoldingsChange,
  onConsultSocrates,
  cashBalance,
  privacyMode,
  onTogglePrivacy,
  loading = false,
}: InvestmentScreenProps) {
  const safeHoldings = holdings || [];

  if (loading || holdings == null) {
    return <LoadingSpinner label="Loading portfolio…" />;
  }

  return (
    <InvestmentPortfolioCard
      onHoldingsChange={onHoldingsChange}
      onConsultSocrates={onConsultSocrates}
      cashBalance={cashBalance}
      privacyMode={privacyMode}
      onTogglePrivacy={onTogglePrivacy}
      belowAllocation={({ holdings: liveHoldings, cashBalance: liveCash }) => (
        <PortfolioHealthScoreCard holdings={liveHoldings || []} cashBalance={liveCash} />
      )}
      belowHoldings={({ onAddHolding, onSellHolding }) => (
        <WatchlistScreen
          holdings={safeHoldings}
          totalPortfolioValue={totalPortfolioValue}
          privacyMode={privacyMode}
          embedded
          onAddHolding={onAddHolding}
          onSellHolding={onSellHolding}
        />
      )}
    />
  );
}
