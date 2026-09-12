import React, { useState } from "react";
import type { Holding, StockHolding } from "./InvestmentPortfolioCard";
import StockDetailPage from "./StockDetailPage";
import WatchlistsSection, { type WatchlistStockPick } from "./WatchlistsSection";

function stubHoldingFromWatchlist(pick: WatchlistStockPick): StockHolding {
  const prevClose =
    pick.changePct <= -99.9 ? pick.price : pick.price / (1 + pick.changePct / 100);
  return {
    id: `watchlist:${pick.symbol}`,
    kind: "stock",
    symbol: pick.symbol,
    description: pick.name,
    quantity: 0,
    avgCost: 0,
    currentPrice: pick.price,
    dayChangePct: pick.changePct,
    dayChangeAbs: pick.price - prevClose,
    open: prevClose,
    high: Math.max(pick.price, prevClose),
    low: Math.min(pick.price, prevClose),
    prevClose,
    logo: pick.logo,
    domain: pick.domain,
    account: "paper",
  };
}

export type WatchlistScreenProps = {
  holdings: Holding[];
  totalPortfolioValue: number;
  privacyMode?: boolean;
  /** Drop the outer card chrome when nested inside the Investment screen. */
  embedded?: boolean;
  onAddHolding?: (holding: StockHolding) => void;
  onSellHolding?: (
    holding: StockHolding,
    shares: number,
    sellPrice: number
  ) => Promise<{ remainingShares: number }>;
};

export default function WatchlistScreen({
  holdings,
  totalPortfolioValue,
  privacyMode = false,
  embedded = false,
  onAddHolding,
  onSellHolding,
}: WatchlistScreenProps) {
  const [selectedHolding, setSelectedHolding] = useState<StockHolding | null>(null);

  const openWatchlistStock = (pick: WatchlistStockPick) => {
    const existing = holdings.find(
      (h): h is StockHolding => h.kind === "stock" && h.symbol === pick.symbol
    );
    setSelectedHolding(existing ?? stubHoldingFromWatchlist(pick));
  };

  return (
    <div className={embedded ? "mt-5" : "rounded-2xl border border-[#1F2937] bg-[#000000] p-4 sm:p-5"}>
      <WatchlistsSection onSelectStock={openWatchlistStock} privacyMode={privacyMode} />

      {selectedHolding && (
        <StockDetailPage
          holding={selectedHolding}
          totalPortfolioValue={totalPortfolioValue}
          privacyMode={privacyMode}
          onBack={() => setSelectedHolding(null)}
          onAddMore={onAddHolding}
          onSell={
            onSellHolding && selectedHolding.quantity > 0 && selectedHolding.account !== "verified"
              ? async (holding, shares, sellPrice) => {
                  const result = await onSellHolding(holding, shares, sellPrice);
                  if (result.remainingShares <= 1e-8) {
                    setSelectedHolding(null);
                  } else {
                    setSelectedHolding((prev) =>
                      prev ? { ...prev, quantity: result.remainingShares } : prev
                    );
                  }
                  return result;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
