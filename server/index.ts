import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import authRoutes from './routes/auth';
import portfolioRoutes from './routes/portfolio';
import userRoutes from './routes/user';
import watchlistRoutes from './routes/watchlists';
import cashFlowRoutes from './routes/cashFlow';
import {
  fetchDividendDetailsMany,
  fetchHistoricalClose,
  fetchStockChart,
  fetchYahooQuote,
  parseChartRange,
  rangeInterval,
} from './lib/yahooFinance';
import { parseFlexibleDate, todayIsoLocal } from './lib/dates';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || '';

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/user', userRoutes);
app.use('/api/watchlists', watchlistRoutes);
app.use('/api/cash-flow', cashFlowRoutes);

type MarketNewsItem = {
  headline?: string;
  summary?: string;
  source?: string;
  datetime?: number;
};

type DailyReportPayload = {
  marketOpen: boolean;
  title: string;
  macroDrivers: string;
  indexMovements: string;
  sentimentTakeaway: string;
  source: 'ai' | 'fallback';
};

function isUsMarketOpen(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const weekday = get('weekday');
  const hour = Number(get('hour') === '24' ? '0' : get('hour'));
  const minute = Number(get('minute'));
  const minutes = hour * 60 + minute;

  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return minutes >= open && minutes < close;
}

function reportTitle(marketOpen: boolean): string {
  return marketOpen
    ? "Today's US Market Overview"
    : 'Latest Market Wrap & Macro Outlook';
}

function fallbackReport(marketOpen: boolean): DailyReportPayload {
  return {
    marketOpen,
    title: reportTitle(marketOpen),
    macroDrivers: marketOpen
      ? 'Macro drivers today center on Fed policy expectations, Treasury yield moves, inflation and growth data, and the broader earnings-season tone. Rate-path pricing and soft-landing odds remain the primary catalysts steering risk appetite across US equities.'
      : 'With cash equities offline, the latest macro backdrop still hinges on Fed stance, Treasury yields, and inflation/growth surprises. Carry-forward catalysts continue to frame overnight futures and set up the next cash open.',
    indexMovements: marketOpen
      ? 'The S&P 500 is trading as the broad beta barometer for large-cap US risk, while the Nasdaq reflects growth and duration sensitivity in mega-cap tech. The Dow Jones is tracking more cyclically tilted blue chips, so relative leadership among the three indexes signals whether the session is risk-on, defensive, or mixed.'
      : 'In the most recent cash session, the S&P 500 captured broad large-cap tone, the Nasdaq mirrored growth/tech leadership (or lack of it), and the Dow Jones reflected cyclical blue-chip breadth. Futures now extend that relative performance into the next open.',
    sentimentTakeaway: marketOpen
      ? 'Overall sentiment remains macro-driven rather than single-stock driven: watch yields, Fed speak, and major data releases for directional cues. Stay focused on index-level risk appetite and sector rotation instead of name-specific noise.'
      : 'The wrap takeaway is portfolio-level: US equity direction still tracks policy odds and growth/inflation balance more than idiosyncratic headlines. Use the closed-session window to reassess allocation risk rather than chase individual names.',
    source: 'fallback',
  };
}

async function fetchMarketHeadlines(): Promise<string[]> {
  if (!FINNHUB_API_KEY) return [];
  try {
    const response = await axios.get<MarketNewsItem[]>(
      `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`,
      { timeout: 8000 }
    );
    const items = Array.isArray(response.data) ? response.data : [];
    const keyword =
      /\b(fed|fomc|treasury|yield|inflation|cpi|jobs|payroll|gdp|s&p|nasdaq|dow|equity|equities|wall street|earnings|rate cut|rate hike|recession|soft landing)\b/i;
    const scored = items
      .map((n) => (n.headline || n.summary || '').trim())
      .filter(Boolean)
      .sort((a, b) => Number(keyword.test(b)) - Number(keyword.test(a)));
    return scored.slice(0, 8);
  } catch (error) {
    console.error('Error fetching market news:', error);
    return [];
  }
}

function parseAiJson(text: string): {
  macroDrivers: string;
  indexMovements: string;
  sentimentTakeaway: string;
} | null {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const macroDrivers = String(parsed.macroDrivers || '').trim();
    const indexMovements = String(parsed.indexMovements || '').trim();
    const sentimentTakeaway = String(parsed.sentimentTakeaway || '').trim();
    if (!macroDrivers || !indexMovements || !sentimentTakeaway) return null;
    return { macroDrivers, indexMovements, sentimentTakeaway };
  } catch {
    return null;
  }
}

async function generateAiReport(
  marketOpen: boolean,
  headlines: string[]
): Promise<DailyReportPayload | null> {
  if (!GEMINI_API_KEY) return null;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

  const sessionLabel = marketOpen ? 'US cash equity markets are OPEN' : 'US cash equity markets are CLOSED';
  const headlineBlock =
    headlines.length > 0
      ? headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
      : 'No live headlines available — reason from current US macro consensus.';

  const prompt = `You are a senior US equity market strategist writing a concise daily brief for retail investors.

Context: ${sessionLabel} (America/New_York session).
Recent market headlines:
${headlineBlock}

Return ONLY valid JSON with exactly these keys (no markdown, no extra keys):
{
  "macroDrivers": "1 short paragraph on macro catalysts (Fed stance, Treasury yields, inflation/growth data, earnings-season tone). No single-stock picks.",
  "indexMovements": "1 short paragraph on overall performance trends across the S&P 500, Nasdaq, and Dow Jones. No ticker laundry lists.",
  "sentimentTakeaway": "1 short paragraph on high-level market direction and portfolio-level takeaway. Avoid individual stock noise."
}

Rules:
- Exactly 3 paragraphs as the three JSON string values.
- Holistic / macro only. Do not recommend buying or selling specific stocks.
- Clear everyday language. Each paragraph 2–4 sentences.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const parsed = parseAiJson(text);
    if (!parsed) {
      console.error('AI market report JSON parse failed. Raw:', text.slice(0, 400));
      return null;
    }
    return {
      marketOpen,
      title: reportTitle(marketOpen),
      ...parsed,
      source: 'ai',
    };
  } catch (error) {
    console.error('Error generating AI market report:', error);
    return null;
  }
}

// Stock Search Endpoint
app.get('/api/stocks/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.json([]);
    }
    const response = await axios.get(
      `https://finnhub.io/api/v1/search?q=${query}&token=${FINNHUB_API_KEY}`
    );
    res.json(response.data.result || []);
  } catch (error) {
    console.error('Error fetching search results:', error);
    res.status(500).json({ error: 'Failed to fetch search results' });
  }
});

// Company Profile Endpoint (logo, market cap, website domain, etc.)
app.get('/api/stocks/profile', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const response = await axios.get(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching company profile:', error);
    res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});

// Stock Quote Endpoint — Yahoo Finance first, Finnhub fallback
app.get('/api/stocks/quote', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const yahooQuote = await fetchYahooQuote(symbol);
    if (yahooQuote) {
      return res.json(yahooQuote);
    }

    const response = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`,
      { timeout: 8000 }
    );
    const data = (response.data || {}) as Record<string, unknown>;
    res.json({
      ...data,
      dividendYield: data.dividendYield ?? null,
      dividendRate: data.dividendRate ?? null,
      exDividendDate: data.exDividendDate ?? null,
      dividendDate: data.dividendDate ?? null,
    });
  } catch (error) {
    console.error('Error fetching stock quote:', error);
    res.status(500).json({ error: 'Failed to fetch stock quote' });
  }
});

app.get('/api/stocks/dividends', async (req, res) => {
  try {
    const raw = String(req.query.symbols || req.query.symbol || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (raw.length === 0) {
      return res.status(400).json({ error: 'symbols is required' });
    }
    const items = await fetchDividendDetailsMany(raw);
    return res.json({ items });
  } catch (error) {
    console.error('Error fetching dividend details:', error);
    return res.status(500).json({ error: 'Failed to fetch dividend details' });
  }
});

app.get('/api/stocks/:symbol/chart', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  const range = parseChartRange(req.query.range);
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  try {
    const payload = await fetchStockChart(symbol, range);
    return res.json(payload);
  } catch (error) {
    console.error(`Error fetching chart for ${symbol}:`, error);
    return res.json({
      symbol,
      range,
      interval: rangeInterval(range),
      source: 'fallback',
      points: [],
    });
  }
});

app.get('/api/stocks/:symbol/history', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  const isoDate = parseFlexibleDate(req.query.date);
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }
  if (!isoDate) {
    return res.status(400).json({ error: 'date must be MM/DD/YYYY or YYYY-MM-DD' });
  }
  if (isoDate > todayIsoLocal()) {
    return res.status(400).json({ error: 'Purchase date cannot be in the future' });
  }

  try {
    const payload = await fetchHistoricalClose(symbol, isoDate);
    if (payload) return res.json(payload);
  } catch (error) {
    console.error(`Error fetching history for ${symbol}:`, error);
  }

  try {
    const quote = await fetchYahooQuote(symbol);
    if (quote && quote.c > 0) {
      return res.json({
        symbol,
        requestedDate: isoDate,
        date: todayIsoLocal(),
        price: quote.c,
        open: quote.o,
        high: quote.h,
        low: quote.l,
        close: quote.c,
        source: 'fallback',
      });
    }
  } catch (error) {
    console.error(`History fallback quote failed for ${symbol}:`, error);
  }

  return res.json({
    symbol,
    requestedDate: isoDate,
    date: null,
    price: null,
    source: 'fallback',
  });
});

type FinnhubMetricMap = Record<string, unknown>;
type RecommendationTrend = {
  buy?: number;
  hold?: number;
  sell?: number;
  strongBuy?: number;
  strongSell?: number;
  period?: string;
  symbol?: string;
};
type CompanyNewsItem = {
  headline?: string;
  summary?: string;
  source?: string;
  datetime?: number;
};
type StockFundamentals = {
  symbol: string;
  revenueGrowthYoy: number | null;
  cash: number | null;
  debt: number | null;
  fcf: number | null;
  pe: number | null;
  peTag: string;
  recommendation: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    period: string;
  } | null;
};
type StockAnalysisPayload = {
  growthDrivers: string[];
  keyRisks: string[];
  analystConsensus: string;
  sentiment: 'Buy' | 'Hold' | 'Sell';
  source: 'ai' | 'fallback';
  warning?: string;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickMetric(metric: FinnhubMetricMap, keys: string[]): number | null {
  for (const key of keys) {
    const n = asFiniteNumber(metric[key]);
    if (n != null) return n;
  }
  return null;
}

function growthToPercent(raw: number | null): number | null {
  if (raw == null) return null;
  // Finnhub YoY growth is a decimal (0.081 = 8.1%). Values already in percent stay as-is.
  return Math.abs(raw) <= 5 ? raw * 100 : raw;
}

function peValuationTag(pe: number | null): string {
  if (pe == null || pe <= 0) return 'N/A';
  if (pe < 15) return 'Value';
  if (pe < 22) return 'Fair';
  if (pe < 40) return 'Growth Premium';
  return 'Rich';
}

function sharesOutstanding(profile: Record<string, unknown> | null): number | null {
  const millions = asFiniteNumber(profile?.shareOutstanding);
  if (millions == null || millions <= 0) return null;
  return millions * 1_000_000;
}

function fromPerShare(perShare: number | null, shares: number | null): number | null {
  if (perShare == null || shares == null) return null;
  return perShare * shares;
}

async function finnhubGet<T>(path: string, timeout = 8000): Promise<T | null> {
  if (!FINNHUB_API_KEY) return null;
  try {
    const response = await axios.get<T>(`https://finnhub.io/api/v1/${path}${path.includes('?') ? '&' : '?'}token=${FINNHUB_API_KEY}`, {
      timeout,
    });
    return response.data;
  } catch (error) {
    console.error(`Finnhub ${path} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function latestRecommendation(rows: RecommendationTrend[] | null): StockFundamentals['recommendation'] {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  return {
    strongBuy: row.strongBuy ?? 0,
    buy: row.buy ?? 0,
    hold: row.hold ?? 0,
    sell: row.sell ?? 0,
    strongSell: row.strongSell ?? 0,
    period: row.period || '',
  };
}

async function buildStockFundamentals(symbol: string): Promise<StockFundamentals> {
  const [metricRes, profileRes, recRes] = await Promise.all([
    finnhubGet<{ metric?: FinnhubMetricMap }>(`stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`),
    finnhubGet<Record<string, unknown>>(`stock/profile2?symbol=${encodeURIComponent(symbol)}`),
    finnhubGet<RecommendationTrend[]>(`stock/recommendation?symbol=${encodeURIComponent(symbol)}`),
  ]);

  const metric = metricRes?.metric ?? {};
  const shares = sharesOutstanding(profileRes);

  const revenueGrowthYoy = growthToPercent(
    pickMetric(metric, ['revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy', 'revenueGrowthAnnualYoy'])
  );
  const pe = pickMetric(metric, ['peTTM', 'peNormalizedAnnual', 'peAnnual', 'peExclExtraTTM']);

  let cash = fromPerShare(
    pickMetric(metric, [
      'cashPerSharePerShareAnnual',
      'cashPerSharePerShareQuarterly',
      'cashPerShareAnnual',
      'cashPerShareQuarterly',
    ]),
    shares
  );

  let debt = (() => {
    const leverage = pickMetric(metric, [
      'totalDebt/totalEquityAnnual',
      'totalDebt/totalEquityQuarterly',
      'longTermDebt/equityAnnual',
    ]);
    const book = fromPerShare(
      pickMetric(metric, ['bookValuePerShareAnnual', 'bookValuePerShareQuarterly']),
      shares
    );
    if (leverage == null || book == null || book <= 0) return null;
    return leverage * book;
  })();

  let fcf = fromPerShare(pickMetric(metric, ['fcfShareTTM', 'fcfShareAnnual']), shares);
  if (fcf == null) {
    const pfcf = pickMetric(metric, ['pfcfShareTTM', 'pfcfShareAnnual']);
    const marketCapMillions = asFiniteNumber(profileRes?.marketCapitalization);
    if (pfcf != null && pfcf > 0 && marketCapMillions != null && marketCapMillions > 0) {
      fcf = (marketCapMillions * 1_000_000) / pfcf;
    }
  }

  if (cash != null && Math.abs(cash) < 1) cash = null;
  if (debt != null && Math.abs(debt) < 1) debt = null;
  if (fcf != null && Math.abs(fcf) < 1) fcf = null;

  return {
    symbol,
    revenueGrowthYoy,
    cash,
    debt,
    fcf,
    pe,
    peTag: peValuationTag(pe),
    recommendation: latestRecommendation(Array.isArray(recRes) ? recRes : null),
  };
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchCompanyHeadlines(symbol: string): Promise<string[]> {
  const from = isoDateDaysAgo(21);
  const to = isoDateDaysAgo(0);
  const items = await finnhubGet<CompanyNewsItem[]>(
    `company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`
  );
  if (!Array.isArray(items)) return [];
  return items
    .map((n) => (n.headline || n.summary || '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parseStockAnalysisJson(text: string): Omit<StockAnalysisPayload, 'source'> | null {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const growthDrivers = Array.isArray(parsed.growthDrivers)
      ? parsed.growthDrivers.map((s) => String(s).trim()).filter(Boolean)
      : String(parsed.growthDrivers || '')
          .split('\n')
          .map((s) => s.replace(/^[-*•]\s*/, '').trim())
          .filter(Boolean);
    const keyRisks = Array.isArray(parsed.keyRisks)
      ? parsed.keyRisks.map((s) => String(s).trim()).filter(Boolean)
      : String(parsed.keyRisks || '')
          .split('\n')
          .map((s) => s.replace(/^[-*•]\s*/, '').trim())
          .filter(Boolean);
    const analystConsensus = String(parsed.analystConsensus || '').trim();
    const rawSentiment = String(parsed.sentiment || 'Hold').trim();
    const sentiment: StockAnalysisPayload['sentiment'] =
      rawSentiment.toLowerCase() === 'buy'
        ? 'Buy'
        : rawSentiment.toLowerCase() === 'sell'
          ? 'Sell'
          : 'Hold';
    if (growthDrivers.length === 0 || keyRisks.length === 0 || !analystConsensus) return null;
    return {
      growthDrivers: growthDrivers.slice(0, 4),
      keyRisks: keyRisks.slice(0, 4),
      analystConsensus,
      sentiment,
    };
  } catch {
    return null;
  }
}

function fallbackStockAnalysis(
  symbol: string,
  name: string,
  fundamentals: StockFundamentals
): StockAnalysisPayload {
  const rec = fundamentals.recommendation;
  const total = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
  const bullish = rec ? rec.strongBuy + rec.buy : 0;
  const bearish = rec ? rec.sell + rec.strongSell : 0;
  const sentiment: StockAnalysisPayload['sentiment'] =
    total === 0 ? 'Hold' : bullish / total >= 0.55 ? 'Buy' : bearish / total >= 0.3 ? 'Sell' : 'Hold';

  const growth =
    fundamentals.revenueGrowthYoy != null
      ? `${name} (${symbol}) posted ${fundamentals.revenueGrowthYoy >= 0 ? 'positive' : 'negative'} revenue growth of ${fundamentals.revenueGrowthYoy.toFixed(1)}% year over year.`
      : `Recent product cycles, category demand, and operating execution remain the core growth narrative for ${symbol}.`;
  const cashFlow =
    fundamentals.fcf != null && fundamentals.fcf > 0
      ? 'The company is generating free cash flow, which can fund reinvestment, buybacks, or a stronger balance sheet.'
      : 'Watch the next earnings print, major commercial wins, and any guidance updates for confirmation of the growth story.';

  const leverageRisk =
    fundamentals.debt != null && fundamentals.cash != null && fundamentals.debt > fundamentals.cash
      ? 'Net leverage is worth monitoring if rates stay high or cash flow slows.'
      : 'A miss on growth, margins, or guidance could re-rate the stock quickly.';

  const consensus =
    rec && total > 0
      ? `Street sentiment leans ${sentiment}: ${bullish} buy-side ratings vs ${rec.hold} hold and ${bearish} sell in the latest snapshot.`
      : `Analyst coverage is thin right now — treat the setup as a Hold until a clearer Street consensus is available.`;

  return {
    growthDrivers: [growth, cashFlow],
    keyRisks: [
      'Valuation, competition, and macro sensitivity (rates, consumer, or enterprise spend) can all reverse the near-term tape.',
      leverageRisk,
    ],
    analystConsensus: consensus,
    sentiment,
    source: 'fallback',
  };
}

async function generateStockAnalysis(
  symbol: string,
  name: string,
  extras: {
    price?: number;
    changePct?: number;
    positionNote?: string;
    fundamentals: StockFundamentals;
    headlines: string[];
  }
): Promise<StockAnalysisPayload | null> {
  if (!GEMINI_API_KEY) return null;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
  const f = extras.fundamentals;
  const rec = f.recommendation;
  const recLine = rec
    ? `Strong Buy ${rec.strongBuy}, Buy ${rec.buy}, Hold ${rec.hold}, Sell ${rec.sell}, Strong Sell ${rec.strongSell} (period ${rec.period || 'latest'})`
    : 'No live analyst rating snapshot available.';
  const headlineBlock =
    extras.headlines.length > 0
      ? extras.headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
      : 'No recent company headlines available.';
  const priceLine =
    extras.price != null
      ? `Current price: $${extras.price.toFixed(2)}${extras.changePct != null ? ` (${extras.changePct >= 0 ? '+' : ''}${extras.changePct.toFixed(2)}%)` : ''}`
      : 'Current price: not provided.';

  const prompt = `You are Mater AI, a senior equity analyst writing a concise stock briefing for a retail investor inside the MatterPro app.

Stock: ${symbol} (${name})
${priceLine}
Revenue growth YoY: ${f.revenueGrowthYoy != null ? `${f.revenueGrowthYoy.toFixed(1)}%` : 'n/a'}
P/E: ${f.pe != null ? f.pe.toFixed(1) : 'n/a'} (${f.peTag})
Cash: ${f.cash != null ? Math.round(f.cash) : 'n/a'}  Debt: ${f.debt != null ? Math.round(f.debt) : 'n/a'}
Free cash flow: ${f.fcf != null ? Math.round(f.fcf) : 'n/a'}
Analyst ratings: ${recLine}
${extras.positionNote ? `Investor context: ${extras.positionNote}` : ''}
Recent headlines:
${headlineBlock}

Return ONLY valid JSON (no markdown) with exactly these keys:
{
  "growthDrivers": ["2-4 short bullets on recent earnings, key deals, product cycles, or operating highlights"],
  "keyRisks": ["2-4 short bullets on material risks to watch"],
  "analystConsensus": "1-2 sentences summarizing overall Buy/Hold/Sell sentiment in plain English",
  "sentiment": "Buy" | "Hold" | "Sell"
}

Rules:
- Everyday language. No ticker-dump. No fabricated precise earnings numbers that are not implied above.
- Educational briefing, not personalized financial advice. Do not tell the user to buy or sell.
- Keep each bullet to 1-2 sentences.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const parsed = parseStockAnalysisJson(text);
    if (!parsed) {
      console.error('Mater stock analysis JSON parse failed. Raw:', text.slice(0, 400));
      return null;
    }
    return { ...parsed, source: 'ai' };
  } catch (error) {
    console.error('Error generating Mater stock analysis:', error);
    return null;
  }
}

app.get('/api/stocks/metrics', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const fundamentals = await buildStockFundamentals(symbol);
    res.json(fundamentals);
  } catch (error) {
    console.error('Error fetching stock metrics:', error);
    res.status(500).json({ error: 'Failed to fetch stock metrics' });
  }
});

app.post('/api/stocks/analysis', async (req, res) => {
  try {
    const symbol = String(req.body?.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const name = String(req.body?.name || symbol).trim() || symbol;
    const price = asFiniteNumber(req.body?.price) ?? undefined;
    const changePct = asFiniteNumber(req.body?.changePct) ?? undefined;
    const positionNote =
      typeof req.body?.positionNote === 'string' ? req.body.positionNote.trim() : '';

    const [fundamentals, headlines] = await Promise.all([
      buildStockFundamentals(symbol),
      fetchCompanyHeadlines(symbol),
    ]);
    const ai = await generateStockAnalysis(symbol, name, {
      price,
      changePct,
      positionNote,
      fundamentals,
      headlines,
    });
    if (ai) {
      return res.json(ai);
    }
    return res.json({
      ...fallbackStockAnalysis(symbol, name, fundamentals),
      warning: 'Live Mater AI synthesis was unavailable. Showing a fundamentals-based briefing.',
    });
  } catch (error) {
    console.error('Error building stock analysis:', error);
    const symbol = String(req.body?.symbol || 'STOCK').trim().toUpperCase() || 'STOCK';
    const name = String(req.body?.name || symbol).trim() || symbol;
    return res.status(200).json({
      ...fallbackStockAnalysis(symbol, name, {
        symbol,
        revenueGrowthYoy: null,
        cash: null,
        debt: null,
        fcf: null,
        pe: null,
        peTag: 'N/A',
        recommendation: null,
      }),
      warning: 'Mater AI was unavailable. Showing a high-level fallback briefing.',
    });
  }
});

/**
 * Holistic US market AI daily report — macro only, no single-stock breakdowns.
 * GET /api/market/daily-report
 */
app.get('/api/market/daily-report', async (_req, res) => {
  try {
    const marketOpen = isUsMarketOpen();
    const headlines = await fetchMarketHeadlines();
    const aiReport = await generateAiReport(marketOpen, headlines);
    if (aiReport) {
      return res.json(aiReport);
    }
    return res.json({
      ...fallbackReport(marketOpen),
      warning: 'Live AI synthesis was unavailable. Showing a high-level macro fallback.',
    });
  } catch (error) {
    console.error('Error building daily market report:', error);
    const marketOpen = isUsMarketOpen();
    return res.status(200).json({
      ...fallbackReport(marketOpen),
      warning: 'AI and news services were unavailable. Showing a high-level macro fallback.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
