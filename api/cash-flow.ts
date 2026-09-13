import type { IncomingMessage, ServerResponse } from "http";
import { guardApiRequestMethods, readJsonBody, sendJson } from "./_lib/security.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};

function emptyCashFlow() {
  return {
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
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (await guardApiRequestMethods(req, res, ["GET", "PUT", "POST"])) return;

  try {
    if ((req.method || "").toUpperCase() === "GET") {
      sendJson(res, 200, emptyCashFlow());
      return;
    }

    let body: Record<string, unknown> = {};
    try {
      body = asRecord(await readJsonBody(req));
    } catch {
      body = {};
    }

    sendJson(res, 200, {
      ...emptyCashFlow(),
      ...body,
      expenses: Array.isArray(body.expenses) ? body.expenses : [],
      debts: Array.isArray(body.debts) ? body.debts : [],
      updatedAt: Date.now(),
    });
  } catch {
    sendJson(res, 200, emptyCashFlow());
  }
}
