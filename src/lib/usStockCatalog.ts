/**
 * Pre-mapped top US equities & ETFs for instant client-side search.
 * Matched by ticker, company name, and optional aliases (e.g. "red cat" → RCAT).
 */

export type UsStockCatalogEntry = {
  symbol: string;
  name: string;
  type: "Common Stock" | "ETF";
  /** Extra phrases that should resolve this symbol (normalized at match time). */
  aliases?: string[];
};

export const US_STOCK_SEARCH_CATALOG: UsStockCatalogEntry[] = [
  { symbol: "AAPL", name: "Apple Inc.", type: "Common Stock", aliases: ["apple"] },
  { symbol: "MSFT", name: "Microsoft Corp.", type: "Common Stock", aliases: ["microsoft"] },
  { symbol: "NVDA", name: "NVIDIA Corp.", type: "Common Stock", aliases: ["nvidia"] },
  { symbol: "GOOGL", name: "Alphabet Inc.", type: "Common Stock", aliases: ["google", "alphabet"] },
  { symbol: "GOOG", name: "Alphabet Inc. Class C", type: "Common Stock", aliases: ["google"] },
  { symbol: "AMZN", name: "Amazon.com Inc.", type: "Common Stock", aliases: ["amazon"] },
  { symbol: "META", name: "Meta Platforms", type: "Common Stock", aliases: ["facebook", "meta"] },
  { symbol: "TSLA", name: "Tesla Inc.", type: "Common Stock", aliases: ["tesla"] },
  { symbol: "BRK.B", name: "Berkshire Hathaway Class B", type: "Common Stock", aliases: ["berkshire"] },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", type: "Common Stock", aliases: ["jpmorgan", "jp morgan"] },
  { symbol: "V", name: "Visa Inc.", type: "Common Stock", aliases: ["visa"] },
  { symbol: "MA", name: "Mastercard Inc.", type: "Common Stock", aliases: ["mastercard"] },
  { symbol: "JNJ", name: "Johnson & Johnson", type: "Common Stock", aliases: ["johnson"] },
  { symbol: "XOM", name: "Exxon Mobil Corp.", type: "Common Stock", aliases: ["exxon"] },
  { symbol: "UNH", name: "UnitedHealth Group", type: "Common Stock", aliases: ["unitedhealth"] },
  { symbol: "LLY", name: "Eli Lilly and Co.", type: "Common Stock", aliases: ["lilly", "eli lilly"] },
  { symbol: "AVGO", name: "Broadcom Inc.", type: "Common Stock", aliases: ["broadcom"] },
  { symbol: "COST", name: "Costco Wholesale", type: "Common Stock", aliases: ["costco"] },
  { symbol: "HD", name: "Home Depot Inc.", type: "Common Stock", aliases: ["home depot"] },
  { symbol: "PG", name: "Procter & Gamble", type: "Common Stock", aliases: ["procter", "p&g"] },
  { symbol: "NFLX", name: "Netflix Inc.", type: "Common Stock", aliases: ["netflix"] },
  { symbol: "AMD", name: "Advanced Micro Devices", type: "Common Stock", aliases: ["amd"] },
  { symbol: "CRM", name: "Salesforce Inc.", type: "Common Stock", aliases: ["salesforce"] },
  { symbol: "ORCL", name: "Oracle Corp.", type: "Common Stock", aliases: ["oracle"] },
  { symbol: "ADBE", name: "Adobe Inc.", type: "Common Stock", aliases: ["adobe"] },
  { symbol: "INTC", name: "Intel Corp.", type: "Common Stock", aliases: ["intel"] },
  { symbol: "CSCO", name: "Cisco Systems", type: "Common Stock", aliases: ["cisco"] },
  { symbol: "KO", name: "Coca-Cola Co.", type: "Common Stock", aliases: ["coca cola", "coke"] },
  { symbol: "PEP", name: "PepsiCo Inc.", type: "Common Stock", aliases: ["pepsi", "pepsico"] },
  { symbol: "DIS", name: "Walt Disney Co.", type: "Common Stock", aliases: ["disney"] },
  { symbol: "BA", name: "Boeing Co.", type: "Common Stock", aliases: ["boeing"] },
  { symbol: "NKE", name: "Nike Inc.", type: "Common Stock", aliases: ["nike"] },
  { symbol: "UBER", name: "Uber Technologies", type: "Common Stock", aliases: ["uber"] },
  { symbol: "COIN", name: "Coinbase Global", type: "Common Stock", aliases: ["coinbase"] },
  { symbol: "PLTR", name: "Palantir Technologies", type: "Common Stock", aliases: ["palantir"] },
  { symbol: "SOFI", name: "SoFi Technologies", type: "Common Stock", aliases: ["sofi"] },
  { symbol: "RCAT", name: "Red Cat Holdings Inc.", type: "Common Stock", aliases: ["red cat", "redcat", "red cat holdings"] },
  { symbol: "IBM", name: "International Business Machines", type: "Common Stock", aliases: ["ibm"] },
  { symbol: "OXY", name: "Occidental Petroleum", type: "Common Stock", aliases: ["occidental"] },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", type: "ETF", aliases: ["s&p 500", "sp500"] },
  { symbol: "QQQ", name: "Invesco QQQ Trust", type: "ETF", aliases: ["nasdaq 100", "qqq"] },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "ETF", aliases: ["vanguard s&p", "s&p 500"] },
  { symbol: "VTI", name: "Vanguard Total Stock Market", type: "ETF", aliases: ["total market"] },
  { symbol: "SCHD", name: "Schwab US Dividend Equity", type: "ETF", aliases: ["schwab dividend"] },
  { symbol: "VXUS", name: "Vanguard Total International", type: "ETF", aliases: ["vanguard international"] },
  { symbol: "IVV", name: "iShares Core S&P 500 ETF", type: "ETF" },
  { symbol: "VIG", name: "Vanguard Dividend Appreciation", type: "ETF", aliases: ["dividend appreciation"] },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", type: "ETF", aliases: ["russell 2000"] },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average", type: "ETF", aliases: ["dow jones"] },
  { symbol: "ARKK", name: "ARK Innovation ETF", type: "ETF", aliases: ["ark innovation"] },
  { symbol: "BND", name: "Vanguard Total Bond Market", type: "ETF", aliases: ["total bond"] },
];

/** Combined name + aliases text used for fuzzy company matching. */
export function catalogSearchText(entry: UsStockCatalogEntry): string {
  return [entry.name, ...(entry.aliases || [])].join(" ");
}
