import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

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

function sendJson(res, status, payload) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    const response = await plaidClient.linkTokenCreate({
      client_name: "Sprout",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      user: { client_user_id: "user_" + Date.now() },
    });
    return sendJson(res, 200, { link_token: response.data.link_token });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}
