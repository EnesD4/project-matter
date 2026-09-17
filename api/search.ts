import type { IncomingMessage, ServerResponse } from "http";
import { searchYahooFinanceQuotes } from "./_lib/yahooSearch.js";
import { applySecurityHeaders, isAllowedOrigin } from "./_lib/security.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};

function sendJson(res: any, status: number, payload: unknown, origin?: string) {
  if (typeof res.setHeader === "function") {
    const allowed = origin && isAllowedOrigin(origin) ? origin : "*";
    res.setHeader("Access-Control-Allow-Origin", allowed);
    if (allowed !== "*") {
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Sprout-Authorization");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
  }

  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function urlOf(req: IncomingMessage | { url?: string }): URL {
  try {
    return new URL(req.url || "", "http://localhost");
  } catch {
    return new URL("http://localhost/");
  }
}

/**
 * Vercel Serverless Function — CORS-free Yahoo Finance fuzzy search proxy.
 * GET /api/search?q={query}
 */
export default async function handler(req: IncomingMessage | any, res: ServerResponse | any) {
  const origin = typeof req.headers?.origin === "string" ? req.headers.origin : undefined;
  const method = String(req.method || "GET").toUpperCase();

  if (typeof applySecurityHeaders === "function") {
    try {
      applySecurityHeaders(req, res, origin);
    } catch {
      // CORS headers still set via sendJson
    }
  }

  if (method === "OPTIONS") {
    if (typeof res.setHeader === "function") {
      const allowed = origin && isAllowedOrigin(origin) ? origin : "*";
      res.setHeader("Access-Control-Allow-Origin", allowed);
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Sprout-Authorization");
    }
    res.statusCode = 204;
    res.end();
    return;
  }

  if (method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" }, origin);
    return;
  }

  const url = urlOf(req);
  const query = String(url.searchParams.get("q") || url.searchParams.get("query") || "")
    .trim()
    .slice(0, 64);

  if (!query) {
    sendJson(res, 200, [], origin);
    return;
  }

  try {
    const results = await searchYahooFinanceQuotes(query, 10);
    sendJson(res, 200, results, origin);
  } catch (error) {
    console.error("Yahoo Finance /api/search failed:", error);
    sendJson(res, 200, [], origin);
  }
}
