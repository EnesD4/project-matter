import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

const MAX_ITEMS = 200;
const MAX_ID_LEN = 64;
const MAX_LABEL_LEN = 80;

type ExpenseItem = { id: string; label: string; amount: number };
type DebtItem = {
  id: string;
  title: string;
  originalBalance: number;
  balance: number;
  minPayment: number;
  apr: number;
};

type SafetyNetBond = {
  id: string;
  label: string;
  kind: 'amount' | 'ticker';
  amount: number;
  symbol: string;
  shares: number;
};

type SafetyNetConfig = {
  portfolioPct: number;
  goldAmount: number;
  goldUnit: 'oz' | 'g';
  bonds: SafetyNetBond[];
  hysaCash: number;
};

const MAX_BONDS = 50;
const MAX_SYMBOL_LEN = 16;

function asMoney(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function asId(value: unknown): string {
  return String(value || '')
    .trim()
    .slice(0, MAX_ID_LEN);
}

function asLabel(value: unknown, fallback = ''): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LABEL_LEN) || fallback;
}

function asJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseExpenses(raw: unknown): ExpenseItem[] {
  const items: ExpenseItem[] = [];
  for (const row of asJsonArray(raw)) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const id = asId(rec.id);
    const label = asLabel(rec.label);
    if (!id || !label) continue;
    items.push({ id, label, amount: asMoney(rec.amount) });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

function parseDebts(raw: unknown): DebtItem[] {
  const items: DebtItem[] = [];
  for (const row of asJsonArray(raw)) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const id = asId(rec.id);
    if (!id) continue;
    const originalBalance = asMoney(rec.originalBalance);
    const balance = asMoney(rec.balance);
    items.push({
      id,
      title: asLabel(rec.title, 'Untitled Debt'),
      originalBalance: originalBalance || balance,
      balance,
      minPayment: asMoney(rec.minPayment),
      apr: asMoney(rec.apr),
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

function asSymbol(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9=.-]/g, '')
    .slice(0, MAX_SYMBOL_LEN);
}

function parseSafetyNetObject(raw: unknown): SafetyNetConfig {
  const rec = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const bonds: SafetyNetBond[] = [];
  const list = rec && Array.isArray(rec.bonds) ? rec.bonds : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const id = asId(item.id);
    if (!id) continue;
    const kind = item.kind === 'ticker' ? 'ticker' : 'amount';
    const symbol = asSymbol(item.symbol);
    bonds.push({
      id,
      label: asLabel(item.label, kind === 'ticker' ? symbol || 'Bond fund' : 'Treasury / bond'),
      kind,
      amount: asMoney(item.amount),
      symbol,
      shares: asMoney(item.shares),
    });
    if (bonds.length >= MAX_BONDS) break;
  }
  return {
    portfolioPct: Math.min(100, asMoney(rec?.portfolioPct)),
    goldAmount: asMoney(rec?.goldAmount),
    goldUnit: rec?.goldUnit === 'g' ? 'g' : 'oz',
    bonds,
    hysaCash: asMoney(rec?.hysaCash),
  };
}

function parseSafetyNet(raw: unknown): SafetyNetConfig {
  if (typeof raw === 'string') {
    try {
      return parseSafetyNetObject(JSON.parse(raw));
    } catch {
      return parseSafetyNetObject(null);
    }
  }
  return parseSafetyNetObject(raw);
}

function publicCashFlow(row: {
  monthlyIncome: number;
  emergencyFund: number;
  extraPayoff: number;
  expenses: unknown;
  debts: unknown;
  safetyNet: unknown;
  updatedAt: Date;
} | null) {
  return {
    monthlyIncome: row?.monthlyIncome ?? 0,
    emergencyFund: row?.emergencyFund ?? 0,
    extraPayoff: row?.extraPayoff ?? 0,
    expenses: parseExpenses(row?.expenses),
    debts: parseDebts(row?.debts),
    safetyNet: parseSafetyNet(row?.safetyNet),
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    const row = await prisma.cashFlow.findUnique({
      where: { userId: req.user!.id },
    });
    return res.json(publicCashFlow(row));
  } catch (error) {
    console.error('Cash flow load error:', error);
    return res.status(500).json({ error: 'Failed to load cash flow' });
  }
});

router.put('/', async (req: AuthedRequest, res: Response) => {
  try {
    const monthlyIncome = asMoney(req.body?.monthlyIncome);
    const emergencyFund = asMoney(req.body?.emergencyFund);
    const extraPayoff = asMoney(req.body?.extraPayoff);
    const expenses = parseExpenses(req.body?.expenses);
    const debts = parseDebts(req.body?.debts);
    const safetyNet = parseSafetyNet(req.body?.safetyNet);
    const expensesJson = JSON.stringify(expenses);
    const debtsJson = JSON.stringify(debts);
    const safetyNetJson = JSON.stringify(safetyNet);

    const row = await prisma.cashFlow.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        monthlyIncome,
        emergencyFund,
        extraPayoff,
        expenses: expensesJson,
        debts: debtsJson,
        safetyNet: safetyNetJson,
      },
      update: {
        monthlyIncome,
        emergencyFund,
        extraPayoff,
        expenses: expensesJson,
        debts: debtsJson,
        safetyNet: safetyNetJson,
      },
    });

    return res.json(publicCashFlow(row));
  } catch (error) {
    console.error('Cash flow save error:', error);
    return res.status(500).json({ error: 'Failed to save cash flow' });
  }
});

export default router;
