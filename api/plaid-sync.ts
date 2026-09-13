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

export async function handlePlaidSync(req: any, res: any) {
  return sendJson(res, 410, {
    error: "Plaid sandbox auto-sync was removed. Use /api/plaid/create-link-token and /api/plaid/exchange-token.",
  });
}

export default async function handler(req: any, res: any) {
  return handlePlaidSync(req, res);
}
