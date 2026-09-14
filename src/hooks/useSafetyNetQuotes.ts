import { useEffect, useMemo, useState } from "react";
import { usePageVisibility } from "./usePageVisibility";
import {
  fetchGoldPricePerOz,
  fetchQuotePrice,
  readCachedGoldPrice,
  type SafetyNetConfig,
} from "../lib/safetyNet";

const QUOTE_POLL_MS = 60_000;

export function useSafetyNetQuotes(config: SafetyNetConfig) {
  const isVisible = usePageVisibility();
  const [goldPricePerOz, setGoldPricePerOz] = useState<number | null>(() => readCachedGoldPrice());
  const [bondPrices, setBondPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const bondSymbols = useMemo(() => {
    const symbols = new Set<string>();
    for (const bond of config?.bonds || []) {
      if (bond.kind === "ticker" && bond.symbol) symbols.add(bond.symbol);
    }
    return [...symbols].sort();
  }, [config.bonds]);
  const bondSymbolsKey = bondSymbols.join(",");

  useEffect(() => {
    if (!isVisible) return;

    let cancelled = false;
    const controller = new AbortController();
    const symbols = bondSymbolsKey ? bondSymbolsKey.split(",") : [];

    const load = async (background: boolean) => {
      if (!background) setLoading(true);
      try {
        const [gold, tickerQuotes] = await Promise.all([
          fetchGoldPricePerOz(controller.signal),
          Promise.all(
            symbols.map(async (symbol) => {
              const price = await fetchQuotePrice(symbol, controller.signal);
              return [symbol, price] as const;
            })
          ),
        ]);
        if (cancelled) return;
        if (gold) setGoldPricePerOz(gold);
        setBondPrices((prev) => {
          const next = { ...prev };
          for (const [symbol, price] of tickerQuotes) {
            if (price) next[symbol] = price;
          }
          return next;
        });
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
      } finally {
        if (!cancelled && !background) setLoading(false);
      }
    };

    void load(false);
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void load(true);
    }, QUOTE_POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [bondSymbolsKey, isVisible]);

  return { goldPricePerOz, bondPrices, loading };
}
