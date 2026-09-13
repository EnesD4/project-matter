import type { IncomingMessage, ServerResponse } from "http";
import { handleExchangeToken } from "../_lib/plaidHandlers";

export const config = {
  runtime: "nodejs",
  maxDuration: 20,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleExchangeToken(req, res);
}
