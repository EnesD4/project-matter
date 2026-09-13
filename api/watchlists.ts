import type { IncomingMessage, ServerResponse } from "http";
import { handleWatchlistsFallback } from "./_lib/resourceFallbacks.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleWatchlistsFallback(req, res);
}
