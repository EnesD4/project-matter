import {
  handleCreateLinkToken,
  handleExchangeToken,
  handleGetAccounts,
} from "../_lib/plaidHandlers.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 20,
};

function sendJson(res: any, status: number, payload: unknown) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function plaidAction(req: { url?: string; query?: Record<string, unknown> }): string {
  try {
    const pathname = new URL(req.url || "", "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("plaid");
    if (idx >= 0 && parts[idx + 1]) return String(parts[idx + 1]);
  } catch {
    // fall through
  }
  const path = req.query?.path;
  if (Array.isArray(path) && path[0]) return String(path[0]);
  if (typeof path === "string" && path) return path.split("/").filter(Boolean)[0] || "";
  return "";
}

export default async function handler(req: any, res: any) {
  const action = plaidAction(req);

  if (action === "create-link-token") {
    return handleCreateLinkToken(req, res);
  }
  if (action === "exchange-token") {
    return handleExchangeToken(req, res);
  }
  if (action === "accounts") {
    return handleGetAccounts(req, res);
  }

  return sendJson(res, 404, { error: "Not found" });
}
