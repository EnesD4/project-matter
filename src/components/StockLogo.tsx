import React, { useEffect, useMemo, useState } from "react";
import { getEtfIcon } from "../lib/etfIcons";

const EMERALD = "#10B981";
const FALLBACK_BG = "#1F2937";

/** Well-known ticker → company domain, used for Clearbit when Finnhub profile isn't loaded yet. */
const TICKER_DOMAINS: Record<string, string> = {
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  NVDA: "nvidia.com",
  TSLA: "tesla.com",
  AMZN: "amazon.com",
  GOOGL: "google.com",
  GOOG: "google.com",
  META: "meta.com",
  AMD: "amd.com",
  NFLX: "netflix.com",
  JPM: "jpmorganchase.com",
  V: "visa.com",
  MA: "mastercard.com",
  COST: "costco.com",
  AVGO: "broadcom.com",
  "BRK.B": "berkshirehathaway.com",
  "BRK.A": "berkshirehathaway.com",
  DIS: "disney.com",
  INTC: "intel.com",
  PYPL: "paypal.com",
  ADBE: "adobe.com",
  CRM: "salesforce.com",
  ORCL: "oracle.com",
  CSCO: "cisco.com",
  PEP: "pepsico.com",
  KO: "coca-cola.com",
  NKE: "nike.com",
  MCD: "mcdonalds.com",
  WMT: "walmart.com",
  HD: "homedepot.com",
  BA: "boeing.com",
  UNH: "unitedhealthgroup.com",
  JNJ: "jnj.com",
  PFE: "pfizer.com",
  LLY: "lilly.com",
  XOM: "exxonmobil.com",
  CVX: "chevron.com",
  BAC: "bankofamerica.com",
  GS: "goldmansachs.com",
  WFC: "wellsfargo.com",
  AXP: "americanexpress.com",
  UBER: "uber.com",
  ABNB: "airbnb.com",
  SBUX: "starbucks.com",
  QCOM: "qualcomm.com",
  INTU: "intuit.com",
  NOW: "servicenow.com",
  SHOP: "shopify.com",
  COIN: "coinbase.com",
  PLTR: "palantir.com",
  CRWD: "crowdstrike.com",
  PANW: "paloaltonetworks.com",
  F: "ford.com",
  GM: "gm.com",
  RIVN: "rivian.com",
  BABA: "alibaba.com",
  TSM: "tsmc.com",
  ASML: "asml.com",
  IBM: "ibm.com",
  GE: "ge.com",
  SNOW: "snowflake.com",
  MU: "micron.com",
  AMAT: "appliedmaterials.com",
  TXN: "ti.com",
  VOO: "vanguard.com",
  VTI: "vanguard.com",
  VUG: "vanguard.com",
  SPY: "ssga.com",
  QQQ: "invesco.com",
  QQQM: "invesco.com",
  SCHD: "schwab.com",
  IVV: "ishares.com",
};

type StockLogoProps = {
  symbol: string;
  /** Finnhub's own logo CDN URL, if we have one from /stock/profile2. */
  finnhubLogo?: string | null;
  /** Company website domain (e.g. "apple.com"), used for a Clearbit logo fallback. */
  domain?: string | null;
  size?: number;
  className?: string;
};

function tickerInitials(symbol: string) {
  const letters = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (!letters) return symbol.slice(0, 2).toUpperCase();
  if (letters.length <= 4) return letters;
  return letters.slice(0, 2);
}

function InitialsBadge({
  symbol,
  size,
  className,
  label,
}: {
  symbol: string;
  size: number;
  className: string;
  label?: string;
}) {
  const text = label ?? tickerInitials(symbol);
  const fontSize = text.length >= 4 ? size * 0.28 : text.length === 3 ? size * 0.32 : size * 0.38;

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold tracking-tight ${className}`}
      style={{ width: size, height: size, color: EMERALD, background: FALLBACK_BG, fontSize }}
      title={symbol}
      aria-label={`${symbol} icon`}
    >
      {text}
    </span>
  );
}

function logoSources(symbol: string, finnhubLogo?: string | null, domain?: string | null): string[] {
  const ticker = symbol.trim().toUpperCase();
  const yahooTicker = ticker.replace(/\./g, "-");
  const resolvedDomain = (domain || TICKER_DOMAINS[ticker] || "").replace(/^www\./, "");
  const urls = [
    finnhubLogo,
    resolvedDomain ? `https://logo.clearbit.com/${resolvedDomain}` : null,
    `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`,
    `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(ticker)}.png`,
    `https://storage.googleapis.com/iex/api/logos/${encodeURIComponent(yahooTicker)}.png`,
    `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}`,
  ];
  return [...new Set(urls.filter(Boolean) as string[])];
}

/**
 * Renders a company / ETF logo as a plain circular image.
 * Source chain: Finnhub CDN → Clearbit → FMP → IEX → Parqet → emerald initials.
 */
export default function StockLogo({ symbol, finnhubLogo, domain, size = 40, className = "" }: StockLogoProps) {
  const etf = useMemo(() => getEtfIcon(symbol), [symbol]);
  const sources = useMemo(() => logoSources(symbol, finnhubLogo, domain), [symbol, finnhubLogo, domain]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setAttempt(0);
  }, [symbol, finnhubLogo, domain]);

  const src = sources[attempt];

  if (src) {
    return (
      <span
        className={`inline-block flex-shrink-0 overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={src}
          alt={`${symbol} logo`}
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setAttempt((a) => a + 1)}
          className="h-full w-full rounded-full object-cover"
        />
      </span>
    );
  }

  return <InitialsBadge symbol={symbol} size={size} className={className} label={etf?.label} />;
}
