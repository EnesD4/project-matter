import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { parseAge, parseBirthDate, parseBool, publicSettings } from '../lib/settings';

const router = Router();

router.use(requireAuth);

router.get('/settings', async (req: AuthedRequest, res: Response) => {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: req.user!.id },
    });
    return res.json({ settings: settings ? publicSettings(settings) : null });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.post('/settings', async (req: AuthedRequest, res: Response) => {
  try {
    const existing = await prisma.userSettings.findUnique({
      where: { userId: req.user!.id },
    });

    const hasActiveInvestments =
      parseBool(req.body?.hasActiveInvestments) ?? existing?.hasActiveInvestments;
    const hasActiveDebts = parseBool(req.body?.hasActiveDebts) ?? existing?.hasActiveDebts;
    const wantsCapitalGrowth =
      parseBool(req.body?.wantsCapitalGrowth) ?? existing?.wantsCapitalGrowth;
    const wantsFinancialLiteracy =
      parseBool(req.body?.wantsFinancialLiteracy) ?? existing?.wantsFinancialLiteracy;
    const hasCompletedOnboarding =
      parseBool(req.body?.hasCompletedOnboarding) ?? existing?.hasCompletedOnboarding;

    if (
      hasActiveInvestments === undefined ||
      hasActiveDebts === undefined ||
      wantsCapitalGrowth === undefined ||
      wantsFinancialLiteracy === undefined ||
      hasCompletedOnboarding === undefined
    ) {
      return res.status(400).json({
        error:
          'hasActiveInvestments, hasActiveDebts, wantsCapitalGrowth, wantsFinancialLiteracy, and hasCompletedOnboarding are required',
      });
    }

    const ageIn = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'age')
      ? parseAge(req.body.age)
      : undefined;
    const birthDateIn = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'birthDate')
      ? parseBirthDate(req.body.birthDate)
      : undefined;

    if (ageIn === undefined && Object.prototype.hasOwnProperty.call(req.body ?? {}, 'age')) {
      return res.status(400).json({ error: 'age must be a number between 13 and 100' });
    }
    if (
      birthDateIn === undefined &&
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'birthDate')
    ) {
      return res.status(400).json({ error: 'birthDate must be YYYY-MM-DD' });
    }

    const data = {
      hasActiveInvestments,
      hasActiveDebts,
      wantsCapitalGrowth,
      wantsFinancialLiteracy,
      hasCompletedOnboarding,
      investmentGoal: wantsCapitalGrowth ? 'growth' : 'preservation',
      experienceLevel: wantsFinancialLiteracy ? 'beginner' : 'experienced',
      age: ageIn === undefined ? existing?.age ?? null : ageIn,
      birthDate: birthDateIn === undefined ? existing?.birthDate ?? null : birthDateIn,
    };

    const settings = await prisma.userSettings.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        ...data,
      },
      update: data,
    });

    return res.json({ settings: publicSettings(settings) });
  } catch (error) {
    console.error('Save settings error:', error);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

export default router;
