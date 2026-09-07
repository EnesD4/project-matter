import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    const items = await prisma.portfolioItem.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(items);
  } catch (error) {
    console.error('Portfolio list error:', error);
    return res.status(500).json({ error: 'Failed to load portfolio' });
  }
});

router.post('/', async (req: AuthedRequest, res: Response) => {
  try {
    const symbol = String(req.body?.symbol || '')
      .trim()
      .toUpperCase();
    // Accept both API field names (shares/buyPrice) and frontend names (quantity/avgCost).
    const shares = Number(req.body?.shares ?? req.body?.quantity);
    const buyPrice = Number(req.body?.buyPrice ?? req.body?.avgCost);

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      return res.status(400).json({ error: 'Shares must be a positive number' });
    }
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
      return res.status(400).json({ error: 'Buy price must be a positive number' });
    }

    const item = await prisma.portfolioItem.create({
      data: {
        userId: req.user!.id,
        symbol,
        shares,
        buyPrice,
      },
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error('Portfolio create error:', error);
    return res.status(500).json({ error: 'Failed to add portfolio item' });
  }
});

router.delete('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      return res.status(400).json({ error: 'Item id is required' });
    }

    const existing = await prisma.portfolioItem.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Portfolio item not found' });
    }

    await prisma.portfolioItem.delete({ where: { id } });
    return res.json({ ok: true, id });
  } catch (error) {
    console.error('Portfolio delete error:', error);
    return res.status(500).json({ error: 'Failed to delete portfolio item' });
  }
});

export default router;
