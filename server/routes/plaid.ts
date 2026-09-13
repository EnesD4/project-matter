import { Router, Response } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { isPlaidConfigured } from '../../api/_lib/env';
import {
  createLinkToken,
  exchangePublicToken,
  fetchPlaidSnapshot,
  pickBalance,
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
  return {
    sandbox: true,
    source: input.source || 'plaid',
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

const router = Router();

router.use(requireAuth);

router.post('/create-link-token', async (req: AuthedRequest, res: Response) => {
  try {
    if (!isPlaidConfigured()) {
      return res.status(503).json({ error: 'Plaid is not configured on the server' });
    }
    const userId = String(req.body?.client_user_id || req.user!.id);
    const link_token = await createLinkToken(userId);
    return res.json({ link_token });
  } catch (error) {
    console.error('Plaid create-link-token error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create Plaid link token',
    });
  }
});

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
    let institution = items[0]?.institutionName || 'Linked bank';
    for (const item of items) {
      try {
        const snapshot = await fetchPlaidSnapshot(item.accessToken, item.institutionName, item.itemId);
        institution = snapshot.institution || institution;
        accounts.push(...snapshot.accounts);
        holdings.push(...snapshot.holdings);
        transactions.push(...snapshot.transactions);
      } catch (error) {
        console.error('Plaid accounts refresh failed:', error);
      }
    }
    return res.json(buildPayload({ institution, accounts, holdings, transactions }));
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
