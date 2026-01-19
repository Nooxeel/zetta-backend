import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ==================== BADGE CHECKING LOGIC ====================

interface BadgeCheckResult {
  earned: boolean;
  badgeCode: string;
}

// Check all badges for a user and award any earned ones
async function checkAndAwardBadges(userId: string): Promise<string[]> {
  const newBadges: string[] = [];

  // Get user data for checking
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userPoints: true,
      donationsSent: true,
      favorites: true,
      subscriptions: { where: { status: 'active' } },
      comments: { where: { isApproved: true } },
    },
  });

  if (!user) return newBadges;

  // Get already earned badges
  const earnedBadges = await prisma.userBadge.findMany({
    where: { userId },
    select: { badgeId: true, badge: { select: { code: true } } },
  });
  const earnedCodes = new Set(earnedBadges.map((b) => b.badge.code));

  // All badge checks
  const checks: BadgeCheckResult[] = [];

  // TIPPING checks
  const totalDonations = user.donationsSent.length;
  const uniqueCreators = new Set(user.donationsSent.map((d) => d.toCreatorId)).size;
  const totalTipped = user.donationsSent.reduce((sum, d) => sum + d.amount, 0);

  if (totalDonations >= 1) checks.push({ earned: true, badgeCode: 'first_tip' });
  if (uniqueCreators >= 5) checks.push({ earned: true, badgeCode: 'generous_tipper' });
  if (totalTipped >= 100) checks.push({ earned: true, badgeCode: 'big_spender' });
  if (totalTipped >= 500) checks.push({ earned: true, badgeCode: 'whale' });

  // STREAK checks
  const streak = user.userPoints?.loginStreak || 0;
  if (streak >= 3) checks.push({ earned: true, badgeCode: 'streak_3' });
  if (streak >= 7) checks.push({ earned: true, badgeCode: 'streak_7' });
  if (streak >= 30) checks.push({ earned: true, badgeCode: 'streak_30' });
  if (streak >= 100) checks.push({ earned: true, badgeCode: 'streak_100' });

  // SOCIAL checks
  if (user.comments.length >= 1) checks.push({ earned: true, badgeCode: 'first_comment' });
  if (user.comments.length >= 10) checks.push({ earned: true, badgeCode: 'commentator' });
  if (user.favorites.length >= 1) checks.push({ earned: true, badgeCode: 'first_favorite' });
  if (user.favorites.length >= 10) checks.push({ earned: true, badgeCode: 'collector' });

  // LOYALTY checks
  if (user.subscriptions.length >= 1) checks.push({ earned: true, badgeCode: 'first_sub' });
  if (user.subscriptions.length >= 5) checks.push({ earned: true, badgeCode: 'super_supporter' });

  // MILESTONE checks
  const totalPoints = user.userPoints?.totalEarned || 0;
  if (totalPoints >= 100) checks.push({ earned: true, badgeCode: 'points_100' });
  if (totalPoints >= 500) checks.push({ earned: true, badgeCode: 'points_500' });
  if (totalPoints >= 1000) checks.push({ earned: true, badgeCode: 'points_1000' });

  // SPECIAL checks
  if (user.ageVerified && user.emailVerified) checks.push({ earned: true, badgeCode: 'verified_fan' });

  // Award new badges
  for (const check of checks) {
    if (check.earned && !earnedCodes.has(check.badgeCode)) {
      const badge = await prisma.badge.findUnique({ where: { code: check.badgeCode } });
      if (badge) {
        await prisma.userBadge.create({
          data: { userId, badgeId: badge.id },
        });

        // Award bonus points
        if (badge.pointsReward > 0 && user.userPoints) {
          await prisma.userPoints.update({
            where: { id: user.userPoints.id },
            data: {
              points: { increment: badge.pointsReward },
              totalEarned: { increment: badge.pointsReward },
              xp: { increment: badge.pointsReward },
            },
          });

          await prisma.pointsHistory.create({
            data: {
              userPointsId: user.userPoints.id,
              amount: badge.pointsReward,
              reason: `badge_earned:${badge.code}`,
            },
          });
        }

        newBadges.push(badge.code);
      }
    }
  }

  return newBadges;
}

// Calculate user level from XP
async function calculateLevel(xp: number): Promise<{ level: number; name: string; icon: string; color: string; nextLevel: { level: number; name: string; xpNeeded: number } | null }> {
  const levels = await prisma.fanLevel.findMany({ orderBy: { level: 'asc' } });
  
  let currentLevel = levels[0];
  let nextLevel = levels[1] || null;

  for (let i = 0; i < levels.length; i++) {
    if (xp >= levels[i].minXp) {
      currentLevel = levels[i];
      nextLevel = levels[i + 1] || null;
    }
  }

  return {
    level: currentLevel.level,
    name: currentLevel.name,
    icon: currentLevel.icon,
    color: currentLevel.color,
    nextLevel: nextLevel ? {
      level: nextLevel.level,
      name: nextLevel.name,
      xpNeeded: nextLevel.minXp - xp,
    } : null,
  };
}

// ==================== ENDPOINTS ====================

// Get all available badges
router.get('/badges', async (req: Request, res: Response) => {
  try {
    const badges = await prisma.badge.findMany({
      orderBy: [{ category: 'asc' }, { rarity: 'asc' }],
    });

    res.json({ badges });
  } catch (error) {
    console.error('Error fetching badges:', error);
    res.status(500).json({ error: 'Error al obtener badges' });
  }
});

// Get user's badges
router.get('/my-badges', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    // Check for new badges first
    const newBadges = await checkAndAwardBadges(userId);

    // Get all badges with earned status
    const allBadges = await prisma.badge.findMany({
      orderBy: [{ category: 'asc' }, { rarity: 'asc' }],
    });

    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
    });

    const earnedBadgeIds = new Set(userBadges.map((ub) => ub.badgeId));

    const badgesWithStatus = allBadges.map((badge) => {
      const userBadge = userBadges.find((ub) => ub.badgeId === badge.id);
      return {
        ...badge,
        earned: earnedBadgeIds.has(badge.id),
        earnedAt: userBadge?.earnedAt || null,
      };
    });

    // Group by category
    const byCategory = badgesWithStatus.reduce((acc, badge) => {
      if (!acc[badge.category]) acc[badge.category] = [];
      acc[badge.category].push(badge);
      return acc;
    }, {} as Record<string, typeof badgesWithStatus>);

    const stats = {
      total: allBadges.length,
      earned: userBadges.length,
      percentage: Math.round((userBadges.length / allBadges.length) * 100),
    };

    res.json({
      badges: badgesWithStatus,
      byCategory,
      stats,
      newBadges, // Badges just earned in this request
    });
  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({ error: 'Error al obtener badges' });
  }
});

// Get user's level info
router.get('/my-level', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    let userPoints = await prisma.userPoints.findUnique({
      where: { userId },
    });

    // Create if not exists
    if (!userPoints) {
      userPoints = await prisma.userPoints.create({
        data: { userId },
      });
    }

    const levelInfo = await calculateLevel(userPoints.xp);

    // Update user level if changed
    if (levelInfo.level !== userPoints.level) {
      await prisma.userPoints.update({
        where: { id: userPoints.id },
        data: { level: levelInfo.level },
      });
    }

    // Get level perks
    const currentLevelData = await prisma.fanLevel.findUnique({
      where: { level: levelInfo.level },
    });

    res.json({
      currentXp: userPoints.xp,
      level: levelInfo.level,
      levelName: levelInfo.name,
      levelIcon: levelInfo.icon,
      levelColor: levelInfo.color,
      perks: currentLevelData?.perks || [],
      nextLevel: levelInfo.nextLevel,
      progress: levelInfo.nextLevel
        ? {
            current: userPoints.xp,
            needed: levelInfo.nextLevel.xpNeeded + userPoints.xp,
            percentage: Math.round(
              (userPoints.xp / (levelInfo.nextLevel.xpNeeded + userPoints.xp)) * 100
            ),
          }
        : null,
    });
  } catch (error) {
    console.error('Error fetching user level:', error);
    res.status(500).json({ error: 'Error al obtener nivel' });
  }
});

// Get all fan levels
router.get('/levels', async (req: Request, res: Response) => {
  try {
    const levels = await prisma.fanLevel.findMany({
      orderBy: { level: 'asc' },
    });

    res.json({ levels });
  } catch (error) {
    console.error('Error fetching levels:', error);
    res.status(500).json({ error: 'Error al obtener niveles' });
  }
});

// Get public badge showcase for a user
router.get('/user/:userId/badges', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
      take: 10, // Show top 10 badges
    });

    const userPoints = await prisma.userPoints.findUnique({
      where: { userId },
    });

    const levelInfo = userPoints ? await calculateLevel(userPoints.xp) : null;

    // Calculate progress for the public endpoint
    let progress = null;
    if (levelInfo && levelInfo.nextLevel) {
      const levels = await prisma.fanLevel.findMany({ orderBy: { level: 'asc' } });
      const currentLevelData = levels.find(l => l.level === levelInfo.level);
      const nextLevelData = levels.find(l => l.level === levelInfo.nextLevel!.level);
      
      if (currentLevelData && nextLevelData && userPoints) {
        const xpInCurrentLevel = userPoints.xp - currentLevelData.minXp;
        const xpNeededForNext = nextLevelData.minXp - currentLevelData.minXp;
        progress = {
          current: xpInCurrentLevel,
          needed: xpNeededForNext,
          percentage: Math.min(100, Math.round((xpInCurrentLevel / xpNeededForNext) * 100)),
        };
      }
    }

    res.json({
      badges: userBadges.map((ub) => ({
        code: ub.badge.code,
        name: ub.badge.name,
        icon: ub.badge.icon,
        rarity: ub.badge.rarity,
        earnedAt: ub.earnedAt,
      })),
      level: levelInfo ? {
        level: levelInfo.level,
        name: levelInfo.name,
        icon: levelInfo.icon,
        color: levelInfo.color,
      } : null,
      progress,
      totalBadges: userBadges.length,
    });
  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({ error: 'Error al obtener badges' });
  }
});

// Force check badges (useful after actions)
router.post('/check-badges', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const newBadges = await checkAndAwardBadges(userId);

    if (newBadges.length > 0) {
      const badges = await prisma.badge.findMany({
        where: { code: { in: newBadges } },
      });

      res.json({
        newBadges: badges.map((b) => ({
          code: b.code,
          name: b.name,
          icon: b.icon,
          rarity: b.rarity,
          pointsReward: b.pointsReward,
        })),
      });
    } else {
      res.json({ newBadges: [] });
    }
  } catch (error) {
    console.error('Error checking badges:', error);
    res.status(500).json({ error: 'Error al verificar badges' });
  }
});

// Award special badge (admin only - for manual awards)
router.post('/award/:userId/:badgeCode', authenticate, async (req: Request, res: Response) => {
  try {
    const requestingUser = (req as any).user;
    const { userId, badgeCode } = req.params;

    // TODO: Add admin check
    // For now, only allow awarding special badges

    const badge = await prisma.badge.findUnique({ where: { code: badgeCode } });
    if (!badge) {
      return res.status(404).json({ error: 'Badge no encontrado' });
    }

    // Check if already earned
    const existing = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
    });

    if (existing) {
      return res.status(400).json({ error: 'Usuario ya tiene este badge' });
    }

    await prisma.userBadge.create({
      data: { userId, badgeId: badge.id },
    });

    res.json({ success: true, badge: { code: badge.code, name: badge.name } });
  } catch (error) {
    console.error('Error awarding badge:', error);
    res.status(500).json({ error: 'Error al otorgar badge' });
  }
});

export default router;

// Export helper functions for use in other routes
export { checkAndAwardBadges, calculateLevel };
