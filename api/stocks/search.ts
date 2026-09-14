export const config = {
  runtime: "nodejs",
  maxDuration: 15,
};

type SearchResult = {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
};

const CATALOG: SearchResult[] = [
  { symbol: "AAPL", displaySymbol: "AAPL", description: "Apple Inc.", type: "Common Stock" },
  { symbol: "MSFT", displaySymbol: "MSFT", description: "Microsoft Corp.", type: "Common Stock" },
  { symbol: "NVDA", displaySymbol: "NVDA", description: "NVIDIA Corp.", type: "Common Stock" },
  { symbol: "GOOGL", displaySymbol: "GOOGL", description: "Alphabet Inc.", type: "Common Stock" },
  { symbol: "AMZN", displaySymbol: "AMZN", description: "Amazon.com Inc.", type: "Common Stock" },
  { symbol: "META", displaySymbol: "META", description: "Meta Platforms", type: "Common Stock" },
  { symbol: "TSLA", displaySymbol: "TSLA", description: "Tesla Inc.", type: "Common Stock" },
  { symbol: "SPY", displaySymbol: "SPY", description: "SPDR S&P 500 ETF", type: "ETF" },
  { symbol: "QQQ", displaySymbol: "QQQ", description: "Invesco QQQ Trust", type: "ETF" },
  { symbol: "VOO", displaySymbol: "VOO", description: "Vanguard S&P 500 ETF", type: "ETF" },
  { symbol: "VTI", displaySymbol: "VTI", description: "Vanguard Total Stock Market", type: "ETF" },
  { symbol: "SCHD", displaySymbol: "SCHD", description: "Schwab US Dividend Equity", type: "ETF" },
];

function sendJson(res: any, status: number, payload: unknown) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function queryQ(req: any): string {
  try {
    const url = new URL(req.url || "", "http://localhost");
    return String(url.searchParams.get("q") || url.searchParams.get("query") || "")
      .trim()
      .slice(0, 40);
  } catch {
    return "";
  }
}

function catalogMatches(query: string): SearchResult[] {
  const needle = query.toUpperCase();
  const rows = CATALOG.filter(
    (row) => row.symbol.includes(needle) || row.description.toUpperCase().includes(needle)
  );
  if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(needle) && !rows.some((row) => row.symbol === needle)) {
    rows.unshift({
      symbol: needle,
      displaySymbol: needle,
      description: needle,
      type: "Common Stock",
    });
  }
  return rows.slice(0, 8);
}

export default async function handler(req: any, res: any) {
  const query = queryQ(req);
  if (!query) {
    return sendJson(res, 200, []);
  }

  try {
    const yahoo = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`,
      { headers: { "User-Agent": "Sprout/1.0" } }
    );
    const json = (await yahoo.json().catch(() => null)) as {
      quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string }>;
    } | null;
    const remote = (json?.quotes ?? [])
      .map((row) => {
        const symbol = String(row.symbol || "").trim().toUpperCase();
        if (!symbol || symbol.includes("=")) return null;
        const type = String(row.quoteType || "").toUpperCase();
        if (type && !["EQUITY", "ETF", "MUTUALFUND", "INDEX"].includes(type)) return null;
        return {
          symbol,
          displaySymbol: symbol,
          description: String(row.shortname || row.longname || symbol).trim() || symbol,
          type: type === "ETF" ? "ETF" : "Common Stock",
        } satisfies SearchResult;
      })
      .filter((row): row is SearchResult => row != null)
      .slice(0, 8);
    if (remote.length > 0) return sendJson(res, 200, remote);
  } catch {
    // fall through to catalog
  }

  return sendJson(res, 200, catalogMatches(query));
}
