import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import authRoutes from './routes/auth';
import portfolioRoutes from './routes/portfolio';
import userRoutes from './routes/user';
import watchlistRoutes from './routes/watchlists';
import cashFlowRoutes from './routes/cashFlow';
import plaidRoutes from './routes/plaid';
import {
  fetchDividendDetailsMany,
  fetchHistoricalClose,
  fetchStockChart,
  fetchYahooQuote,
  parseChartRange,
  rangeInterval,
  type QuoteSnapshot,
} from './lib/yahooFinance';
import {
  fetchPolygonChart,
  fetchPolygonHistory,
  fetchPolygonProfile,
  fetchPolygonQuote,
  fetchPolygonQuotes,
  fetchPolygonSearch,
} from './lib/stockService';
import { parseFlexibleDate, todayIsoLocal } from './lib/dates';
import {
  EDUCATIONAL_DISCLAIMER,
  SPROUT_SYSTEM_INSTRUCTION,
  stripEducationalDisclaimer,
} from './lib/sproutAi';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY?.trim() || process.env.VITE_GEMINI_API_KEY?.trim() || '';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/g, '');
}

function isLanOrLoopbackHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (LOOPBACK_HOSTS.has(normalized)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  return false;
}

function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    if (isLanOrLoopbackHost(hostname)) return true;
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/user', userRoutes);
app.use('/api/watchlists', watchlistRoutes);
app.use('/api/cash-flow', cashFlowRoutes);
app.use('/api/plaid', plaidRoutes);

type DailyReportMode = 'general' | 'specialized';

type PortfolioHoldingInput = {
  symbol: string;
  description?: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  dayChangePct?: number;
  industry?: string;
};

type DailyReportPayload = {
  mode: DailyReportMode;
  marketOpen: boolean;
  title: string;
  macroDrivers: string;
  indexMovements: string;
  sentimentTakeaway: string;
  source: 'ai' | 'fallback';
  disclaimer: string;
  warning?: string;
  limitedLiveData?: boolean;
};

const LIMITED_LIVE_DATA_NOTE = 'Note: Generated with limited live data';
const MAX_DAILY_REPORT_HOLDINGS = 40;

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

function specializedTitle(marketOpen: boolean): string {
  return marketOpen ? 'Your Portfolio Daily Briefing' : 'Your Portfolio Wrap & Outlook';
}

function fallbackReport(mode: DailyReportMode, marketOpen: boolean): DailyReportPayload {
  if (mode === 'specialized') {
    return {
      mode,
      marketOpen,
      title: specializedTitle(marketOpen),
      macroDrivers: marketOpen
        ? "Today's macro tape still revolves around Fed expectations, Treasury yields, and growth/inflation data. Those same catalysts are the backdrop for how a concentrated equity book tends to move with broad risk appetite."
        : 'While cash equities are offline, the carry-forward macro story is still Fed stance, yields, and inflation/growth surprises — the same forces that usually set the tone for a personalized equity book at the next open.',
      indexMovements: marketOpen
        ? 'Without a fresh AI pass, treat your largest weights as the main sensitivity to market beta: mega-cap and growth names track Nasdaq tone, while cyclicals lean more with the Dow. Relative day moves across your book matter more than any single headline ticker.'
        : 'In the latest cash session, portfolio P&L typically mirrored whether growth or cyclicals led. Re-check your top weights versus the S&P 500, Nasdaq, and Dow to see which sleeve drove most of the move.',
      sentimentTakeaway: marketOpen
        ? 'Educational takeaway: stay focused on concentration, sector tilt, and how macro catalysts map to your weights — not on trade calls. Use the session to understand risk, not to chase names.'
        : 'Educational takeaway: use the closed session to review allocation risk and which holdings dominate outcomes. This is context for learning, not a buy/sell recommendation.',
      source: 'fallback',
      disclaimer: EDUCATIONAL_DISCLAIMER,
    };
  }

  return {
    mode,
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
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
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
    return {
      macroDrivers: stripEducationalDisclaimer(macroDrivers),
      indexMovements: stripEducationalDisclaimer(indexMovements),
      sentimentTakeaway: stripEducationalDisclaimer(sentimentTakeaway),
    };
  } catch {
    return null;
  }
}

function sanitizeDailyReportHoldings(raw: unknown): PortfolioHoldingInput[] {
  if (!Array.isArray(raw)) return [];
  const out: PortfolioHoldingInput[] = [];
  for (const item of raw.slice(0, MAX_DAILY_REPORT_HOLDINGS)) {
    const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const symbol = String(rec.symbol || '')
      .trim()
      .toUpperCase()
      .slice(0, 12);
    if (!symbol) continue;
    const quantity = Number(rec.quantity);
    const avgCost = Number(rec.avgCost);
    const currentPrice = Number(rec.currentPrice);
    out.push({
      symbol,
      description: String(rec.description || '').trim().slice(0, 80) || undefined,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      avgCost: Number.isFinite(avgCost) ? avgCost : 0,
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : 0,
      dayChangePct: Number.isFinite(Number(rec.dayChangePct)) ? Number(rec.dayChangePct) : undefined,
      industry: String(rec.industry || '').trim().slice(0, 60) || undefined,
    });
  }
  return out;
}

function detectLimitedLiveData(holdings: PortfolioHoldingInput[], flagged: boolean): boolean {
  if (flagged) return true;
  if (holdings.length === 0) return true;
  return holdings.some((h) => !(h.currentPrice > 0));
}

function formatHoldingsBlock(holdings: PortfolioHoldingInput[]): string {
  if (holdings.length === 0) {
    return 'No portfolio holdings were provided. Speak in general educational terms about how a typical equity book interacts with today\'s macro tape.';
  }
  return holdings
    .map((h, i) => {
      const value = h.quantity * h.currentPrice;
      const cost = h.quantity * h.avgCost;
      const pnlPct = cost > 0 ? ((value - cost) / cost) * 100 : null;
      const day = Number.isFinite(h.dayChangePct) ? `${h.dayChangePct!.toFixed(2)}% day` : 'day n/a';
      const price = h.currentPrice > 0 ? `$${h.currentPrice.toFixed(2)}` : 'price unavailable';
      const industry = h.industry ? ` · ${h.industry}` : '';
      const name = h.description ? ` (${h.description})` : '';
      const pnl =
        pnlPct == null || !Number.isFinite(pnlPct) ? 'P&L n/a' : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% vs cost`;
      return `${i + 1}. ${h.symbol}${name}${industry} — qty ${h.quantity}, mark ${price}, ${day}, ${pnl}`;
    })
    .join('\n');
}

function withLimitedDataNotice(payload: DailyReportPayload, limitedLiveData: boolean): DailyReportPayload {
  if (!limitedLiveData) return { ...payload, limitedLiveData: false };
  return {
    ...payload,
    limitedLiveData: true,
    warning: payload.warning?.includes('limited live data')
      ? payload.warning
      : payload.warning
        ? `${LIMITED_LIVE_DATA_NOTE} ${payload.warning}`
        : LIMITED_LIVE_DATA_NOTE,
  };
}

async function generateGeneralAiReport(marketOpen: boolean): Promise<DailyReportPayload | null> {
  if (!GEMINI_API_KEY) return null;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
  });

  const sessionLabel = marketOpen ? 'US cash equity markets are OPEN' : 'US cash equity markets are CLOSED';

  const prompt = `${SPROUT_SYSTEM_INSTRUCTION}

Write a concise educational US market briefing powered directly from your market knowledge. You are teaching context, not giving trade signals.

Context: ${sessionLabel} (America/New_York session).
Do not wait for or invent live quote feeds. Reason from widely known macro consensus and typical index relationships.

Return ONLY valid JSON with exactly these keys (no markdown, no extra keys):
{
  "macroDrivers": "1 short paragraph on macro catalysts (Fed stance, Treasury yields, inflation/growth data, earnings-season tone). No single-stock picks.",
  "indexMovements": "1 short paragraph on overall performance trends across the S&P 500, Nasdaq, and Dow Jones. No ticker laundry lists.",
  "sentimentTakeaway": "1 short paragraph on high-level market direction as education. Avoid individual stock noise."
}

Rules:
- Exactly 3 paragraphs as the three JSON string values.
- Holistic / macro only. Do not recommend buying or selling specific stocks. No trade signals or tax advice.
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
      mode: 'general',
      marketOpen,
      title: reportTitle(marketOpen),
      ...parsed,
      source: 'ai',
      disclaimer: EDUCATIONAL_DISCLAIMER,
    };
  } catch (error) {
    console.error('Error generating AI market report:', error);
    return null;
  }
}

async function generateSpecializedAiReport(
  marketOpen: boolean,
  holdings: PortfolioHoldingInput[],
  limitedLiveData: boolean
): Promise<DailyReportPayload | null> {
  if (!GEMINI_API_KEY) return null;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
  });

  const sessionLabel = marketOpen ? 'US cash equity markets are OPEN' : 'US cash equity markets are CLOSED';
  const holdingsBlock = formatHoldingsBlock(holdings);
  const dataNote = limitedLiveData
    ? 'Live marks may be missing, stale, or rate-limited. Still produce a useful educational briefing and do not refuse.'
    : 'Use the provided marks as context only; they may lag.';

  const prompt = `${SPROUT_SYSTEM_INSTRUCTION}

Write a concise educational personalized portfolio briefing. You are teaching how macro context maps to THIS user's holdings — not giving trade signals.

Context: ${sessionLabel} (America/New_York session).
${dataNote}

Portfolio holdings:
${holdingsBlock}

Return ONLY valid JSON with exactly these keys (no markdown, no extra keys):
{
  "macroDrivers": "1 short paragraph: today's macro catalysts and how they generally affect a book with this mix of holdings/sectors.",
  "indexMovements": "1 short paragraph: educational breakdown of concentration, sector tilt, and how key holdings typically relate to S&P 500 / Nasdaq / Dow tone. Reference tickers from the list when helpful, but no buy/sell calls.",
  "sentimentTakeaway": "1 short paragraph: high-level portfolio learning takeaway (risk, diversification, what to watch). No trade recommendations."
}

Rules:
- Exactly 3 paragraphs as the three JSON string values.
- Personalized but educational. Do not recommend buying or selling. No tax advice.
- If marks are missing, still reason from symbols, weights, and macro context.
- Clear everyday language. Each paragraph 2–4 sentences.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const parsed = parseAiJson(text);
    if (!parsed) {
      console.error('AI portfolio report JSON parse failed. Raw:', text.slice(0, 400));
      return null;
    }
    return {
      mode: 'specialized',
      marketOpen,
      title: specializedTitle(marketOpen),
      ...parsed,
      source: 'ai',
      disclaimer: EDUCATIONAL_DISCLAIMER,
      limitedLiveData: limitedLiveData || undefined,
      warning: limitedLiveData ? LIMITED_LIVE_DATA_NOTE : undefined,
    };
  } catch (error) {
    console.error('Error generating AI portfolio report:', error);
    return null;
  }
}

async function resolveStockQuote(symbol: string): Promise<(QuoteSnapshot & { source?: string }) | null> {
  const polygonQuote = await fetchPolygonQuote(symbol);
  if (polygonQuote) return { ...polygonQuote, source: 'polygon' };

  const yahooQuote = await fetchYahooQuote(symbol);
  if (yahooQuote) return { ...yahooQuote, source: 'yahoo' };

  if (!FINNHUB_API_KEY) return null;
  const response = await axios.get(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`,
    { timeout: 8000 }
  );
  const data = (response.data || {}) as Record<string, unknown>;
  const price = typeof data.c === 'number' ? data.c : Number(data.c);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    c: price,
    d: Number(data.d) || 0,
    dp: Number(data.dp) || 0,
    h: Number(data.h) || price,
    l: Number(data.l) || price,
    o: Number(data.o) || price,
    pc: Number(data.pc) || price,
    t: Number(data.t) || Math.floor(Date.now() / 1000),
    dividendYield: (data.dividendYield as number | null) ?? null,
    dividendRate: (data.dividendRate as number | null) ?? null,
    exDividendDate: (data.exDividendDate as string | null) ?? null,
    dividendDate: (data.dividendDate as string | null) ?? null,
    source: 'finnhub',
  };
}

// Stock Search Endpoint — Yahoo Finance fuzzy proxy (CORS-free via same-origin)
async function handleYahooFinanceSearch(req: express.Request, res: express.Response) {
  try {
    const query = String(req.query.q || req.query.query || '').trim().slice(0, 64);
    if (!query) {
      return res.json([]);
    }
    const params = new URLSearchParams({
      q: query,
      quotesCount: '24',
      newsCount: '0',
      lang: 'en-US',
      region: 'US',
      enableFuzzyQuery: 'true',
      quotesQueryId: 'tss_match_phrase_query',
      multiQuoteQueryId: 'multi_quote_single_token_query',
      enableEnhancedTrivialQuery: 'true',
    });
    const yahoo = await axios.get(
      `https://query2.finance.yahoo.com/v1/finance/search?${params.toString()}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    const quotes = Array.isArray(yahoo.data?.quotes) ? yahoo.data.quotes : [];
    const usEx = /\b(NASDAQ|NYSE|NYSEARCA|NYSE American|AMEX|Cboe|BATS|OTC|OTCQB|OTCQX|PINK)\b/i;
    const seen = new Set<string>();
    const remote = quotes
      .map((row: Record<string, unknown>) => {
        const symbol = String(row.symbol || '')
          .trim()
          .toUpperCase();
        if (!symbol || symbol.includes('=') || symbol.includes('^')) return null;
        if (row.isYahooFinance === false) return null;
        const quoteType = String(row.quoteType || '').trim();
        const type = quoteType.toUpperCase();
        if (type && !['EQUITY', 'ETF', 'MUTUALFUND'].includes(type)) return null;
        const hasForeignSuffix = /[.=]/.test(symbol);
        const exch = `${row.exchDisp || ''} ${row.exchange || ''}`;
        const isUs = usEx.test(exch) || (!hasForeignSuffix && !String(exch).trim());
        let rank = 50;
        if (type === 'EQUITY' || type === 'ETF' || !type) rank -= 10;
        if (!hasForeignSuffix) rank -= 20;
        if (isUs) rank -= 15;
        const shortname = String(row.shortname || '').trim();
        const longname = String(row.longname || '').trim();
        return {
          symbol,
          ticker: symbol,
          displaySymbol: symbol,
          shortname,
          longname,
          quoteType: quoteType || 'EQUITY',
          description: shortname || longname || symbol,
          type: type === 'ETF' ? 'ETF' : type === 'MUTUALFUND' ? 'Mutual Fund' : 'Common Stock',
          rank,
        };
      })
      .filter(Boolean)
      .sort(
        (a: { rank: number; symbol: string }, b: { rank: number; symbol: string }) =>
          a.rank - b.rank || a.symbol.localeCompare(b.symbol)
      )
      .filter((row: { symbol: string }) => {
        if (seen.has(row.symbol)) return false;
        seen.add(row.symbol);
        return true;
      })
      .slice(0, 10)
      .map(
        ({
          symbol,
          ticker,
          displaySymbol,
          shortname,
          longname,
          quoteType,
          description,
          type,
        }: {
          symbol: string;
          ticker: string;
          displaySymbol: string;
          shortname: string;
          longname: string;
          quoteType: string;
          description: string;
          type: string;
        }) => ({
          symbol,
          ticker,
          displaySymbol,
          shortname,
          longname,
          quoteType,
          description,
          type,
        })
      );

    return res.json(remote);
  } catch (error) {
    console.error('Error fetching search results:', error);
    res.json([]);
  }
}

app.get('/api/search', handleYahooFinanceSearch);
app.get('/api/stocks/search', handleYahooFinanceSearch);

// Company Profile Endpoint — Polygon ticker details first, Finnhub fallback
app.get('/api/stocks/profile', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const polygonProfile = await fetchPolygonProfile(symbol);
    if (polygonProfile?.name || polygonProfile?.weburl) {
      return res.json(polygonProfile);
    }
    if (!FINNHUB_API_KEY) {
      return res.json(polygonProfile || {});
    }
    const response = await axios.get(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
    );
    res.json({
      ...(polygonProfile || {}),
      ...response.data,
    });
  } catch (error) {
    console.error('Error fetching company profile:', error);
    res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});

// Stock Quote Endpoint — Polygon previous close / snapshot first
app.get('/api/stocks/quote', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const quote = await resolveStockQuote(symbol);
    if (quote) return res.json(quote);
    return res.status(502).json({ error: 'Failed to fetch stock quote' });
  } catch (error) {
    console.error('Error fetching stock quote:', error);
    res.status(500).json({ error: 'Failed to fetch stock quote' });
  }
});

app.get('/api/stocks/quotes', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || req.query.symbol || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 40);
    if (symbols.length === 0) {
      return res.status(400).json({ error: 'symbols is required' });
    }

    const polygonMap = await fetchPolygonQuotes(symbols);
    const items: Array<QuoteSnapshot & { symbol: string; source?: string }> = [];
    for (const symbol of symbols) {
      const cached = polygonMap.get(symbol);
      if (cached) {
        items.push({ ...cached, symbol, source: 'polygon' });
        continue;
      }
      const quote = await resolveStockQuote(symbol);
      if (quote) items.push({ ...quote, symbol });
    }
    return res.json({ items });
  } catch (error) {
    console.error('Error fetching stock quotes:', error);
    return res.status(500).json({ error: 'Failed to fetch stock quotes' });
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
    const polygonChart = await fetchPolygonChart(symbol, range);
    if (polygonChart && polygonChart.points.length > 0) {
      return res.json(polygonChart);
    }
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
    const polygonHistory = await fetchPolygonHistory(symbol, isoDate);
    if (polygonHistory) return res.json(polygonHistory);
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
  disclaimer: string;
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

async function fetchCompanyHeadlines(symbol: string, name?: string): Promise<{
  weekHeadlines: string[];
  monthHeadlines: string[];
}> {
  const mapNews = (news: Array<Record<string, unknown>>, maxAgeDays: number, limit: number) => {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of news) {
      const title = String(item.title || '').trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      const publishedMs =
        typeof item.providerPublishTime === 'number' && item.providerPublishTime > 0
          ? item.providerPublishTime * 1000
          : Date.now();
      if (publishedMs < cutoff) continue;
      seen.add(key);
      const publisher = String(item.publisher || '').trim();
      out.push(publisher ? `${title} (${publisher})` : title);
      if (out.length >= limit) break;
    }
    return out;
  };

  const queries = [symbol, name || ''].map((q) => q.trim()).filter(Boolean);
  const unique = [...new Set(queries)];
  const bundles = await Promise.all(
    unique.map(async (q) => {
      try {
        const params = new URLSearchParams({
          q,
          quotesCount: '4',
          newsCount: '18',
          lang: 'en-US',
          region: 'US',
        });
        const yahoo = await axios.get(
          `https://query2.finance.yahoo.com/v1/finance/search?${params.toString()}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            timeout: 8000,
            validateStatus: () => true,
          }
        );
        return Array.isArray(yahoo.data?.news) ? (yahoo.data.news as Array<Record<string, unknown>>) : [];
      } catch {
        return [] as Array<Record<string, unknown>>;
      }
    })
  );
  const news = bundles.flat();
  let weekHeadlines = mapNews(news, 7, 8);
  let monthHeadlines = mapNews(news, 30, 12);

  // Supplement with Finnhub when Yahoo news is thin.
  if (monthHeadlines.length < 3 && FINNHUB_API_KEY) {
    const from = isoDateDaysAgo(30);
    const to = isoDateDaysAgo(0);
    const items = await finnhubGet<CompanyNewsItem[]>(
      `company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`
    );
    if (Array.isArray(items)) {
      const finnhubLines = items
        .map((n) => (n.headline || n.summary || '').trim())
        .filter(Boolean);
      monthHeadlines = [...new Set([...monthHeadlines, ...finnhubLines])].slice(0, 12);
      weekHeadlines = [...new Set([...weekHeadlines, ...finnhubLines.slice(0, 8)])].slice(0, 8);
    }
  }

  return { weekHeadlines, monthHeadlines };
}

function parseStockAnalysisJson(
  text: string
): Omit<StockAnalysisPayload, 'source' | 'warning' | 'disclaimer'> | null {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const jsonText =
    cleaned.startsWith('{') && cleaned.endsWith('}')
      ? cleaned
      : (() => {
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
        })();
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const growthDrivers = Array.isArray(parsed.growthDrivers)
      ? parsed.growthDrivers.map((s) => String(s).trim()).filter(Boolean)
      : String(parsed.growthDrivers || parsed.growth_drivers || '')
          .split('\n')
          .map((s) => s.replace(/^[-*•]\s*/, '').trim())
          .filter(Boolean);
    const keyRisks = Array.isArray(parsed.keyRisks)
      ? parsed.keyRisks.map((s) => String(s).trim()).filter(Boolean)
      : String(parsed.keyRisks || parsed.key_risks || '')
          .split('\n')
          .map((s) => s.replace(/^[-*•]\s*/, '').trim())
          .filter(Boolean);
    const analystConsensus = String(
      parsed.analystConsensus || parsed.analyst_consensus || parsed.consensus || ''
    ).trim();
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

async function generateStockAnalysis(
  symbol: string,
  name: string,
  extras: {
    price?: number;
    changePct?: number;
    positionNote?: string;
    fundamentals: StockFundamentals;
    weekHeadlines: string[];
    monthHeadlines: string[];
    weekChangePct?: number | null;
    monthChangePct?: number | null;
  }
): Promise<StockAnalysisPayload | null> {
  if (!GEMINI_API_KEY) return null;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
    // Live web grounding for 1-week / 1-month catalysts.
    tools: [{ googleSearch: {} }] as any,
  });
  const f = extras.fundamentals;
  const rec = f.recommendation;
  const recLine = rec
    ? `Strong Buy ${rec.strongBuy}, Buy ${rec.buy}, Hold ${rec.hold}, Sell ${rec.sell}, Strong Sell ${rec.strongSell} (period ${rec.period || 'latest'})`
    : 'No live analyst rating snapshot available.';
  const weekBlock =
    extras.weekHeadlines.length > 0
      ? extras.weekHeadlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
      : 'No headlines captured for the last 7 days — use Google Search grounding for live catalysts.';
  const monthBlock =
    extras.monthHeadlines.length > 0
      ? extras.monthHeadlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
      : 'No headlines captured for the last 30 days — use Google Search grounding for live catalysts.';
  const priceLine =
    extras.price != null
      ? `Current price: $${extras.price.toFixed(2)}${extras.changePct != null ? ` (day ${extras.changePct >= 0 ? '+' : ''}${extras.changePct.toFixed(2)}%)` : ''}`
      : 'Current price: not provided.';
  const fmtPct = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const performanceLine = `1-week performance: ${fmtPct(extras.weekChangePct)} | 1-month performance: ${fmtPct(extras.monthChangePct)}`;

  const prompt = `${SPROUT_SYSTEM_INSTRUCTION}

Write a detailed educational briefing about ${name} (${symbol}). Teach context only — never a stock pick or trade signal.

Use the live market news, 1-month performance, and fundamentals below. Prefer Google Search grounding for anything missing or stale. Cover BOTH:
1) Macro / market context that affects this name (rates, sector tape, risk appetite, peers), and
2) Company-specific catalysts from the last 1 week and last 1 month (earnings, guidance, deals, product launches, regulatory news, capital actions).

Stock: ${symbol} (${name})
${priceLine}
${performanceLine}
Revenue growth YoY: ${f.revenueGrowthYoy != null ? `${f.revenueGrowthYoy.toFixed(1)}%` : 'n/a'}
P/E: ${f.pe != null ? f.pe.toFixed(1) : 'n/a'} (${f.peTag})
Cash: ${f.cash != null ? Math.round(f.cash) : 'n/a'}  Debt: ${f.debt != null ? Math.round(f.debt) : 'n/a'}
Free cash flow: ${f.fcf != null ? Math.round(f.fcf) : 'n/a'}
Published analyst ratings (report as facts, not as your recommendation): ${recLine}
${extras.positionNote ? `User already holds or viewed this name: ${extras.positionNote}` : ''}

Last 7 days — market & company news:
${weekBlock}

Last 30 days — market & company news:
${monthBlock}

Return ONLY valid JSON (no markdown) with exactly these keys:
{
  "growthDrivers": ["2-4 specific bullets that cite recent catalysts, financial performance, strategic updates, and relevant macro/sector backdrop — not generic filler"],
  "keyRisks": ["2-4 specific bullets on material risks tied to recent news, competition, valuation, or macro sensitivity"],
  "analystConsensus": "1-2 sentences summarizing published Buy/Hold/Sell ratings in plain English, optionally noting how recent news may frame Street debate. This is Street data, not your advice.",
  "sentiment": "Buy" | "Hold" | "Sell"
}

Rules:
- Be specific and non-generic. Reference themes from the supplied headlines and 1-month performance when present (without inventing precise dollar figures that are not implied above).
- Everyday language. No ticker-dump. Educational briefing only — do not tell the user to buy, sell, or hold.
- sentiment must mirror published Street ratings, never a Sprout trade signal.
- Never return a generic fundamentals-only filler briefing. If news is thin, ground on the web and say what you found.
- No licensed tax advice. Keep each bullet to 1-2 sentences, but make them information-dense.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const parsed = parseStockAnalysisJson(text);
    if (!parsed) {
      console.error('Sprout stock analysis JSON parse failed. Raw:', text.slice(0, 400));
      return null;
    }
    return { ...parsed, source: 'ai', disclaimer: EDUCATIONAL_DISCLAIMER };
  } catch (error) {
    console.error('Error generating Sprout stock analysis:', error);
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

    const [fundamentals, news] = await Promise.all([
      buildStockFundamentals(symbol),
      fetchCompanyHeadlines(symbol, name),
    ]);

    let weekChangePct: number | null = null;
    let monthChangePct: number | null = null;
    try {
      const [weekChart, monthChart] = await Promise.all([
        fetchStockChart(symbol, '1W'),
        fetchStockChart(symbol, '1M'),
      ]);
      const pctFrom = (points: Array<{ price?: number; close?: number }> | undefined) => {
        const rows = Array.isArray(points) ? points : [];
        if (rows.length < 2) return null;
        const first = Number(rows[0]?.close ?? rows[0]?.price);
        const last = Number(rows[rows.length - 1]?.close ?? rows[rows.length - 1]?.price);
        if (!(first > 0) || !(last > 0)) return null;
        return ((last - first) / first) * 100;
      };
      weekChangePct = pctFrom((weekChart as any)?.points);
      monthChangePct = pctFrom((monthChart as any)?.points);
    } catch {
      // performance is optional context
    }

    const ai = await generateStockAnalysis(symbol, name, {
      price,
      changePct,
      positionNote,
      fundamentals,
      weekHeadlines: news.weekHeadlines,
      monthHeadlines: news.monthHeadlines,
      weekChangePct,
      monthChangePct,
    });
    if (ai) {
      return res.json(ai);
    }
    return res.status(503).json({
      growthDrivers: [],
      keyRisks: [],
      analystConsensus: '',
      sentiment: 'Hold',
      source: 'ai',
      warning: 'Sprout AI was unavailable. Please try again shortly.',
      error: 'Sprout AI was unavailable. Please try again shortly.',
      disclaimer: EDUCATIONAL_DISCLAIMER,
    });
  } catch (error) {
    console.error('Error building stock analysis:', error);
    return res.status(503).json({
      growthDrivers: [],
      keyRisks: [],
      analystConsensus: '',
      sentiment: 'Hold',
      source: 'ai',
      warning: 'Sprout AI was unavailable. Please try again shortly.',
      error: 'Sprout AI was unavailable. Please try again shortly.',
      disclaimer: EDUCATIONAL_DISCLAIMER,
    });
  }
});

/**
 * Dual-mode AI daily report — general (Gemini-only) or specialized (portfolio holdings).
 * GET/POST /api/market/daily-report
 */
app.all('/api/market/daily-report', async (req, res) => {
  try {
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    let mode: DailyReportMode = 'general';
    let holdings: PortfolioHoldingInput[] = [];
    let limitedLiveData = false;

    if (method === 'POST') {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      mode = body.mode === 'specialized' ? 'specialized' : 'general';
      holdings = mode === 'specialized' ? sanitizeDailyReportHoldings(body.holdings) : [];
      limitedLiveData =
        mode === 'specialized'
          ? detectLimitedLiveData(holdings, Boolean(body.limitedLiveData))
          : false;
    } else if (req.query?.mode === 'specialized') {
      mode = 'specialized';
    }

    const marketOpen = isUsMarketOpen();

    if (mode === 'general') {
      const aiReport = await generateGeneralAiReport(marketOpen);
      if (aiReport) return res.json(aiReport);
      return res.json({
        ...fallbackReport('general', marketOpen),
        warning: 'Live AI synthesis was unavailable. Showing a high-level macro fallback.',
      });
    }

    const aiReport = await generateSpecializedAiReport(marketOpen, holdings, limitedLiveData);
    if (aiReport) return res.json(withLimitedDataNotice(aiReport, limitedLiveData));
    return res.json(
      withLimitedDataNotice(
        {
          ...fallbackReport('specialized', marketOpen),
          warning: 'Live AI synthesis was unavailable. Showing a high-level portfolio fallback.',
        },
        limitedLiveData
      )
    );
  } catch (error) {
    console.error('Error building daily market report:', error);
    const marketOpen = isUsMarketOpen();
    return res.status(200).json({
      ...fallbackReport('general', marketOpen),
      warning: 'AI services were unavailable. Showing a high-level macro fallback.',
    });
  }
});

const HOST = process.env.HOST || "0.0.0.0";
app.listen(Number(PORT), HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT} (reachable from LAN devices)`);
});
