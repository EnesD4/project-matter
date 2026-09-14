import type { IncomingMessage, ServerResponse } from "http";
import {
  mockChartPayload,
  mockHistoryPayload,
  mockProfilePayload,
  mockQuoteForSymbol,
} from "./mockMarket.js";

function sendJson(res: any, status: number, payload: unknown) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function urlOf(req: IncomingMessage | { url?: string }): URL {
  try {
    return new URL(req.url || "", "http://localhost");
  } catch {
    return new URL("http://localhost/");
  }
}

function stocksParts(req: IncomingMessage | { url?: string; query?: Record<string, unknown> }): string[] {
  const url = urlOf(req);
  const fromUrl = url.pathname.split("/").filter(Boolean);
  const idx = fromUrl.indexOf("stocks");
  if (idx >= 0) return fromUrl.slice(idx + 1);
  const query = (req as { query?: Record<string, unknown> }).query;
  const path = query?.path;
  if (Array.isArray(path)) return path.map(String);
  if (typeof path === "string") return path.split("/").filter(Boolean);
  return [];
}

const YAHOO_RANGE: Record<string, { interval: string; range: string }> = {
  "1D": { interval: "5m", range: "1d" },
  "1W": { interval: "15m", range: "5d" },
  "1M": { interval: "1d", range: "1mo" },
  YTD: { interval: "1d", range: "ytd" },
  "1Y": { interval: "1d", range: "1y" },
  ALL: { interval: "1wk", range: "5y" },
};

async function yahooChart(symbol: string, range: string) {
  const spec = YAHOO_RANGE[range] || YAHOO_RANGE["1M"];
  const yahoo = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${spec.interval}&range=${spec.range}`,
    { headers: { "User-Agent": "Sprout/1.0" } }
  );
  const json = (await yahoo.json().catch(() => null)) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> };
      }>;
    };
  } | null;
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  const points = timestamps
    .map((ts, i) => {
      const close = Number(quote?.close?.[i]);
      const open = Number(quote?.open?.[i]);
      const high = Number(quote?.high?.[i]);
      const low = Number(quote?.low?.[i]);
      const volume = Number(quote?.volume?.[i]);
      const price = Number.isFinite(close) && close > 0 ? close : open;
      if (!Number.isFinite(price) || price <= 0) return null;
      const timestamp = ts * 1000;
      return {
        timestamp,
        date: new Date(timestamp).toISOString(),
        price,
        open: Number.isFinite(open) && open > 0 ? open : price,
        high: Number.isFinite(high) && high > 0 ? high : price,
        low: Number.isFinite(low) && low > 0 ? low : price,
        close: price,
        volume: Number.isFinite(volume) ? volume : 0,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  return points;
}

export default async function handleStockPath(req: IncomingMessage | any, res: ServerResponse | any) {
  const url = urlOf(req);
  const parts = stocksParts(req);
  const method = String(req.method || "GET").toUpperCase();

  if (parts[0] === "profile") {
    const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
    return sendJson(res, 200, mockProfilePayload(symbol));
  }

  if (parts[0] === "dividends") {
    return sendJson(res, 200, { items: [] });
  }

  if (parts[0] === "metrics") {
    const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
    const quote = mockQuoteForSymbol(symbol);
    return sendJson(res, 200, {
      symbol,
      marketCap: null,
      pe: null,
      eps: null,
      price: quote?.c ?? 0,
      source: "mock",
    });
  }

  if (parts[0] === "analysis") {
    return sendJson(res, 200, {});
  }

  if (parts.length >= 2 && parts[1] === "chart") {
    const symbol = String(parts[0] || "").trim().toUpperCase();
    const range = String(url.searchParams.get("range") || "1M");
    if (!symbol) return sendJson(res, 200, mockChartPayload("AAPL", range));
    try {
      const points = await yahooChart(symbol, range);
      if (points.length > 0) {
        return sendJson(res, 200, { symbol, range, interval: range === "1D" ? "5m" : "1d", source: "yahoo", points });
      }
    } catch {
      // fall through to mock
    }
    return sendJson(res, 200, mockChartPayload(symbol, range));
  }

  if (parts.length >= 2 && parts[1] === "history") {
    const symbol = String(parts[0] || "").trim().toUpperCase();
    const date = String(url.searchParams.get("date") || "");
    return sendJson(res, 200, mockHistoryPayload(symbol, date));
  }

  if (method === "GET") {
    return sendJson(res, 404, { error: "Not found" });
  }
  return sendJson(res, 404, { error: "Not found" });
}
