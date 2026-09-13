import type { IncomingMessage, ServerResponse } from "http";
import { handleGetAccounts } from "../_lib/plaidHandlers";

export const config = {
  runtime: "nodejs",
  maxDuration: 20,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleGetAccounts(req, res);
}
