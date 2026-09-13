export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};

function sendJson(res: any, status: number, payload: unknown) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET") {
    return sendJson(res, 200, []);
  }
  return sendJson(res, 200, { status: "ok", data: [] });
}
