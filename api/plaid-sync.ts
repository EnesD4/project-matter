import type { IncomingMessage, ServerResponse } from "http";
import { handlePlaidSync } from "./_lib/plaidSync.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 20,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handlePlaidSync(req, res);
}
