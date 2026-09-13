import { GoogleGenAI } from "@google/genai";
import type { IncomingMessage, ServerResponse } from "http";
import {
  buildSproutUserPrompt,
  stripEducationalDisclaimer,
  SPROUT_SYSTEM_INSTRUCTION,
  type SproutAiFinancialSnapshot,
} from "../../src/lib/sproutAi";
import { GEMINI_FLASH_MODEL, getGeminiApiKey, getGeminiModel } from "./env";
import { guardApiRequest, readJsonBody, sendJson } from "./security";

export type GeminiCoachHistoryItem = {
  sender?: string;
  text?: string;
};

export type GeminiCoachRequest = {
  snapshot?: SproutAiFinancialSnapshot;
  conversation?: string;
  history?: GeminiCoachHistoryItem[];
  portfolioContext?: string;
  message?: string;
  stream?: boolean;
};

export type GeminiCoachErrorCode =
  | "timeout"
  | "rate_limit"
  | "unavailable"
  | "invalid"
  | "blank"
  | "upstream";

type CoachHttpError = Error & { status: number; code: GeminiCoachErrorCode };

const GEMINI_TIMEOUT_MS = 20_000;
const MAX_CONVERSATION_CHARS = 12_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateHits = new Map<string, number[]>();

const FALLBACK_SNAPSHOT: SproutAiFinancialSnapshot = {
  userName: "Investor",
  cash: {
    liquidCash: 0,
    hysaCash: 0,
    safetyNetTotal: 0,
    safetyNetMonths: null,
    starterCashGoal: 0,
    starterMonths: 3,
    recommendedMonths: 6,
    recommendedGoal: 0,
  },
  debt: {
    total: 0,
    count: 0,
    highestApr: null,
    focusTitle: null,
    summary: "No debts on file.",
  },
  spending: {
    monthlyIncome: 0,
    monthlyExpenses: 0,
    netCashFlow: 0,
    isSurplus: true,
    categories: [],
    summary: "Spending is not tracked yet.",
  },
};

function coachError(message: string, status: number, code: GeminiCoachErrorCode): CoachHttpError {
  const error = new Error(message) as CoachHttpError;
  error.status = status;
  error.code = code;
  return error;
}

function historyToConversation(history: GeminiCoachHistoryItem[] | undefined): string {
  if (!Array.isArray(history) || history.length === 0) return "";
  return history
    .slice(-12)
    .map((item) => {
      const sender = item.sender === "user" ? "User" : "Sprout AI";
      return `${sender}: ${String(item.text || "").trim()}`;
    })
    .filter((line) => !line.endsWith(":"))
    .join("\n");
}

function asSnapshot(value: unknown): SproutAiFinancialSnapshot {
  if (!value || typeof value !== "object") return FALLBACK_SNAPSHOT;
  const rec = value as Partial<SproutAiFinancialSnapshot>;
  return {
    userName: typeof rec.userName === "string" && rec.userName.trim() ? rec.userName : FALLBACK_SNAPSHOT.userName,
    cash: { ...FALLBACK_SNAPSHOT.cash, ...(rec.cash || {}) },
    debt: { ...FALLBACK_SNAPSHOT.debt, ...(rec.debt || {}) },
    spending: {
      ...FALLBACK_SNAPSHOT.spending,
      ...(rec.spending || {}),
      categories: Array.isArray(rec.spending?.categories) ? rec.spending.categories : [],
    },
  };
}

export function parseGeminiCoachRequest(raw: unknown): GeminiCoachRequest {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    snapshot: asSnapshot(rec.snapshot),
    conversation: typeof rec.conversation === "string" ? rec.conversation : undefined,
    history: Array.isArray(rec.history) ? (rec.history as GeminiCoachHistoryItem[]) : undefined,
    portfolioContext: typeof rec.portfolioContext === "string" ? rec.portfolioContext : undefined,
    message: typeof rec.message === "string" ? rec.message : undefined,
    stream: rec.stream === true,
  };
}

function clipConversation(text: string): string {
  if (text.length <= MAX_CONVERSATION_CHARS) return text;
  return text.slice(-MAX_CONVERSATION_CHARS);
}

function buildUserPrompt(body: GeminiCoachRequest): string {
  const conversation = clipConversation(
    (body.conversation || "").trim() || historyToConversation(body.history) || (body.message || "").trim()
  );
  if (!conversation) {
    throw coachError("A message is required.", 400, "invalid");
  }

  return `${buildSproutUserPrompt({
    snapshot: body.snapshot || FALLBACK_SNAPSHOT,
    conversation,
  })}\n- Investment portfolio (facts only — do not recommend trades): ${
    body.portfolioContext?.trim() || "No investments or connected accounts yet."
  }`;
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (rateHits.get(key) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    rateHits.set(key, recent);
    return true;
  }
  recent.push(now);
  rateHits.set(key, recent);
  return false;
}

const KNOWN_CODES: GeminiCoachErrorCode[] = [
  "timeout",
  "rate_limit",
  "unavailable",
  "invalid",
  "blank",
  "upstream",
];

function classifyGeminiError(error: unknown): CoachHttpError {
  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const existing = error as CoachHttpError;
    if (existing.status && KNOWN_CODES.includes(existing.code)) {
      return existing;
    }
  }

  const err = error as { status?: number; code?: string; message?: string; name?: string };
  const raw = `${err?.code || ""} ${err?.message || ""} ${err?.name || ""}`.toLowerCase();
  const status = Number(err?.status) || 0;

  if (
    err?.name === "AbortError" ||
    raw.includes("aborted") ||
    raw.includes("timeout") ||
    raw.includes("deadline") ||
    raw.includes("etimedout")
  ) {
    return coachError("Sprout AI timed out. Try a shorter question.", 504, "timeout");
  }
  if (status === 429 || raw.includes("resource_exhausted") || raw.includes("rate") || raw.includes("quota")) {
    return coachError("Sprout AI is at its request limit. Try again in a minute.", 429, "rate_limit");
  }
  if (status === 401 || status === 403 || raw.includes("api key") || raw.includes("permission_denied")) {
    return coachError("Gemini is not configured on the server.", 503, "unavailable");
  }
  if (status === 400 || raw.includes("invalid_argument")) {
    return coachError("Sprout AI couldn't use that request. Try rephrasing.", 400, "invalid");
  }
  return coachError("Couldn't reach Gemini just now.", status >= 400 && status < 600 ? status : 502, "upstream");
}

function errorPayload(error: unknown): { error: string; code: GeminiCoachErrorCode } {
  const classified = classifyGeminiError(error);
  return { error: classified.message, code: classified.code };
}

function writeSse(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function wantsStream(req: IncomingMessage, body: GeminiCoachRequest): boolean {
  if (body.stream) return true;
  const accept = String(req.headers.accept || "");
  return accept.includes("text/event-stream");
}

function beginSse(res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

async function withGeminiTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function getGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export async function generateCoachReply(body: GeminiCoachRequest): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw coachError("Gemini is not configured on the server.", 503, "unavailable");
  }

  const userPrompt = buildUserPrompt(body);
  const model = getGeminiModel() || GEMINI_FLASH_MODEL;
  const ai = getGeminiClient(apiKey);

  const response = await withGeminiTimeout((abortSignal) =>
    ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
        abortSignal,
        httpOptions: { timeout: GEMINI_TIMEOUT_MS },
      },
    })
  );

  const text = stripEducationalDisclaimer(String(response.text || ""));
  if (!text) {
    throw coachError("Sprout AI came back blank. Try that question again.", 502, "blank");
  }
  return text;
}

async function streamCoachReply(
  body: GeminiCoachRequest,
  res: ServerResponse
): Promise<void> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw coachError("Gemini is not configured on the server.", 503, "unavailable");
  }

  const userPrompt = buildUserPrompt(body);
  const model = getGeminiModel() || GEMINI_FLASH_MODEL;
  const ai = getGeminiClient(apiKey);

  beginSse(res);

  const stream = await withGeminiTimeout((abortSignal) =>
    ai.models.generateContentStream({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
        abortSignal,
        httpOptions: { timeout: GEMINI_TIMEOUT_MS },
      },
    })
  );

  let full = "";
  for await (const chunk of stream) {
    const delta = String(chunk.text || "");
    if (!delta) continue;
    full += delta;
    writeSse(res, "delta", { delta });
  }

  const text = stripEducationalDisclaimer(full);
  if (!text) {
    writeSse(res, "error", { error: "Sprout AI came back blank. Try that question again.", code: "blank" });
    res.end();
    return;
  }

  writeSse(res, "done", { text, source: "gemini", model });
  res.end();
}

export async function handleGeminiCoach(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequest(req, res)) return;

  if (isRateLimited(clientIp(req))) {
    sendJson(res, 429, {
      error: "Sprout AI is at its request limit. Try again in a minute.",
      code: "rate_limit",
    });
    return;
  }

  let payload: GeminiCoachRequest;
  try {
    payload = parseGeminiCoachRequest(await readJsonBody(req));
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Invalid JSON body",
      code: "invalid",
    });
    return;
  }

  try {
    if (wantsStream(req, payload)) {
      await streamCoachReply(payload, res);
      return;
    }

    const text = await generateCoachReply(payload);
    sendJson(res, 200, { text, source: "gemini", model: getGeminiModel() || GEMINI_FLASH_MODEL });
  } catch (error) {
    if (res.headersSent) {
      try {
        writeSse(res, "error", errorPayload(error));
      } finally {
        res.end();
      }
      return;
    }
    const classified = classifyGeminiError(error);
    sendJson(res, classified.status, { error: classified.message, code: classified.code });
  }
}
