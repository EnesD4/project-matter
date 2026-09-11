import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { isoToUtcNoon, parseFlexibleDate, todayIsoLocal } from '../lib/dates';

const router = Router();

router.use(requireAuth);

function parsePurchasedAt(raw: unknown): Date | undefined {
  if (raw == null || raw === '') return undefined;
  const iso = parseFlexibleDate(raw);
  if (!iso) return undefined;
  if (iso > todayIsoLocal()) return undefined;
  return isoToUtcNoon(iso) ?? undefined;
}

type LotLike = {
  id: string;
  shares: number;
  buyPrice: number;
  purchasedAt: Date | null;
};

function earlierDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** Combine lots into one position: sum shares, weighted-average cost, earliest purchase date. */
function aggregateLots(lots: LotLike[]): { shares: number; avgCost: number; purchasedAt: Date | null } {
  let shares = 0;
  let cost = 0;
  let purchasedAt: Date | null = null;
  for (const lot of lots) {
    const qty = Number(lot.shares);
    const px = Number(lot.buyPrice);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    shares += qty;
    cost += qty * (Number.isFinite(px) ? px : 0);
    purchasedAt = earlierDate(purchasedAt, lot.purchasedAt);
  }
  return { shares, avgCost: shares > 0 ? cost / shares : 0, purchasedAt };
}

async function listPaperLots(userId: string) {
  try {
    return await prisma.portfolioItem.findMany({
      where: { userId, accountType: 'paper' },
      orderBy: { createdAt: 'asc' },
    });
  } catch {
    // Older Prisma clients / DBs may not have accountType yet.
    return prisma.portfolioItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

async function findPaperLots(userId: string, symbol: string) {
  const items = await listPaperLots(userId);
  return items.filter((item) => item.symbol.trim().toUpperCase() === symbol);
}

async function collapseDuplicatePaperLots(userId: string) {
  const items = await listPaperLots(userId);
  const bySymbol = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.symbol.trim().toUpperCase();
    const group = bySymbol.get(key);
    if (group) group.push(item);
    else bySymbol.set(key, [item]);
  }

  for (const lots of bySymbol.values()) {
    if (lots.length < 2) continue;
    const combined = aggregateLots(lots);
    await saveAggregatedLot(lots[0].id, combined.shares, combined.avgCost, combined.purchasedAt);
    await prisma.portfolioItem.deleteMany({
      where: { id: { in: lots.slice(1).map((lot) => lot.id) }, userId },
    });
  }
}

async function saveAggregatedLot(
  keeperId: string,
  shares: number,
  buyPrice: number,
  purchasedAt: Date | null
) {
  const data: { shares: number; buyPrice: number; purchasedAt?: Date } = { shares, buyPrice };
  if (purchasedAt) data.purchasedAt = purchasedAt;
  try {
    return await prisma.portfolioItem.update({ where: { id: keeperId }, data });
  } catch {
    return prisma.portfolioItem.update({
      where: { id: keeperId },
      data: { shares, buyPrice },
    });
  }
}

router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    try {
      await collapseDuplicatePaperLots(req.user!.id);
    } catch (collapseError) {
      console.error('Portfolio duplicate collapse error:', collapseError);
    }
    const items = await prisma.portfolioItem.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(
      items.map((item) => {
        const accountType =
          typeof (item as { accountType?: unknown }).accountType === "string"
            ? (item as { accountType: string }).accountType
            : "paper";
        return { ...item, accountType: accountType === "verified" ? "verified" : "paper" };
      })
    );
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
    const purchasedAt = parsePurchasedAt(req.body?.purchasedAt ?? req.body?.purchaseDate);

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      return res.status(400).json({ error: 'Shares must be a positive number' });
    }
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
      return res.status(400).json({ error: 'Buy price must be a positive number' });
    }
    if (req.body?.purchasedAt != null && req.body.purchasedAt !== '' && !purchasedAt) {
      return res.status(400).json({ error: 'Purchase date must be a valid past or today date' });
    }

    const existingLots = await findPaperLots(req.user!.id, symbol);
    if (existingLots.length > 0) {
      const combined = aggregateLots([
        ...existingLots,
        {
          id: 'incoming',
          shares,
          buyPrice,
          purchasedAt: purchasedAt ?? null,
        },
      ]);
      const keeper = existingLots[0];
      const extraIds = existingLots.slice(1).map((lot) => lot.id);
      const item = await saveAggregatedLot(
        keeper.id,
        combined.shares,
        combined.avgCost,
        combined.purchasedAt
      );
      if (extraIds.length > 0) {
        await prisma.portfolioItem.deleteMany({
          where: { id: { in: extraIds }, userId: req.user!.id },
        });
      }
      return res.status(200).json({ ...item, accountType: 'paper' });
    }

    const base = {
      userId: req.user!.id,
      symbol,
      shares,
      buyPrice,
      // Manual POST is always paper. Verified lots can only come from brokerage sync.
      accountType: "paper",
    };

    try {
      const item = await prisma.portfolioItem.create({
        data: purchasedAt ? { ...base, purchasedAt } : base,
      });
      return res.status(201).json(item);
    } catch (createError) {
      // Older Prisma clients / DBs may not have purchasedAt / accountType yet — still save the holding.
      const legacy = { userId: req.user!.id, symbol, shares, buyPrice };
      try {
        const item = await prisma.portfolioItem.create({
          data: purchasedAt ? { ...legacy, purchasedAt } : legacy,
        });
        return res.status(201).json({ ...item, accountType: "paper" });
      } catch {
        if (purchasedAt) {
          const item = await prisma.portfolioItem.create({ data: legacy });
          return res.status(201).json({
            ...item,
            purchasedAt: purchasedAt.toISOString(),
            accountType: "paper",
          });
        }
        throw createError;
      }
    }
  } catch (error) {
    console.error('Portfolio create error:', error);
    return res.status(500).json({ error: 'Failed to add portfolio item' });
  }
});

const SHARE_EPS = 1e-8;

function roundShares(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function itemAccountType(item: { accountType?: unknown }): 'paper' | 'verified' {
  return item.accountType === 'verified' ? 'verified' : 'paper';
}

/** Reduce a paper lot. Remaining shares keep the existing average cost; 0 shares deletes the row. */
router.post('/:id/sell', async (req: AuthedRequest, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const shares = Number(req.body?.shares ?? req.body?.quantity);
    const sellPrice = Number(req.body?.sellPrice ?? req.body?.price ?? req.body?.avgCost);

    if (!id) {
      return res.status(400).json({ error: 'Item id is required' });
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      return res.status(400).json({ error: 'Shares sold must be a positive number' });
    }
    if (!Number.isFinite(sellPrice) || sellPrice <= 0) {
      return res.status(400).json({ error: 'Sell price must be a positive number' });
    }

    const existing = await prisma.portfolioItem.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Portfolio item not found' });
    }
    if (itemAccountType(existing) === 'verified') {
      return res.status(400).json({ error: 'Verified brokerage lots cannot be sold from paper trading' });
    }

    const owned = Number(existing.shares);
    if (!Number.isFinite(owned) || owned <= 0) {
      return res.status(400).json({ error: 'No shares available to sell' });
    }
    if (shares > owned + SHARE_EPS) {
      return res.status(400).json({ error: `Cannot sell more than ${owned} shares` });
    }

    const remaining = roundShares(owned - shares);
    const sharesSold = remaining <= SHARE_EPS ? owned : roundShares(owned - remaining);

    if (remaining <= SHARE_EPS) {
      await prisma.portfolioItem.delete({ where: { id } });
      return res.json({
        ok: true,
        deleted: true,
        id,
        sharesSold,
        sellPrice,
      });
    }

    const item = await prisma.portfolioItem.update({
      where: { id },
      data: { shares: remaining },
    });
    return res.json({
      ...item,
      accountType: 'paper',
      deleted: false,
      sharesSold,
      sellPrice,
    });
  } catch (error) {
    console.error('Portfolio sell error:', error);
    return res.status(500).json({ error: 'Failed to sell portfolio item' });
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
