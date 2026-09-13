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

export default async function handler(req, res) {
  try {
    const response = await plaidClient.linkTokenCreate({
      client_name: "Sprout",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      user: { client_user_id: "sprout_user_" + Date.now() },
    });
    return res.status(200).json({ link_token: response.data.link_token });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
