import React, { useState } from "react";
import { toFiniteNumber } from "../lib/money";
import type { Holding, StockHolding } from "./InvestmentPortfolioCard";
import StockDetailPage from "./StockDetailPage";
import WatchlistsSection, { type WatchlistStockPick } from "./WatchlistsSection";

function stubHoldingFromWatchlist(pick: WatchlistStockPick): StockHolding {
  const price = toFiniteNumber(pick?.price, 0);
  const changePct = toFiniteNumber(pick?.changePct, 0);
  const prevClose = changePct <= -99.9 ? price : price / (1 + changePct / 100);
  const safePrevClose = toFiniteNumber(prevClose, price);
  return {
    id: `watchlist:${pick.symbol}`,
    kind: "stock",
    symbol: pick.symbol,
    description: pick.name,
    quantity: 0,
    avgCost: 0,
    currentPrice: price,
    dayChangePct: changePct,
    dayChangeAbs: price - safePrevClose,
    open: safePrevClose,
    high: Math.max(price, safePrevClose),
    low: Math.min(price, safePrevClose),
    prevClose: safePrevClose,
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
  const safeHoldings = holdings || [];

  const openWatchlistStock = (pick: WatchlistStockPick) => {
    const existing = safeHoldings.find(
      (h): h is StockHolding => h?.kind === "stock" && h.symbol === pick.symbol
    );
    setSelectedHolding(existing ?? stubHoldingFromWatchlist(pick));
  };

  return (
    <div className={embedded ? "mt-5" : "rounded-2xl border border-[#1F2937] bg-[#000000] p-4 sm:p-5"}>
      <WatchlistsSection onSelectStock={openWatchlistStock} privacyMode={privacyMode} />

      {selectedHolding && (
        <StockDetailPage
          holding={selectedHolding}
          totalPortfolioValue={toFiniteNumber(totalPortfolioValue, 0)}
          privacyMode={privacyMode}
          onBack={() => setSelectedHolding(null)}
          onAddMore={onAddHolding}
          onSell={
            onSellHolding &&
            toFiniteNumber(selectedHolding.quantity, 0) > 0 &&
            selectedHolding.account !== "verified"
              ? async (holding, shares, sellPrice) => {
                  const result = await onSellHolding(holding, shares, sellPrice);
                  if (result.remainingShares <= 1e-8) {
                    setSelectedHolding(null);
                  } else {
                    setSelectedHolding((prev) =>
                      prev
                        ? { ...prev, quantity: toFiniteNumber(result.remainingShares, 0) }
                        : prev
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
