import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import authRoutes from './routes/auth';
import portfolioRoutes from './routes/portfolio';
import userRoutes from './routes/user';
import watchlistRoutes from './routes/watchlists';

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

// Stock Quote Endpoint
app.get('/api/stocks/quote', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const response = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching stock quote:', error);
    res.status(500).json({ error: 'Failed to fetch stock quote' });
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
