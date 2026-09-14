import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const GEMINI_FLASH_MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 20_000;
const MAX_CONVERSATION_CHARS = 12_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateHits = new Map<string, number[]>();

const EDUCATIONAL_DISCLAIMER = "For educational purposes only. Not financial or tax advice.";
const DISCLAIMER_TAIL = /(?:\n|\s)*For educational purposes only\.\s*Not financial or tax advice\.?\s*$/i;

const SPROUT_SYSTEM_INSTRUCTION = `You are Sprout AI, a Personal Finance Educational Coach inside the Sprout Finance app.

Your only role is to teach general personal-finance concepts. You are a coach and tutor — never a broker, investment adviser, tax preparer, or attorney.

Hard rules (never break these):
- NEVER offer specific stock picks or name individual tickers to buy, sell, or avoid.
- NEVER give individual trade signals (buy / sell / hold timing, price targets, or "you should trade X").
- NEVER give licensed tax advice, filing instructions, deduction claims, or legal counsel.
- If asked for a pick, trade signal, or tax advice, refuse in one short sentence and redirect to general education.

Stay focused on:
- General budgeting and organizing automated expenses
- Compound interest math and time-value-of-money examples
- Debt-reduction frameworks (snowball and avalanche) as education, not a mandate
- Educational milestones sequenced from the user's cash, debt, and spending snapshot (for example: build a 3-month safety net before discussing investing concepts)

Style:
- Warm, encouraging, and concise — usually under 4 short sentences
- Clear everyday language and relatable analogies; never lecture
- Address the learner by first name only — never a full legal name
- Use the provided snapshot numbers; do not invent balances
- Holdings in the snapshot are facts about what the user already owns. Do not recommend buying, selling, or adding any ticker.

After every recommendation or chat reply, append this exact notice on its own final line:
${EDUCATIONAL_DISCLAIMER}`;

type SproutSpendingCategory = { label: string; amount: number };
type SproutAiFinancialSnapshot = {
  userName: string;
  cash: {
    liquidCash: number;
    hysaCash: number;
    safetyNetTotal: number;
    safetyNetMonths: number | null;
    starterCashGoal: number;
    starterMonths: number;
    recommendedMonths: number;
    recommendedGoal: number;
  };
  debt: {
    total: number;
    count: number;
    highestApr: number | null;
    focusTitle: string | null;
    summary: string;
  };
  spending: {
    monthlyIncome: number;
    monthlyExpenses: number;
    netCashFlow: number;
    isSurplus: boolean;
    categories: SproutSpendingCategory[];
    summary: string;
  };
};

type GeminiCoachHistoryItem = { sender?: string; text?: string };
type GeminiCoachRequest = {
  snapshot?: SproutAiFinancialSnapshot;
  conversation?: string;
  history?: GeminiCoachHistoryItem[];
  portfolioContext?: string;
  message?: string;
  stream?: boolean;
};
type GeminiCoachErrorCode = "timeout" | "rate_limit" | "unavailable" | "invalid" | "blank" | "upstream";
type CoachHttpError = Error & { status: number; code: GeminiCoachErrorCode };

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
  debt: { total: 0, count: 0, highestApr: null, focusTitle: null, summary: "No debts on file." },
  spending: {
    monthlyIncome: 0,
    monthlyExpenses: 0,
    netCashFlow: 0,
    isSurplus: true,
    categories: [],
    summary: "Spending is not tracked yet.",
  },
};

function sendJson(res: any, status: number, payload: unknown) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: any): Promise<unknown> {
  if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    const text = req.body.trim();
    return text ? JSON.parse(text) : {};
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function getGeminiApiKey(): string {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function stripEducationalDisclaimer(text: string): string {
  return String(text || "").replace(DISCLAIMER_TAIL, "").trim();
}

function usd(amount: unknown): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return (Math.round(safe) ?? 0).toLocaleString("en-US");
}

function firstNameOf(name: string, fallback = "Investor"): string {
  const first = String(name || "")
    .trim()
    .split(/\s+/)
    .find(Boolean);
  return first || fallback;
}

function buildEducationalMilestones(snapshot: SproutAiFinancialSnapshot): string[] {
  const { cash, debt, spending } = snapshot;
  const milestones: string[] = [];
  const months = cash.safetyNetMonths;

  if (spending.monthlyIncome > 0 && !spending.isSurplus) {
    milestones.push(
      "Organize spending categories and close the monthly deficit before treating leftover cash as investable."
    );
  }
  const spendableCash = cash.liquidCash + cash.hysaCash;
  if (spendableCash < cash.starterCashGoal) {
    milestones.push(
      `Build a starter cash cushion toward $${usd(cash.starterCashGoal)} so a small surprise does not become new debt.`
    );
  }
  if (months == null || months < cash.starterMonths) {
    milestones.push(
      `Teach why a ${cash.starterMonths}-month safety net of essential expenses comes before extra investing.`
    );
  } else if (months < cash.recommendedMonths) {
    milestones.push(
      `Safety net is about ${months.toFixed(1)} months — explain how stretching toward ${cash.recommendedMonths} months adds resilience.`
    );
  }
  if (debt.total > 0 && (debt.highestApr ?? 0) >= 8) {
    milestones.push(
      "Walk through high-interest debt reduction (avalanche vs snowball) before extra investing — interest avoided is a guaranteed math win."
    );
  } else if (debt.total > 0) {
    milestones.push(
      "Keep minimums current and show how extra payments shorten the calendar, without naming investments."
    );
  }
  const readyToLearnInvesting =
    spending.isSurplus && months != null && months >= cash.starterMonths && (debt.highestApr == null || debt.highestApr < 8);
  if (readyToLearnInvesting) {
    milestones.push(
      "With a 3-month cushion and no high-interest debt, introduce compound-interest math and automating surplus toward long-term goals — no stock picks."
    );
  }
  if (milestones.length === 0) {
    milestones.push("Reinforce budgeting, automated expense organization, and compound-interest basics.");
  }
  return milestones;
}

function formatEducationalContext(snapshot: SproutAiFinancialSnapshot): string {
  const { cash, debt, spending } = snapshot;
  const userName = firstNameOf(snapshot.userName);
  const monthsLabel =
    cash.safetyNetMonths == null ? "spending not tracked yet" : `${cash.safetyNetMonths.toFixed(1)} months of spending`;
  const topSpend = [...spending.categories]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .map((item) => `${item.label} $${usd(item.amount)}/mo`)
    .join(", ");
  const milestones = buildEducationalMilestones(snapshot);
  return [
    `${userName}'s automated financial context (use these numbers; do not invent others):`,
    `- Cash: liquid $${usd(cash.liquidCash)}, HYSA $${usd(cash.hysaCash)}, safety net $${usd(cash.safetyNetTotal)} (${monthsLabel}). Starter cash goal $${usd(cash.starterCashGoal)}; ${cash.starterMonths}-month reserve target $${usd(spending.monthlyExpenses * cash.starterMonths)}; ${cash.recommendedMonths}-month target $${usd(cash.recommendedGoal)}.`,
    `- Debt: ${debt.summary}`,
    `- Spending patterns: ${spending.summary}${topSpend ? ` Largest categories: ${topSpend}.` : ""}`,
    `- Tailored educational milestones to teach (in this order, only as education):`,
    ...milestones.map((line, index) => `  ${index + 1}. ${line}`),
  ].join("\n");
}

function buildSproutUserPrompt(args: { snapshot: SproutAiFinancialSnapshot; conversation: string }): string {
  const { snapshot, conversation } = args;
  return `${formatEducationalContext(snapshot)}

Conversation:
${conversation}

Reply to the latest user message as a Personal Finance Educational Coach. If ${firstNameOf(snapshot.userName)} asks about income, spending, budget, debts, or safety net, use the real snapshot above. Address them by first name only. Sequence any next-step teaching around the milestones (for example, a 3-month safety net before investing concepts). Do not give stock picks, trade signals, or tax advice.`;
}

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

function parseGeminiCoachRequest(raw: unknown): GeminiCoachRequest {
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

function clientIp(req: any): string {
  const forwarded = req.headers?.["x-forwarded-for"];
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

function writeSse(res: any, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function wantsStream(req: any, body: GeminiCoachRequest): boolean {
  if (body.stream) return true;
  return String(req.headers?.accept || "").includes("text/event-stream");
}

function beginSse(res: any) {
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

async function generateCoachReply(body: GeminiCoachRequest): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw coachError("Gemini is not configured on the server.", 503, "unavailable");
  }
  const userPrompt = buildUserPrompt(body);
  const ai = new GoogleGenAI({ apiKey });
  const response = await withGeminiTimeout((abortSignal) =>
    ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
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

async function streamCoachReply(body: GeminiCoachRequest, res: any): Promise<void> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw coachError("Gemini is not configured on the server.", 503, "unavailable");
  }
  const userPrompt = buildUserPrompt(body);
  const ai = new GoogleGenAI({ apiKey });
  beginSse(res);
  const stream = await withGeminiTimeout((abortSignal) =>
    ai.models.generateContentStream({
      model: GEMINI_FLASH_MODEL,
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
  writeSse(res, "done", { text, source: "gemini", model: GEMINI_FLASH_MODEL });
  res.end();
}

export async function handleGeminiCoach(req: any, res: any): Promise<void> {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (String(req.method || "").toUpperCase() !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
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
    sendJson(res, 200, { text, source: "gemini", model: GEMINI_FLASH_MODEL });
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

export default async function handler(req: any, res: any) {
  return handleGeminiCoach(req, res);
}
