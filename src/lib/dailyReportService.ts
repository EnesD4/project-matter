import { GoogleGenAI } from "@google/genai";
import {
  EDUCATIONAL_DISCLAIMER,
  SPROUT_SYSTEM_INSTRUCTION,
  stripEducationalDisclaimer,
} from "./sproutAi";
import { getMarketStatusHeader, isUsMarketOpen } from "./marketInsights";
export type DailyReportMode = "general" | "specialized";

export type DailyReportHoldingInput = {
  symbol: string;
  description?: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  dayChangePct?: number;
  industry?: string;
};

export type DailyReportPayload = {
  mode: DailyReportMode;
  marketOpen: boolean;
  title: string;
  macroDrivers: string;
  indexMovements: string;
  sentimentTakeaway: string;
  source: "ai" | "fallback";
  disclaimer: string;
  warning?: string;
  limitedLiveData?: boolean;
};

type CachedReportEntry = {
  generatedAt: number;
  holdingsKey?: string;
  report: DailyReportPayload;
};

const GEMINI_FLASH_MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_KEY_PREFIX = "sprout_daily_report_v1";
const LIMITED_LIVE_DATA_NOTE = "Note: Generated with limited live data";
const MAX_HOLDINGS = 40;

/** Same client-side key pattern as Sprout AI Chat / Vite public env. */
function getClientGeminiApiKey(): string {
  return String(import.meta.env.VITE_GEMINI_API_KEY || "").trim();
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = getClientGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

function cacheKey(mode: DailyReportMode): string {
  return `${CACHE_KEY_PREFIX}:${mode}`;
}

function holdingsFingerprint(holdings: DailyReportHoldingInput[]): string {
  return JSON.stringify(
    holdings.map((h) => [
      h.symbol,
      h.quantity,
      h.avgCost,
      h.currentPrice,
      h.dayChangePct ?? null,
      h.industry ?? null,
    ])
  );
}

function readCache(mode: DailyReportMode): CachedReportEntry | null {
  try {
    const raw = localStorage.getItem(cacheKey(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedReportEntry;
    if (!parsed?.report || !Number.isFinite(parsed.generatedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(mode: DailyReportMode, entry: CachedReportEntry): void {
  try {
    localStorage.setItem(cacheKey(mode), JSON.stringify(entry));
  } catch {
    // quota / private mode
  }
}

/** Returns a cached report if it is still within the 1-hour reuse window. */
export function getCachedDailyReport(
  mode: DailyReportMode,
  holdings: DailyReportHoldingInput[] = []
): DailyReportPayload | null {
  const entry = readCache(mode);
  if (!entry) return null;
  if (Date.now() - entry.generatedAt >= CACHE_TTL_MS) return null;
  if (mode === "specialized") {
    const key = holdingsFingerprint(holdings);
    if (entry.holdingsKey !== key) return null;
  }
  return entry.report;
}

export function getDailyReportCacheAgeMs(mode: DailyReportMode): number | null {
  const entry = readCache(mode);
  if (!entry) return null;
  const age = Date.now() - entry.generatedAt;
  if (age < 0 || age >= CACHE_TTL_MS) return null;
  return age;
}

function specializedTitle(marketOpen: boolean): string {
  return marketOpen ? "Your Portfolio Daily Briefing" : "Your Portfolio Wrap & Outlook";
}

function fallbackReport(mode: DailyReportMode, marketOpen: boolean): DailyReportPayload {
  if (mode === "specialized") {
    return {
      mode,
      marketOpen,
      title: specializedTitle(marketOpen),
      macroDrivers: marketOpen
        ? "Today's macro tape still revolves around Fed expectations, Treasury yields, and growth/inflation data. Those same catalysts are the backdrop for how a concentrated equity book tends to move with broad risk appetite."
        : "While cash equities are offline, the carry-forward macro story is still Fed stance, yields, and inflation/growth surprises — the same forces that usually set the tone for a personalized equity book at the next open.",
      indexMovements: marketOpen
        ? "Without a fresh AI pass, treat your largest weights as the main sensitivity to market beta: mega-cap and growth names track Nasdaq tone, while cyclicals lean more with the Dow. Relative day moves across your book matter more than any single headline ticker."
        : "In the latest cash session, portfolio P&L typically mirrored whether growth or cyclicals led. Re-check your top weights versus the S&P 500, Nasdaq, and Dow to see which sleeve drove most of the move.",
      sentimentTakeaway: marketOpen
        ? "Educational takeaway: stay focused on concentration, sector tilt, and how macro catalysts map to your weights — not on trade calls. Use the session to understand risk, not to chase names."
        : "Educational takeaway: use the closed session to review allocation risk and which holdings dominate outcomes. This is context for learning, not a buy/sell recommendation.",
      source: "fallback",
      disclaimer: EDUCATIONAL_DISCLAIMER,
    };
  }

  const { title } = getMarketStatusHeader();
  return {
    mode,
    marketOpen,
    title,
    macroDrivers: marketOpen
      ? "Macro drivers today center on Fed policy expectations, Treasury yield moves, inflation and growth data, and the broader earnings-season tone. Rate-path pricing and soft-landing odds remain the primary catalysts steering risk appetite across US equities."
      : "With cash equities offline, the latest macro backdrop still hinges on Fed stance, Treasury yields, and inflation/growth surprises. Carry-forward catalysts continue to frame overnight futures and set up the next cash open.",
    indexMovements: marketOpen
      ? "The S&P 500 is trading as the broad beta barometer for large-cap US risk, while the Nasdaq reflects growth and duration sensitivity in mega-cap tech. The Dow Jones is tracking more cyclically tilted blue chips, so relative leadership among the three indexes signals whether the session is risk-on, defensive, or mixed."
      : "In the most recent cash session, the S&P 500 captured broad large-cap tone, the Nasdaq mirrored growth/tech leadership (or lack of it), and the Dow Jones reflected cyclical blue-chip breadth. Futures now extend that relative performance into the next open.",
    sentimentTakeaway: marketOpen
      ? "Overall sentiment remains macro-driven rather than single-stock driven: watch yields, Fed speak, and major data releases for directional cues. Stay focused on index-level risk appetite and sector rotation instead of name-specific noise."
      : "The wrap takeaway is portfolio-level: US equity direction still tracks policy odds and growth/inflation balance more than idiosyncratic headlines. Use the closed-session window to reassess allocation risk rather than chase individual names.",
    source: "fallback",
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}

function parseAiJson(text: string): {
  macroDrivers: string;
  indexMovements: string;
  sentimentTakeaway: string;
} | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const macroDrivers = String(parsed.macroDrivers || "").trim();
    const indexMovements = String(parsed.indexMovements || "").trim();
    const sentimentTakeaway = String(parsed.sentimentTakeaway || "").trim();
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

function sanitizeHoldings(raw: DailyReportHoldingInput[]): DailyReportHoldingInput[] {
  const out: DailyReportHoldingInput[] = [];
  for (const item of raw.slice(0, MAX_HOLDINGS)) {
    const symbol = String(item.symbol || "")
      .trim()
      .toUpperCase()
      .slice(0, 12);
    if (!symbol) continue;
    const quantity = Number(item.quantity);
    const avgCost = Number(item.avgCost);
    const currentPrice = Number(item.currentPrice);
    out.push({
      symbol,
      description: String(item.description || "").trim().slice(0, 80) || undefined,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      avgCost: Number.isFinite(avgCost) ? avgCost : 0,
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : 0,
      dayChangePct: Number.isFinite(Number(item.dayChangePct)) ? Number(item.dayChangePct) : undefined,
      industry: String(item.industry || "").trim().slice(0, 60) || undefined,
    });
  }
  return out;
}

function formatHoldingsBlock(holdings: DailyReportHoldingInput[]): string {
  if (holdings.length === 0) {
    return "No portfolio holdings were provided. Speak in general educational terms about how a typical equity book interacts with today's macro tape.";
  }
  return holdings
    .map((h, i) => {
      const value = h.quantity * h.currentPrice;
      const cost = h.quantity * h.avgCost;
      const pnlPct = cost > 0 ? ((value - cost) / cost) * 100 : null;
      const day = Number.isFinite(h.dayChangePct) ? `${h.dayChangePct!.toFixed(2)}% day` : "day n/a";
      const price = h.currentPrice > 0 ? `$${h.currentPrice.toFixed(2)}` : "price unavailable";
      const industry = h.industry ? ` · ${h.industry}` : "";
      const name = h.description ? ` (${h.description})` : "";
      const pnl =
        pnlPct == null || !Number.isFinite(pnlPct) ? "P&L n/a" : `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% vs cost`;
      return `${i + 1}. ${h.symbol}${name}${industry} — qty ${h.quantity}, mark ${price}, ${day}, ${pnl}`;
    })
    .join("\n");
}

async function generateWithGemini(prompt: string, signal?: AbortSignal): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) throw new Error("missing_api_key");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: prompt,
      config: {
        systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
        abortSignal: controller.signal,
        httpOptions: { timeout: GEMINI_TIMEOUT_MS },
      },
    });
    return String(response.text || "").trim();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function generateGeneralAiReport(
  marketOpen: boolean,
  signal?: AbortSignal
): Promise<DailyReportPayload | null> {
  if (!getClientGeminiApiKey()) return null;

  const { title } = getMarketStatusHeader();
  const sessionLabel = marketOpen
    ? "US cash equity markets are OPEN"
    : "US cash equity markets are CLOSED";

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
    const text = await generateWithGemini(prompt, signal);
    const parsed = parseAiJson(text);
    if (!parsed) return null;
    return {
      mode: "general",
      marketOpen,
      title,
      ...parsed,
      source: "ai",
      disclaimer: EDUCATIONAL_DISCLAIMER,
    };
  } catch {
    return null;
  }
}

async function generateSpecializedAiReport(
  marketOpen: boolean,
  holdings: DailyReportHoldingInput[],
  limitedLiveData: boolean,
  signal?: AbortSignal
): Promise<DailyReportPayload | null> {
  if (!getClientGeminiApiKey()) return null;

  const sessionLabel = marketOpen
    ? "US cash equity markets are OPEN"
    : "US cash equity markets are CLOSED";
  const holdingsBlock = formatHoldingsBlock(holdings);
  const dataNote = limitedLiveData
    ? "Live marks may be missing, stale, or rate-limited. Still produce a useful educational briefing and do not refuse."
    : "Use the provided marks as context only; they may lag.";

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
    const text = await generateWithGemini(prompt, signal);
    const parsed = parseAiJson(text);
    if (!parsed) return null;
    return {
      mode: "specialized",
      marketOpen,
      title: specializedTitle(marketOpen),
      ...parsed,
      source: "ai",
      disclaimer: EDUCATIONAL_DISCLAIMER,
      limitedLiveData: limitedLiveData || undefined,
      warning: limitedLiveData ? LIMITED_LIVE_DATA_NOTE : undefined,
    };
  } catch {
    return null;
  }
}

function withLimitedDataNotice(payload: DailyReportPayload, limitedLiveData: boolean): DailyReportPayload {
  if (!limitedLiveData) return { ...payload, limitedLiveData: false };
  return {
    ...payload,
    limitedLiveData: true,
    warning: payload.warning?.includes("limited live data")
      ? payload.warning
      : payload.warning
        ? `${LIMITED_LIVE_DATA_NOTE} ${payload.warning}`
        : LIMITED_LIVE_DATA_NOTE,
  };
}

export type FetchDailyReportArgs = {
  mode: DailyReportMode;
  holdings?: DailyReportHoldingInput[];
  limitedLiveData?: boolean;
  /** When true, skip cache and force a fresh Gemini call (still writes cache). */
  forceRefresh?: boolean;
  signal?: AbortSignal;
};

export type FetchDailyReportResult = {
  report: DailyReportPayload;
  fromCache: boolean;
};

/**
 * Client-side Daily Report — General Market uses Gemini directly (no serverless / stock APIs).
 * Reuses a localStorage cache for 1 hour after generation.
 */
export async function fetchDailyReport({
  mode,
  holdings = [],
  limitedLiveData = false,
  forceRefresh = false,
  signal,
}: FetchDailyReportArgs): Promise<FetchDailyReportResult> {
  const marketOpen = isUsMarketOpen();
  const cleanHoldings = mode === "specialized" ? sanitizeHoldings(holdings) : [];
  const limited =
    mode === "specialized"
      ? Boolean(limitedLiveData) || cleanHoldings.length === 0 || cleanHoldings.some((h) => !(h.currentPrice > 0))
      : false;

  if (!forceRefresh) {
    const cached = getCachedDailyReport(mode, cleanHoldings);
    if (cached) return { report: cached, fromCache: true };
  }

  let report: DailyReportPayload;
  if (mode === "general") {
    const ai = await generateGeneralAiReport(marketOpen, signal);
    report = ai
      ? ai
      : {
          ...fallbackReport("general", marketOpen),
          warning: getClientGeminiApiKey()
            ? "Live AI synthesis was unavailable. Showing a high-level macro fallback."
            : "Add VITE_GEMINI_API_KEY to unlock live Gemini market briefs. Showing a high-level macro fallback.",
        };
  } else {
    const ai = await generateSpecializedAiReport(marketOpen, cleanHoldings, limited, signal);
    report = withLimitedDataNotice(
      ai
        ? ai
        : {
            ...fallbackReport("specialized", marketOpen),
            warning: getClientGeminiApiKey()
              ? "Live AI synthesis was unavailable. Showing a high-level portfolio fallback."
              : "Add VITE_GEMINI_API_KEY to unlock live Gemini portfolio briefs. Showing a high-level portfolio fallback.",
          },
      limited
    );
  }

  writeCache(mode, {
    generatedAt: Date.now(),
    holdingsKey: mode === "specialized" ? holdingsFingerprint(cleanHoldings) : undefined,
    report,
  });

  return { report, fromCache: false };
}
