import type { IncomingMessage, ServerResponse } from "http";
import { handlePortfolioFallback } from "../_lib/resourceFallbacks.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handlePortfolioFallback(req, res);
}
