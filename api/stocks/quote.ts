import { mockQuotePayload } from "../_lib/mockMarket";

export const config = {
  runtime: "nodejs",
  maxDuration: 15,
};

function sendJson(res: any, status: number, payload: unknown) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function querySymbol(req: any): string {
  try {
    const url = new URL(req.url || "", "http://localhost");
    return String(url.searchParams.get("symbol") || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

export default async function handler(req: any, res: any) {
  const symbol = querySymbol(req);
  if (!symbol) {
    return sendJson(res, 200, mockQuotePayload(""));
  }

  try {
    const yahoo = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      { headers: { "User-Agent": "Sprout/1.0" } }
    );
    const json = (await yahoo.json().catch(() => null)) as {
      chart?: { result?: Array<{ meta?: Record<string, unknown> }> };
    } | null;
    const meta = json?.chart?.result?.[0]?.meta || {};
    const price = Number(meta.regularMarketPrice ?? meta.previousClose ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      return sendJson(res, 200, mockQuotePayload(symbol));
    }
    const previous = Number(meta.chartPreviousClose ?? meta.previousClose ?? 0);
    const change = previous ? price - previous : 0;
    const changePct = previous ? (change / previous) * 100 : 0;
    return sendJson(res, 200, {
      status: "ok",
      c: price,
      d: Number.isFinite(change) ? change : 0,
      dp: Number.isFinite(changePct) ? changePct : 0,
      h: Number(meta.regularMarketDayHigh ?? 0) || price,
      l: Number(meta.regularMarketDayLow ?? 0) || price,
      o: Number(meta.regularMarketOpen ?? previous ?? 0) || price,
      pc: Number.isFinite(previous) && previous > 0 ? previous : price,
      t: Number(meta.regularMarketTime ?? 0) || Math.floor(Date.now() / 1000),
      data: [],
    });
  } catch {
    return sendJson(res, 200, mockQuotePayload(symbol));
  }
}
