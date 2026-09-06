import React, { useMemo, useState } from "react";

const INITIALS_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#22D3EE", "#F43F5E", "#22C55E"];

function colorForSymbol(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  return INITIALS_COLORS[hash % INITIALS_COLORS.length];
}

type StockLogoProps = {
  symbol: string;
  /** Finnhub's own logo CDN URL, if we have one from /stock/profile2. */
  finnhubLogo?: string | null;
  /** Company website domain (e.g. "apple.com"), used for a Clearbit logo fallback. */
  domain?: string | null;
  size?: number;
  className?: string;
};

/**
 * Renders a company logo with a graceful fallback chain:
 * Finnhub CDN logo -> Clearbit domain logo -> styled ticker-initials badge.
 */
export default function StockLogo({ symbol, finnhubLogo, domain, size = 32, className = "" }: StockLogoProps) {
  const sources = useMemo(
    () => [finnhubLogo, domain ? `https://logo.clearbit.com/${domain}` : null].filter(Boolean) as string[],
    [finnhubLogo, domain]
  );
  const [attempt, setAttempt] = useState(0);

  const src = sources[attempt];
  const initials = symbol.replace(/[^A-Z]/gi, "").slice(0, 2).toUpperCase() || symbol.slice(0, 2).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={`${symbol} logo`}
        width={size}
        height={size}
        onError={() => setAttempt((a) => a + 1)}
        className={`flex-shrink-0 rounded-lg bg-white object-contain p-1 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`grid flex-shrink-0 place-items-center rounded-lg font-extrabold text-white ${className}`}
      style={{ width: size, height: size, background: colorForSymbol(symbol), fontSize: size * 0.32 }}
    >
      {initials}
    </span>
  );
}
