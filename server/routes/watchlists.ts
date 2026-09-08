import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

function normalizeName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 48);
}

function normalizeSymbol(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, '')
    .slice(0, 12);
}

router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    const lists = await prisma.watchlist.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'asc' },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
      },
    });
    return res.json(lists);
  } catch (error) {
    console.error('Watchlist list error:', error);
    return res.status(500).json({ error: 'Failed to load watchlists' });
  }
});

router.post('/', async (req: AuthedRequest, res: Response) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'Watchlist name is required' });
    }

    const list = await prisma.watchlist.create({
      data: {
        userId: req.user!.id,
        name,
      },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
      },
    });

    return res.status(201).json(list);
  } catch (error) {
    console.error('Watchlist create error:', error);
    return res.status(500).json({ error: 'Failed to create watchlist' });
  }
});

router.delete('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      return res.status(400).json({ error: 'Watchlist id is required' });
    }

    const existing = await prisma.watchlist.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    await prisma.watchlist.delete({ where: { id } });
    return res.json({ ok: true, id });
  } catch (error) {
    console.error('Watchlist delete error:', error);
    return res.status(500).json({ error: 'Failed to delete watchlist' });
  }
});

router.post('/:id/items', async (req: AuthedRequest, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const symbol = normalizeSymbol(req.body?.symbol);
    const name = normalizeName(req.body?.name) || symbol;

    if (!id) {
      return res.status(400).json({ error: 'Watchlist id is required' });
    }
    if (!symbol) {
      return res.status(400).json({ error: 'Ticker symbol is required' });
    }

    const list = await prisma.watchlist.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!list) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    const duplicate = await prisma.watchlistItem.findFirst({
      where: { watchlistId: id, symbol },
    });
    if (duplicate) {
      return res.status(409).json({ error: `${symbol} is already in this list` });
    }

    const item = await prisma.watchlistItem.create({
      data: {
        watchlistId: id,
        symbol,
        name,
      },
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error('Watchlist item create error:', error);
    return res.status(500).json({ error: 'Failed to add ticker' });
  }
});

router.delete('/:id/items/:itemId', async (req: AuthedRequest, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const itemId = String(req.params.itemId || '');
    if (!id || !itemId) {
      return res.status(400).json({ error: 'Watchlist and item ids are required' });
    }

    const list = await prisma.watchlist.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!list) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    const existing = await prisma.watchlistItem.findFirst({
      where: { id: itemId, watchlistId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Ticker not found in this list' });
    }

    await prisma.watchlistItem.delete({ where: { id: itemId } });
    return res.json({ ok: true, id: itemId });
  } catch (error) {
    console.error('Watchlist item delete error:', error);
    return res.status(500).json({ error: 'Failed to remove ticker' });
  }
});

export default router;
