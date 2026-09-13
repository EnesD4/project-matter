import type { IncomingMessage, ServerResponse } from "http";
import { handleCreateLinkToken } from "../_lib/plaidHandlers";
import { sendJson } from "../_lib/security";

export const config = {
  runtime: "nodejs",
  maxDuration: 20,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await handleCreateLinkToken(req, res);
  } catch (error) {
    const rec = error && typeof error === "object" ? (error as { response?: { data?: unknown }; message?: string }) : null;
    sendJson(res, 500, { error: rec?.response?.data || rec?.message || "Failed to create Plaid link token" });
  }
}
