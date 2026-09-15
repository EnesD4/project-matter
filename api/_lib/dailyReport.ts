import { GoogleGenAI } from "@google/genai";
import type { IncomingMessage, ServerResponse } from "http";
import {
  EDUCATIONAL_DISCLAIMER,
  SPROUT_SYSTEM_INSTRUCTION,
  stripEducationalDisclaimer,
} from "../../src/lib/sproutAi.js";
import { isUsMarketOpen, getMarketStatusHeader } from "../../src/lib/marketInsights.js";
import { GEMINI_FLASH_MODEL, getGeminiApiKey, getGeminiModel } from "./env.js";
import { guardApiRequestMethods, sendJson } from "./security.js";

type MarketNewsItem = {
  headline?: string;
  summary?: string;
};

type DailyReportPayload = {
  marketOpen: boolean;
  title: string;
  macroDrivers: string;
  indexMovements: string;
  sentimentTakeaway: string;
  source: "ai" | "fallback";
  disclaimer: string;
  warning?: string;
};

const GEMINI_TIMEOUT_MS = 20_000;

function fallbackReport(marketOpen: boolean): DailyReportPayload {
  const { title } = getMarketStatusHeader();
  return {
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

async function fetchMarketHeadlines(): Promise<string[]> {
  const finnhubKey = String(process.env.FINNHUB_API_KEY || "").trim();
  if (!finnhubKey) return [];
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(finnhubKey)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return [];
    const data = (await response.json()) as MarketNewsItem[];
    const items = Array.isArray(data) ? data : [];
    const keyword =
      /\b(fed|fomc|treasury|yield|inflation|cpi|jobs|payroll|gdp|s&p|nasdaq|dow|equity|equities|wall street|earnings|rate cut|rate hike|recession|soft landing)\b/i;
    return items
      .map((n) => (n.headline || n.summary || "").trim())
      .filter(Boolean)
      .sort((a, b) => Number(keyword.test(b)) - Number(keyword.test(a)))
      .slice(0, 8);
  } catch (error) {
    console.error("Error fetching market news:", error);
    return [];
  }
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

async function generateAiReport(
  marketOpen: boolean,
  headlines: string[]
): Promise<DailyReportPayload | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const model = getGeminiModel() || GEMINI_FLASH_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const { title } = getMarketStatusHeader();

  const sessionLabel = marketOpen
    ? "US cash equity markets are OPEN"
    : "US cash equity markets are CLOSED";
  const headlineBlock =
    headlines.length > 0
      ? headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")
      : "No live headlines available — reason from current US macro consensus.";

  const prompt = `${SPROUT_SYSTEM_INSTRUCTION}

Write a concise educational US market briefing. You are teaching context, not giving trade signals.

Context: ${sessionLabel} (America/New_York session).
Recent market headlines:
${headlineBlock}

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

/**
 * Holistic US market AI daily report — macro only.
 * GET /api/market/daily-report
 */
export async function handleDailyReport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequestMethods(req, res, ["GET"])) return;

  try {
    const marketOpen = isUsMarketOpen();
    const headlines = await fetchMarketHeadlines();
    const aiReport = await generateAiReport(marketOpen, headlines);
    if (aiReport) {
      sendJson(res, 200, aiReport);
      return;
    }
    sendJson(res, 200, {
      ...fallbackReport(marketOpen),
      warning: "Live AI synthesis was unavailable. Showing a high-level macro fallback.",
    });
  } catch (error) {
    console.error("Error building daily market report:", error);
    const marketOpen = isUsMarketOpen();
    sendJson(res, 200, {
      ...fallbackReport(marketOpen),
      warning: "AI and news services were unavailable. Showing a high-level macro fallback.",
    });
  }
}
