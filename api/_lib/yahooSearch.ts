/**
 * Shared Yahoo Finance fuzzy search helpers used by /api/search and /api/stocks/search.
 */

export type YahooSearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
  exchange?: string;
  isYahooFinance?: boolean;
};

export type YahooSearchNews = {
  title?: string;
  publisher?: string;
  providerPublishTime?: number;
  link?: string;
};

export type StockSearchHit = {
  /** Canonical ticker symbol. */
  symbol: string;
  ticker: string;
  displaySymbol: string;
  shortname: string;
  longname: string;
  quoteType: string;
  /** Human-readable name for UI lists (shortname → longname → symbol). */
  description: string;
  /** Friendly type label for UI chips. */
  type: string;
};

const YAHOO_SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

const US_EXCHANGE_RE =
  /\b(NASDAQ|NYSE|NYSEARCA|NYSE American|AMEX|Cboe|BATS|OTC|OTCQB|OTCQX|PINK)\b/i;

export function yahooSearchUrl(query: string, quotesCount: number, newsCount: number): string {
  const params = new URLSearchParams({
    q: query,
    quotesCount: String(quotesCount),
    newsCount: String(newsCount),
    lang: "en-US",
    region: "US",
    enableFuzzyQuery: "true",
    quotesQueryId: "tss_match_phrase_query",
    multiQuoteQueryId: "multi_quote_single_token_query",
    newsQueryId: "news_cie_vespa",
    enableEnhancedTrivialQuery: "true",
  });
  return `https://query2.finance.yahoo.com/v1/finance/search?${params.toString()}`;
}

export async function yahooFinanceSearch(query: string, quotesCount = 16, newsCount = 0) {
  const urls = [
    yahooSearchUrl(query, quotesCount, newsCount),
    // query1 mirror — some networks block query2 intermittently.
    yahooSearchUrl(query, quotesCount, newsCount).replace(
      "query2.finance.yahoo.com",
      "query1.finance.yahoo.com"
    ),
  ];
  let lastEmpty = { quotes: [] as YahooSearchQuote[], news: [] as YahooSearchNews[] };
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: YAHOO_SEARCH_HEADERS });
      if (!response.ok) continue;
      const json = (await response.json().catch(() => null)) as {
        quotes?: YahooSearchQuote[];
        news?: YahooSearchNews[];
      } | null;
      const quotes = Array.isArray(json?.quotes) ? json.quotes : [];
      const news = Array.isArray(json?.news) ? json.news : [];
      lastEmpty = { quotes, news };
      if (quotes.length > 0 || news.length > 0) {
        return { quotes, news };
      }
    } catch {
      // try next host
    }
  }
  return lastEmpty;
}

function mapQuoteTypeLabel(quoteType: string): string {
  const type = quoteType.toUpperCase();
  if (type === "ETF") return "ETF";
  if (type === "MUTUALFUND") return "Mutual Fund";
  if (type === "EQUITY" || !type) return "Common Stock";
  return quoteType || "Common Stock";
}

export function mapYahooQuoteToSearchHit(
  row: YahooSearchQuote
): (StockSearchHit & { rank: number }) | null {
  const symbol = String(row.symbol || "")
    .trim()
    .toUpperCase();
  if (!symbol || symbol.includes("=") || symbol.includes("^")) return null;
  if (row.isYahooFinance === false) return null;

  const quoteType = String(row.quoteType || "").trim();
  const typeUpper = quoteType.toUpperCase();
  // Accept equities/ETFs/funds; also allow blank quoteType for fuzzy name hits (e.g. Aeva).
  if (typeUpper && !["EQUITY", "ETF", "MUTUALFUND", "INDEX"].includes(typeUpper)) return null;
  if (typeUpper === "INDEX") return null;

  const shortname = String(row.shortname || "").trim();
  const longname = String(row.longname || "").trim();
  const description = shortname || longname || symbol;

  // Prefer primary US listings (AAPL, VOO) over foreign dual listings (AAPL.MX, 1RCAT.MI).
  const hasForeignSuffix = /[.=]/.test(symbol);
  const exch = `${row.exchDisp || ""} ${row.exchange || ""}`;
  const isUsExchange = US_EXCHANGE_RE.test(exch) || (!hasForeignSuffix && !exch.trim());

  let rank = 50;
  if (typeUpper === "EQUITY" || typeUpper === "ETF" || !typeUpper) rank -= 10;
  if (!hasForeignSuffix) rank -= 20;
  if (isUsExchange) rank -= 15;
  if (typeUpper === "ETF") rank -= 2;

  return {
    symbol,
    ticker: symbol,
    displaySymbol: symbol,
    shortname,
    longname,
    quoteType: quoteType || "EQUITY",
    description,
    type: mapQuoteTypeLabel(quoteType),
    rank,
  };
}

/** Run fuzzy Yahoo search and return ranked US-preferring hits. */
export async function searchYahooFinanceQuotes(query: string, limit = 10): Promise<StockSearchHit[]> {
  const q = String(query || "")
    .trim()
    .slice(0, 64);
  if (!q) return [];

  const { quotes } = await yahooFinanceSearch(q, 24, 0);
  const seen = new Set<string>();
  const mapped = quotes
    .map(mapYahooQuoteToSearchHit)
    .filter((row): row is StockSearchHit & { rank: number } => row != null);

  // If US filters removed everything, still return the best Yahoo hits (never invent cards).
  const preferUs = mapped.filter((row) => !/[.=]/.test(row.symbol));
  const pool = preferUs.length > 0 ? preferUs : mapped;

  return pool
    .sort((a, b) => a.rank - b.rank || a.symbol.localeCompare(b.symbol))
    .filter((row) => {
      if (seen.has(row.symbol)) return false;
      seen.add(row.symbol);
      return true;
    })
    .slice(0, limit)
    .map(({ symbol, ticker, displaySymbol, shortname, longname, quoteType, description, type }) => ({
      symbol,
      ticker,
      displaySymbol,
      shortname,
      longname,
      quoteType,
      description,
      type,
    }));
}
