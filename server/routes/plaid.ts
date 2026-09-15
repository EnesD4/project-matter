import { Router, Response } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { isPlaidConfigured, plaidCredentialsError } from '../../api/_lib/env';
import {
  linkTokenCreate,
  exchangePublicToken,
  fetchPlaidSnapshot,
  logPlaidError,
  pickBalance,
  resolvePlaidLinkMode,
  type PlaidAccount,
  type PlaidHolding,
  type PlaidTransaction,
} from '../../api/_lib/plaidClient';

type StoredItem = {
  accessToken: string;
  itemId: string;
  institutionName: string;
};

const itemsByUser = new Map<string, StoredItem[]>();

function buildPayload(input: {
  institution: string;
  accounts: PlaidAccount[];
  holdings?: PlaidHolding[];
  brokerageCash?: number;
  transactions?: PlaidTransaction[];
  source?: 'plaid' | 'supabase';
}) {
  const accounts = input.accounts;
  const chaseChecking = pickBalance(
    accounts,
    (account) => account.type === 'depository' && /check/i.test(`${account.subtype} ${account.name}`)
  );
  const marcusHysa = pickBalance(
    accounts,
    (account) => account.type === 'depository' && /sav/i.test(`${account.subtype} ${account.name}`)
  );
  const moneyMarket = pickBalance(accounts, (account) =>
    /money/.test(`${account.subtype} ${account.name}`.toLowerCase())
  );
  const brokerageCash = Math.max(0, Number(input.brokerageCash) || 0);
  return {
    sandbox: true,
    source: input.source || 'plaid',
    institution: input.institution,
    chaseChecking,
    marcusHysa,
    moneyMarket,
    brokerageCash,
    cash: { chaseChecking, marcusHysa, moneyMarket, brokerageCash },
    accounts,
    holdings: input.holdings || [],
    transactions: input.transactions || [],
  };
}

const router = Router();

router.post('/create-link-token', async (req: AuthedRequest, res: Response) => {
  const credentialError = plaidCredentialsError();
  if (credentialError) {
    return res.status(500).json({ error: credentialError });
  }

  try {
    const user_id = String(req.body?.user_id || req.body?.client_user_id || req.user?.id || 'user_default');
    const mode = resolvePlaidLinkMode(req.body?.mode || req.body?.link_mode || req.body?.product);
    const link_token = await linkTokenCreate(user_id || 'user_default', { mode });
    return res.status(200).json({ link_token, mode });
  } catch (error) {
    const rec = error && typeof error === 'object' ? (error as { response?: { data?: unknown }; message?: string }) : null;
    console.error(rec?.response?.data || rec?.message || (error instanceof Error ? error.message : error));
    logPlaidError('Plaid create-link-token error', error);
    return res.status(500).json({ error: rec?.response?.data || rec?.message || (error instanceof Error ? error.message : String(error)) });
  }
});

router.use(requireAuth);

router.post('/exchange-token', async (req: AuthedRequest, res: Response) => {
  try {
    if (!isPlaidConfigured()) {
      return res.status(503).json({ error: 'Plaid is not configured on the server' });
    }
    const publicToken = String(req.body?.public_token || '').trim();
    if (!publicToken) {
      return res.status(400).json({ error: 'public_token is required' });
    }
    const institution = req.body?.institution && typeof req.body.institution === 'object'
      ? req.body.institution
      : {};
    const institutionName = String(institution.name || req.body?.institution || 'Linked bank');
    const userId = req.user!.id;

    const exchanged = await exchangePublicToken(publicToken);
    const snapshot = await fetchPlaidSnapshot(exchanged.accessToken, institutionName, exchanged.itemId);
    const existing = itemsByUser.get(userId) || [];
    itemsByUser.set(userId, [
      ...existing.filter((item) => item.itemId !== exchanged.itemId),
      { accessToken: exchanged.accessToken, itemId: exchanged.itemId, institutionName },
    ]);

    return res.json(
      buildPayload({
        institution: snapshot.institution,
        accounts: snapshot.accounts,
        holdings: snapshot.holdings,
        brokerageCash: snapshot.brokerageCash,
        transactions: snapshot.transactions,
      })
    );
  } catch (error) {
    console.error('Plaid exchange-token error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to exchange Plaid token',
    });
  }
});

async function sendAccounts(req: AuthedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const items = itemsByUser.get(userId) || [];
    if (items.length === 0 || !isPlaidConfigured()) {
      return res.json(buildPayload({ institution: 'Linked bank', accounts: [], source: 'supabase' }));
    }

    const accounts: PlaidAccount[] = [];
    const holdings: PlaidHolding[] = [];
    const transactions: PlaidTransaction[] = [];
    let brokerageCash = 0;
    let institution = items[0]?.institutionName || 'Linked bank';
    for (const item of items) {
      try {
        const snapshot = await fetchPlaidSnapshot(item.accessToken, item.institutionName, item.itemId);
        institution = snapshot.institution || institution;
        accounts.push(...snapshot.accounts);
        holdings.push(...snapshot.holdings);
        transactions.push(...snapshot.transactions);
        brokerageCash += Number(snapshot.brokerageCash) || 0;
      } catch (error) {
        console.error('Plaid accounts refresh failed:', error);
      }
    }
    return res.json(buildPayload({ institution, accounts, holdings, brokerageCash, transactions }));
  } catch (error) {
    console.error('Plaid accounts error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch Plaid accounts',
    });
  }
}

router.get('/accounts', sendAccounts);
router.post('/accounts', sendAccounts);

router.post('/sandbox', (_req: AuthedRequest, res: Response) => {
  return res.status(410).json({
    error: 'Plaid sandbox auto-connect was removed. Use /api/plaid/create-link-token.',
  });
});

export default router;
