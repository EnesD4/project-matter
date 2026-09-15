import { GoogleGenAI } from "@google/genai";
import type { IncomingMessage, ServerResponse } from "http";
import {
  EDUCATIONAL_DISCLAIMER,
  SPROUT_SYSTEM_INSTRUCTION,
  stripEducationalDisclaimer,
} from "../../src/lib/sproutAi.js";
import { isUsMarketOpen, getMarketStatusHeader } from "../../src/lib/marketInsights.js";
import { GEMINI_FLASH_MODEL, getGeminiApiKey, getGeminiModel } from "./env.js";
import { guardApiRequestMethods, readJsonBody, sendJson } from "./security.js";

type DailyReportMode = "general" | "specialized";

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
  source: "ai" | "fallback";
  disclaimer: string;
  warning?: string;
  limitedLiveData?: boolean;
};

const GEMINI_TIMEOUT_MS = 20_000;
const LIMITED_LIVE_DATA_NOTE = "Note: Generated with limited live data";
const MAX_HOLDINGS = 40;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseMode(value: unknown): DailyReportMode {
  return value === "specialized" ? "specialized" : "general";
}

function sanitizeHoldings(raw: unknown): PortfolioHoldingInput[] {
  if (!Array.isArray(raw)) return [];
  const out: PortfolioHoldingInput[] = [];
  for (const item of raw.slice(0, MAX_HOLDINGS)) {
    const rec = asRecord(item);
    const symbol = String(rec.symbol || "")
      .trim()
      .toUpperCase()
      .slice(0, 12);
    if (!symbol) continue;
    const quantity = Number(rec.quantity);
    const avgCost = Number(rec.avgCost);
    const currentPrice = Number(rec.currentPrice);
    out.push({
      symbol,
      description: String(rec.description || "").trim().slice(0, 80) || undefined,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      avgCost: Number.isFinite(avgCost) ? avgCost : 0,
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : 0,
      dayChangePct: Number.isFinite(Number(rec.dayChangePct)) ? Number(rec.dayChangePct) : undefined,
      industry: String(rec.industry || "").trim().slice(0, 60) || undefined,
    });
  }
  return out;
}

function detectLimitedLiveData(holdings: PortfolioHoldingInput[], flagged: boolean): boolean {
  if (flagged) return true;
  if (holdings.length === 0) return true;
  return holdings.some((h) => !(h.currentPrice > 0));
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

function formatHoldingsBlock(holdings: PortfolioHoldingInput[]): string {
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

async function generateGeneralAiReport(marketOpen: boolean): Promise<DailyReportPayload | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const model = getGeminiModel() || GEMINI_FLASH_MODEL;
  const ai = new GoogleGenAI({ apiKey });
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    let text = "";
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
          abortSignal: controller.signal,
          httpOptions: { timeout: GEMINI_TIMEOUT_MS },
        },
      });
      text = String(response.text || "").trim();
    } finally {
      clearTimeout(timer);
    }

    const parsed = parseAiJson(text);
    if (!parsed) {
      console.error("AI market report JSON parse failed. Raw:", text.slice(0, 400));
      return null;
    }
    return {
      mode: "general",
      marketOpen,
      title,
      ...parsed,
      source: "ai",
      disclaimer: EDUCATIONAL_DISCLAIMER,
    };
  } catch (error) {
    console.error("Error generating AI market report:", error);
    return null;
  }
}

async function generateSpecializedAiReport(
  marketOpen: boolean,
  holdings: PortfolioHoldingInput[],
  limitedLiveData: boolean
): Promise<DailyReportPayload | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const model = getGeminiModel() || GEMINI_FLASH_MODEL;
  const ai = new GoogleGenAI({ apiKey });
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    let text = "";
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
          abortSignal: controller.signal,
          httpOptions: { timeout: GEMINI_TIMEOUT_MS },
        },
      });
      text = String(response.text || "").trim();
    } finally {
      clearTimeout(timer);
    }

    const parsed = parseAiJson(text);
    if (!parsed) {
      console.error("AI portfolio report JSON parse failed. Raw:", text.slice(0, 400));
      return null;
    }
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
  } catch (error) {
    console.error("Error generating AI portfolio report:", error);
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

/**
 * Dual-mode AI daily report.
 * POST /api/market/daily-report  { mode: "general" | "specialized", holdings?, limitedLiveData? }
 * GET  /api/market/daily-report  (general mode, Gemini-only — no stock APIs)
 */
export async function handleDailyReport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequestMethods(req, res, ["GET", "POST"])) return;

  try {
    const method = (req.method || "GET").toUpperCase();
    let mode: DailyReportMode = "general";
    let holdings: PortfolioHoldingInput[] = [];
    let limitedLiveData = false;

    if (method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = asRecord(await readJsonBody(req));
      } catch {
        body = {};
      }
      mode = parseMode(body.mode);
      holdings = mode === "specialized" ? sanitizeHoldings(body.holdings) : [];
      limitedLiveData =
        mode === "specialized"
          ? detectLimitedLiveData(holdings, Boolean(body.limitedLiveData))
          : false;
    } else {
      try {
        const url = new URL(req.url || "", "http://localhost");
        mode = parseMode(url.searchParams.get("mode"));
      } catch {
        mode = "general";
      }
    }

    const marketOpen = isUsMarketOpen();

    // General: Gemini immediately — no Polygon/stock quote waits.
    if (mode === "general") {
      const aiReport = await generateGeneralAiReport(marketOpen);
      if (aiReport) {
        sendJson(res, 200, aiReport);
        return;
      }
      sendJson(res, 200, {
        ...fallbackReport("general", marketOpen),
        warning: "Live AI synthesis was unavailable. Showing a high-level macro fallback.",
      });
      return;
    }

    // Specialized: use client holdings; never fail solely because live marks are thin.
    const aiReport = await generateSpecializedAiReport(marketOpen, holdings, limitedLiveData);
    if (aiReport) {
      sendJson(res, 200, withLimitedDataNotice(aiReport, limitedLiveData));
      return;
    }
    sendJson(
      res,
      200,
      withLimitedDataNotice(
        {
          ...fallbackReport("specialized", marketOpen),
          warning: "Live AI synthesis was unavailable. Showing a high-level portfolio fallback.",
        },
        limitedLiveData
      )
    );
  } catch (error) {
    console.error("Error building daily market report:", error);
    const marketOpen = isUsMarketOpen();
    sendJson(res, 200, {
      ...fallbackReport("general", marketOpen),
      warning: "AI services were unavailable. Showing a high-level macro fallback.",
    });
  }
}
