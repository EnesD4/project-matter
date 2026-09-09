import { useCallback, useEffect, useRef, useState } from "react";
import { isUsMarketOpen } from "../lib/marketInsights";
import { usePageVisibility } from "./usePageVisibility";

export const MARKET_POLL_INTERVAL_MS = 5_000;

type UseMarketPollingOptions = {
  enabled?: boolean;
  intervalMs?: number;
  /** Background refresh. Must not toggle full-page loading UI. */
  onPoll: () => void | Promise<void>;
};

/**
 * Polls `onPoll` every 5s while the US cash session is open and this tab is visible.
 * Pauses on `document.hidden` and fetches immediately when the user returns.
 */
export function useMarketPolling({
  enabled = true,
  intervalMs = MARKET_POLL_INTERVAL_MS,
  onPoll,
}: UseMarketPollingOptions) {
  const isVisible = usePageVisibility();
  const [marketOpen, setMarketOpen] = useState(() => isUsMarketOpen());
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;
  const inFlightRef = useRef(false);

  const markUpdated = useCallback(() => {
    setLastUpdatedAt(Date.now());
  }, []);

  const runPoll = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await onPollRef.current();
      setLastUpdatedAt(Date.now());
    } catch {
      // Keep the previous timestamp; the next tick will retry.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const syncMarket = () => setMarketOpen(isUsMarketOpen());
    syncMarket();
    const id = window.setInterval(syncMarket, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const prevVisibleRef = useRef(isVisible);
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = isVisible;
    if (!enabled || !isVisible || wasVisible) return;
    void runPoll();
  }, [enabled, isVisible, runPoll]);

  useEffect(() => {
    if (!enabled || !isVisible) return;

    const tick = () => {
      const open = isUsMarketOpen();
      setMarketOpen(open);
      if (!open || document.hidden) return;
      void runPoll();
    };

    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, isVisible, intervalMs, runPoll]);

  return {
    lastUpdatedAt,
    markUpdated,
    marketOpen,
    isVisible,
    isLive: Boolean(enabled && isVisible && marketOpen),
  };
}
