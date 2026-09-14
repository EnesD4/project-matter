import type { IncomingMessage, ServerResponse } from "http";
import { guardApiRequestMethods, readJsonBody, sendJson } from "./security.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    return asRecord(await readJsonBody(req));
  } catch {
    return {};
  }
}

function pathOf(req: IncomingMessage): string {
  const raw = req.url || "";
  try {
    const path = raw.includes("://") ? new URL(raw).pathname : raw.split("?")[0] || "";
    return path.replace(/\/+$/, "") || "/";
  } catch {
    return (raw.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function handlePortfolioFallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequestMethods(req, res, ["GET", "POST", "PUT", "PATCH", "DELETE"])) return;

  try {
    const method = (req.method || "GET").toUpperCase();
    const path = pathOf(req);
    const parts = path.split("/").filter(Boolean);

    if (method === "GET") {
      sendJson(res, 200, []);
      return;
    }

    if (method === "POST" && parts[parts.length - 1] === "sell") {
      const body = await readBody(req);
      sendJson(res, 200, {
        deleted: true,
        id: parts[parts.length - 2] || newId("lot"),
        sharesSold: Number(body.shares) || 0,
        sellPrice: Number(body.sellPrice) || 0,
      });
      return;
    }

    if (method === "POST") {
      const body = await readBody(req);
      sendJson(res, 200, {
        id: newId("lot"),
        userId: "local",
        symbol: String(body.symbol || "").trim().toUpperCase(),
        shares: Number(body.shares) || 0,
        buyPrice: Number(body.buyPrice) || 0,
        purchasedAt: body.purchasedAt ?? null,
        accountType: "paper",
        createdAt: new Date().toISOString(),
      });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch {
    sendJson(res, 200, []);
  }
}

export async function handleWatchlistsFallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequestMethods(req, res, ["GET", "POST", "PUT", "PATCH", "DELETE"])) return;

  try {
    const method = (req.method || "GET").toUpperCase();
    const path = pathOf(req);
    const parts = path.split("/").filter(Boolean);

    if (method === "GET") {
      sendJson(res, 200, []);
      return;
    }

    if (method === "POST" && parts[parts.length - 1] === "items") {
      const body = await readBody(req);
      const symbol = String(body.symbol || "").trim().toUpperCase();
      sendJson(res, 200, {
        id: newId("wli"),
        watchlistId: parts[parts.length - 2] || newId("wl"),
        symbol,
        name: String(body.name || symbol).trim() || symbol,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    if (method === "POST") {
      const body = await readBody(req);
      sendJson(res, 200, {
        id: newId("wl"),
        userId: "local",
        name: String(body.name || "Watchlist").trim() || "Watchlist",
        createdAt: new Date().toISOString(),
        items: [],
      });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch {
    sendJson(res, 200, []);
  }
}

/** Local-dev only empty cash-flow payload (not deployed as a Vercel function). */
export async function handleCashFlowFallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequestMethods(req, res, ["GET", "POST", "PUT", "PATCH"])) return;
  sendJson(res, 200, {
    status: "ok",
    monthlyIncome: 0,
    emergencyFund: 0,
    extraPayoff: 0,
    expenses: [],
    debts: [],
    safetyNet: {
      portfolioPct: 0,
      goldAmount: 0,
      goldUnit: "oz",
      bonds: [],
      hysaCash: 0,
      reserveLines: [],
    },
    updatedAt: 0,
    data: [],
  });
}
