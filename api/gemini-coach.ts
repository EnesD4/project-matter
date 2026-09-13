import type { IncomingMessage, ServerResponse } from "http";
import { handleGeminiCoach } from "./_lib/geminiCoach.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleGeminiCoach(req, res);
}
