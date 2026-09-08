import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import type { User, UserSettings } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthedRequest, requireAuth, signToken } from '../middleware/auth';
import { publicSettings } from '../lib/settings';
import { verifyGoogleCredential } from '../lib/google';

const router = Router();

type UserWithSettings = User & { settings: UserSettings | null };

function publicUser(user: UserWithSettings) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    hasCompletedOnboarding: user.settings?.hasCompletedOnboarding ?? false,
  };
}

function authResponse(user: UserWithSettings) {
  return {
    token: signToken({ id: user.id, email: user.email, name: user.name }),
    user: publicUser(user),
    settings: user.settings ? publicSettings(user.settings) : null,
  };
}

router.post('/register', async (req, res: Response) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        settings: {
          create: {},
        },
      },
      include: { settings: true },
    });

    return res.status(201).json(authResponse(user));
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Failed to register' });
  }
});

router.post('/login', async (req, res: Response) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { settings: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.password) {
      return res.status(401).json({
        error: 'This account uses Google sign-in. Continue with Google instead.',
      });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json(authResponse(user));
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

router.post('/google', async (req, res: Response) => {
  try {
    const credential = String(
      req.body?.credential || req.body?.token || req.body?.idToken || ''
    ).trim();

    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    let profile;
    try {
      profile = await verifyGoogleCredential(credential);
    } catch (error) {
      console.error('Google token verification failed:', error);
      return res.status(401).json({ error: 'Invalid Google credential' });
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: profile.sub }, { email: profile.email }],
      },
      include: { settings: true },
    });

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            googleId: profile.sub,
            avatarUrl: profile.picture || existing.avatarUrl,
            name: existing.name?.trim() ? existing.name : profile.name,
          },
          include: { settings: true },
        })
      : await prisma.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.picture,
            googleId: profile.sub,
            settings: {
              create: {
                hasCompletedOnboarding: false,
              },
            },
          },
          include: { settings: true },
        });

    if (!user.settings) {
      const settings = await prisma.userSettings.create({
        data: {
          userId: user.id,
          hasCompletedOnboarding: false,
        },
      });
      return res.json(authResponse({ ...user, settings }));
    }

    return res.json(authResponse(user));
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ error: 'Failed to sign in with Google' });
  }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { settings: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({
      user: publicUser(user),
      settings: user.settings ? publicSettings(user.settings) : null,
    });
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ error: 'Failed to load user' });
  }
});

export default router;
