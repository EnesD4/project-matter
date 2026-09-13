import React, { useEffect, useMemo, useState } from "react";
import {
  getCryptoAsset,
  logoSources,
  tickerInitials,
} from "../lib/assetLogos";
import { getEtfIcon } from "../lib/etfIcons";

const EMERALD = "#10B981";
const CONTAINER_BG = "linear-gradient(180deg, #0C241C 0%, #061612 100%)";
const CONTAINER_RING = "inset 0 0 0 1px rgba(16, 185, 129, 0.16)";

type StockLogoProps = {
  symbol: string;
  /** Finnhub's own logo CDN URL, if we have one from /stock/profile2. */
  finnhubLogo?: string | null;
  /** Company website domain (e.g. "apple.com"), used for a Clearbit logo fallback. */
  domain?: string | null;
  size?: number;
  className?: string;
  /** Circle matches Midas watchlist chips; rounded is available for denser rows. */
  shape?: "circle" | "rounded";
};

function TickerGlyph({
  symbol,
  size,
}: {
  symbol: string;
  size: number;
}) {
  const etf = getEtfIcon(symbol);
  const crypto = getCryptoAsset(symbol);
  const text = etf?.label ?? tickerInitials(symbol);
  const fontSize = text.length >= 4 ? 17 : text.length === 3 ? 20 : 24;
  const fill = etf?.bg ?? crypto?.color ?? "transparent";
  const fg = etf?.fg ?? (crypto ? "#FFFFFF" : EMERALD);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {fill !== "transparent" ? <rect width="64" height="64" fill={fill} /> : null}
      <text
        x="32"
        y="34"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={fg}
        fontSize={fontSize}
        fontWeight={800}
        fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
        letterSpacing={text.length >= 4 ? -0.6 : 0}
      >
        {text}
      </text>
    </svg>
  );
}

/**
 * Midas-style asset mark: dark-emerald rounded container, instant SVG glyph,
 * then a high-res PNG (Clearbit / coin icons / issuer CDNs) faded in on load.
 */
export default function StockLogo({
  symbol,
  finnhubLogo,
  domain,
  size = 40,
  className = "",
  shape = "circle",
}: StockLogoProps) {
  const sources = useMemo(
    () => logoSources(symbol, finnhubLogo, domain),
    [symbol, finnhubLogo, domain]
  );
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setLoaded(false);
  }, [symbol, finnhubLogo, domain]);

  const src = sources[attempt];
  const radius = shape === "rounded" ? "rounded-xl" : "rounded-full";
  const pad = Math.max(4, Math.round(size * 0.16));

  return (
    <span
      className={`matter-asset-logo relative inline-flex flex-shrink-0 items-center justify-center overflow-hidden ${radius} ${className}`}
      style={{
        width: size,
        height: size,
        background: CONTAINER_BG,
        boxShadow: CONTAINER_RING,
        WebkitTouchCallout: "none",
        WebkitUserDrag: "none",
      } as React.CSSProperties}
      title={symbol}
      aria-label={`${symbol} logo`}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <span
        className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${
          loaded ? "opacity-0" : "opacity-100"
        }`}
      >
        <TickerGlyph symbol={symbol} size={size} />
      </span>
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading={size >= 36 ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onContextMenu={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setAttempt((current) => current + 1);
          }}
          className={`pointer-events-none absolute select-none object-contain drag-none transition-opacity duration-200 ${
            loaded ? "opacity-100" : "opacity-0"
          } ${radius}`}
          style={{
            inset: pad,
            width: size - pad * 2,
            height: size - pad * 2,
          }}
        />
      ) : null}
    </span>
  );
}
