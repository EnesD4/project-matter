import type { SproutAiFinancialSnapshot } from "./sproutAi";
import { serverlessFetch } from "./serverless";

export type GeminiCoachPayload = {
  snapshot: SproutAiFinancialSnapshot;
  conversation: string;
  portfolioContext: string;
};

export type GeminiCoachCode =
  | "timeout"
  | "rate_limit"
  | "unavailable"
  | "invalid"
  | "blank"
  | "upstream"
  | "network";

export type GeminiCoachOptions = {
  stream?: boolean;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
};

const CLIENT_TIMEOUT_MS = 25_000;

export class GeminiCoachError extends Error {
  status: number;
  code: GeminiCoachCode;

  constructor(message: string, status = 502, code: GeminiCoachCode = "upstream") {
    super(message);
    this.name = "GeminiCoachError";
    this.status = status;
    this.code = code;
  }
}

function classifyHttpError(status: number, error?: string, code?: string): GeminiCoachError {
  if (code === "timeout" || status === 504 || status === 408) {
    return new GeminiCoachError(error || "Sprout AI timed out. Try a shorter question.", 504, "timeout");
  }
  if (code === "rate_limit" || status === 429) {
    return new GeminiCoachError(
      error || "Sprout AI is at its request limit. Try again in a minute.",
      429,
      "rate_limit"
    );
  }
  if (code === "unavailable" || status === 503) {
    return new GeminiCoachError(error || "Gemini is not configured on the server.", 503, "unavailable");
  }
  if (code === "invalid" || status === 400) {
    return new GeminiCoachError(error || "A message is required.", 400, "invalid");
  }
  if (code === "blank") {
    return new GeminiCoachError(error || "Sprout AI came back blank. Try that question again.", 502, "blank");
  }
  return new GeminiCoachError(error || `Coach request failed (${status})`, status || 502, "upstream");
}

function timeoutSignal(ms: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = window.setTimeout(abort, ms);
  if (external) {
    if (external.aborted) abort();
    else external.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      window.clearTimeout(timer);
      external?.removeEventListener("abort", abort);
    },
  };
}

function parseJsonBody(data: { text?: string; error?: string; code?: string }, status: number): string {
  if (status < 200 || status >= 300) {
    throw classifyHttpError(status, data.error, data.code);
  }
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) {
    throw new GeminiCoachError("Sprout AI came back blank. Try that question again.", 502, "blank");
  }
  return text;
}

async function readSseCoach(response: Response, onDelta?: (text: string) => void): Promise<string> {
  if (!response.body) {
    throw new GeminiCoachError("Couldn't reach Gemini just now.", 502, "upstream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  const flushBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    let payload: { delta?: string; text?: string; error?: string; code?: string } = {};
    try {
      payload = JSON.parse(dataLines.join("\n")) as typeof payload;
    } catch {
      return;
    }
    if (event === "error") {
      throw classifyHttpError(502, payload.error, payload.code);
    }
    if (event === "delta" && payload.delta) {
      full += payload.delta;
      onDelta?.(full);
    }
    if (event === "done" && typeof payload.text === "string") {
      full = payload.text;
      onDelta?.(full);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || "";
    for (const block of parts) flushBlock(block);
  }
  if (buffer.trim()) flushBlock(buffer);

  const text = full.trim();
  if (!text) {
    throw new GeminiCoachError("Sprout AI came back blank. Try that question again.", 502, "blank");
  }
  return text;
}

/** POST prompt payloads to the serverless coach. Never instantiate @google/genai in the browser. */
export async function requestGeminiCoach(
  payload: GeminiCoachPayload,
  options: GeminiCoachOptions = {}
): Promise<string> {
  const stream = options.stream ?? Boolean(options.onDelta);
  const { signal, cancel } = timeoutSignal(CLIENT_TIMEOUT_MS, options.signal);

  try {
    const response = await serverlessFetch("/api/gemini-coach", {
      method: "POST",
      headers: {
        Accept: stream ? "text/event-stream, application/json" : "application/json",
      },
      body: JSON.stringify({ ...payload, stream }),
      signal,
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") && response.ok) {
      return await readSseCoach(response, options.onDelta);
    }

    const data = (await response.json().catch(() => ({}))) as {
      text?: string;
      error?: string;
      code?: string;
    };
    const text = parseJsonBody(data, response.status);
    options.onDelta?.(text);
    return text;
  } catch (error) {
    if (error instanceof GeminiCoachError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GeminiCoachError("Sprout AI timed out. Try a shorter question.", 504, "timeout");
    }
    const message = error instanceof Error ? error.message : "Couldn't reach Gemini just now.";
    if (/timed out|abort/i.test(message)) {
      throw new GeminiCoachError("Sprout AI timed out. Try a shorter question.", 504, "timeout");
    }
    throw new GeminiCoachError(message, 502, "network");
  } finally {
    cancel();
  }
}
