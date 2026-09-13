import type { IncomingMessage, ServerResponse } from "http";
import { isPlaidConfigured } from "./env";
import {
  createLinkToken,
  exchangePublicToken,
  fetchPlaidSnapshot,
  pickBalance,
  type PlaidAccount,
  type PlaidHolding,
  type PlaidTransaction,
} from "./plaidClient";
import {
  loadBankAccounts,
  loadPlaidItems,
  resolveApiUser,
  saveBankAccounts,
  savePlaidItem,
} from "./plaidStore";
import { guardApiRequest, guardApiRequestMethods, readJsonBody, sendJson } from "./security";

function header(req: IncomingMessage, name: string): string | string[] | undefined {
  return req.headers[name];
}

async function userFromRequest(req: IncomingMessage) {
  return resolveApiUser({
    authorization: header(req, "authorization"),
    sproutAuthorization: header(req, "x-sprout-authorization"),
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function institutionFromBody(body: unknown): { name: string; id: string } {
  const rec = asRecord(body);
  const nested = asRecord(rec.institution);
  const name = String(nested.name || rec.institution_name || rec.institution || "Linked bank").trim();
  const id = String(nested.institution_id || rec.institution_id || "").trim();
  return { name: name || "Linked bank", id };
}

export function buildPlaidPayload(input: {
  institution: string;
  accounts: PlaidAccount[];
  holdings?: PlaidHolding[];
  transactions?: PlaidTransaction[];
  source?: "plaid" | "supabase";
}) {
  const accounts = input.accounts;
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
    source: input.source || "plaid",
    institution: input.institution,
    chaseChecking,
    marcusHysa,
    moneyMarket,
    cash: { chaseChecking, marcusHysa, moneyMarket },
    accounts,
    holdings: input.holdings || [],
    transactions: input.transactions || [],
  };
}

export async function handleCreateLinkToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequest(req, res)) return;

  if (!isPlaidConfigured()) {
    sendJson(res, 503, { error: "Plaid is not configured on the server" });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    body = asRecord(await readJsonBody(req));
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON body" });
    return;
  }

  try {
    const user = await userFromRequest(req);
    const clientUserId = String(body.client_user_id || user.supabaseUserId || user.id);
    const link_token = await createLinkToken(clientUserId);
    sendJson(res, 200, { link_token });
  } catch (error) {
    console.error("Plaid create-link-token error:", error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to create Plaid link token" });
  }
}

export async function handleExchangeToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequest(req, res)) return;

  if (!isPlaidConfigured()) {
    sendJson(res, 503, { error: "Plaid is not configured on the server" });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    body = asRecord(await readJsonBody(req));
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON body" });
    return;
  }

  const publicToken = String(body.public_token || "").trim();
  if (!publicToken) {
    sendJson(res, 400, { error: "public_token is required" });
    return;
  }

  try {
    const user = await userFromRequest(req);
    const institution = institutionFromBody(body);
    const exchanged = await exchangePublicToken(publicToken);
    const snapshot = await fetchPlaidSnapshot(exchanged.accessToken, institution.name, exchanged.itemId);
    const storeUserId = user.supabaseUserId || user.id;

    await savePlaidItem({
      userId: storeUserId,
      itemId: exchanged.itemId,
      accessToken: exchanged.accessToken,
      institutionId: institution.id,
      institutionName: institution.name,
    });
    if (user.supabaseUserId) {
      await saveBankAccounts(user.supabaseUserId, snapshot.accounts);
    }

    sendJson(
      res,
      200,
      buildPlaidPayload({
        institution: snapshot.institution,
        accounts: snapshot.accounts,
        holdings: snapshot.holdings,
        transactions: snapshot.transactions,
      })
    );
  } catch (error) {
    console.error("Plaid exchange-token error:", error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to exchange Plaid token" });
  }
}

export async function handleGetAccounts(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (await guardApiRequestMethods(req, res, ["GET", "POST"])) return;

  try {
    if (req.method === "POST") {
      try {
        await readJsonBody(req);
      } catch {
        // empty / already consumed
      }
    }

    const user = await userFromRequest(req);
    const storeUserId = user.supabaseUserId || user.id;
    const items = await loadPlaidItems(storeUserId);

    if (items.length > 0 && isPlaidConfigured()) {
      const accounts: PlaidAccount[] = [];
      const holdings: PlaidHolding[] = [];
      const transactions: PlaidTransaction[] = [];
      let institution = items[0]?.institutionName || "Linked bank";

      for (const item of items) {
        try {
          const snapshot = await fetchPlaidSnapshot(item.accessToken, item.institutionName, item.itemId);
          institution = snapshot.institution || institution;
          accounts.push(...snapshot.accounts);
          holdings.push(...snapshot.holdings);
          transactions.push(...snapshot.transactions);
        } catch (error) {
          console.error("Plaid accounts refresh failed for item:", item.itemId, error);
        }
      }

      if (user.supabaseUserId && accounts.length > 0) {
        await saveBankAccounts(user.supabaseUserId, accounts);
      }

      if (accounts.length > 0) {
        sendJson(
          res,
          200,
          buildPlaidPayload({
            institution,
            accounts,
            holdings,
            transactions,
          })
        );
        return;
      }
    }

    const stored = user.supabaseUserId ? await loadBankAccounts(user.supabaseUserId) : [];
    sendJson(
      res,
      200,
      buildPlaidPayload({
        institution: stored[0]?.institution || "Linked bank",
        accounts: stored,
        source: "supabase",
      })
    );
  } catch (error) {
    console.error("Plaid accounts error:", error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to fetch Plaid accounts" });
  }
}
