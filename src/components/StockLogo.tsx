import React, { useMemo, useState } from "react";
import { getEtfIcon } from "../lib/etfIcons";

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

function InitialsBadge({
  symbol,
  size,
  className,
  bg,
  fg,
  label,
}: {
  symbol: string;
  size: number;
  className: string;
  bg?: string;
  fg?: string;
  label?: string;
}) {
  const text =
    label ??
    (symbol.replace(/[^A-Z]/gi, "").slice(0, 2).toUpperCase() || symbol.slice(0, 2).toUpperCase());
  const color = fg ?? colorForSymbol(symbol);
  const background = bg ?? `${colorForSymbol(symbol)}33`;
  const fontSize = text.length >= 4 ? size * 0.22 : text.length === 3 ? size * 0.26 : size * 0.32;

  return (
    <span
      className={`grid flex-shrink-0 place-items-center rounded-full font-extrabold tracking-tight ${className}`}
      style={{ width: size, height: size, background, color, fontSize }}
      title={symbol}
      aria-label={`${symbol} icon`}
    >
      {text}
    </span>
  );
}

/**
 * Renders a company / ETF logo with a graceful fallback chain:
 * curated ETF badge → Finnhub CDN → Clearbit domain → ticker-initials badge.
 * Known ETFs skip remote images to avoid broken Clearbit/Finnhub links.
 */
export default function StockLogo({ symbol, finnhubLogo, domain, size = 32, className = "" }: StockLogoProps) {
  const etf = useMemo(() => getEtfIcon(symbol), [symbol]);
  const sources = useMemo(() => {
    if (etf) return [] as string[];
    return [finnhubLogo, domain ? `https://logo.clearbit.com/${domain}` : null].filter(Boolean) as string[];
  }, [etf, finnhubLogo, domain]);
  const [attempt, setAttempt] = useState(0);

  if (etf) {
    return (
      <InitialsBadge
        symbol={symbol}
        size={size}
        className={className}
        bg={etf.bg}
        fg={etf.fg}
        label={etf.label}
      />
    );
  }

  const src = sources[attempt];

  if (src) {
    return (
      <img
        src={src}
        alt={`${symbol} logo`}
        width={size}
        height={size}
        onError={() => setAttempt((a) => a + 1)}
        className={`flex-shrink-0 rounded-full bg-transparent object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return <InitialsBadge symbol={symbol} size={size} className={className} />;
}
