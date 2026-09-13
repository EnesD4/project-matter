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

function emptyCashFlow() {
  return {
    status: "ok",
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
    data: [],
  };
}

export default async function handler(req: any, res: any) {
  return sendJson(res, 200, emptyCashFlow());
}
