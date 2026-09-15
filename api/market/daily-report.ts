import { handleDailyReport } from "../_lib/dailyReport.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 25,
};

export default async function handler(req: any, res: any) {
  return handleDailyReport(req, res);
}
