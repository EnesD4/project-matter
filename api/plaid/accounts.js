import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export const config = {
  runtime: "nodejs",
  maxDuration: 20,
};

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

async function readBody(req) {
  if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sendJson(res, status, payload) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(status).json(payload);
    return;
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function mapAccounts(accounts, institution) {
  return (accounts || []).map((account) => ({
    id: account.account_id,
    name: account.name,
    officialName: account.official_name || account.name,
    type: account.type,
    subtype: account.subtype,
    mask: account.mask,
    institution,
    balance: Number(account.balances?.current ?? account.balances?.available ?? 0) || 0,
    availableBalance: Number(account.balances?.available ?? account.balances?.current ?? 0) || 0,
    isoCurrency: account.balances?.iso_currency_code || "USD",
  }));
}

function pickBalance(accounts, match) {
  return accounts.filter(match).reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
}

function buildPayload(accounts, institution) {
  const chaseChecking = pickBalance(
    accounts,
    (account) => account.type === "depository" && /check/i.test(`${account.subtype} ${account.name}`)
  );
  const marcusHysa = pickBalance(
    accounts,
    (account) => account.type === "depository" && /sav/i.test(`${account.subtype} ${account.name}`)
  );
  const moneyMarket = pickBalance(accounts, (account) =>
    /money/.test(`${account.subtype} ${account.name}`.toLowerCase())
  );
  return {
    sandbox: true,
    source: "plaid",
    institution,
    chaseChecking,
    marcusHysa,
    moneyMarket,
    cash: { chaseChecking, marcusHysa, moneyMarket },
    accounts,
    holdings: [],
    transactions: [],
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    req.body = await readBody(req);
    const accessToken =
      req.body?.access_token || req.body?.accessToken || process.env.PLAID_ACCESS_TOKEN;
    if (!accessToken) {
      sendJson(res, 200, buildPayload([], "Linked bank"));
      return;
    }

    const response = await plaidClient.accountsGet({ access_token: accessToken });
    const institution = response.data.item?.institution_name || req.body?.institution || "Linked bank";
    const accounts = mapAccounts(response.data.accounts, institution);
    sendJson(res, 200, buildPayload(accounts, institution));
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}
