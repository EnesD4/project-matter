import type { IncomingMessage, ServerResponse } from "http";
import { guardApiRequest, sendJson } from "./security";

/** Deprecated: the mock auto-sync path was removed. Use Plaid Link + /api/plaid/* instead. */
export async function handlePlaidSync(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequest(req, res)) return;
  sendJson(res, 410, {
    error: "Plaid sandbox auto-sync was removed. Use /api/plaid/create-link-token and /api/plaid/exchange-token.",
  });
}
