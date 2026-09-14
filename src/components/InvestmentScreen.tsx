import React from "react";
import InvestmentPortfolioCard, { type Holding } from "./InvestmentPortfolioCard";
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
};

export default function InvestmentScreen({
  holdings,
  totalPortfolioValue,
  onHoldingsChange,
  onConsultSocrates,
  cashBalance,
  privacyMode,
  onTogglePrivacy,
}: InvestmentScreenProps) {
  const safeHoldings = holdings || [];

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
