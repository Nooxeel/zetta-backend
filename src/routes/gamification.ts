import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, getUserId, getUser } from '../middleware/auth';
import { 
  checkAndAwardBadges as checkAchievements, 
  getUserLevelPerks,
  seedBadges,
  seedLevelsWithPerks 
} from '../services/achievementService';

const router = Router();
const prisma = new PrismaClient();

// ==================== INITIALIZE ON STARTUP ====================

// Seed badges and levels with perks
async function initializeGamification() {
  try {
    await seedBadges();
    await seedLevelsWithPerks();
  } catch (error) {
    console.error('Error initializing gamification:', error);
  }
}

initializeGamification();

// ==================== BADGE CHECKING (uses achievementService) ====================

// Wrapper to use the new achievement service
async function checkAndAwardBadges(userId: string): Promise<string[]> {
  try {
    return await checkAchievements(userId);
  } catch (error) {
    console.error('Error checking badges:', error);
    return [];
  }
}

// Calculate user level from XP
async function calculateLevel(xp: number): Promise<{ level: number; name: string; icon: string; color: string; nextLevel: { level: number; name: string; xpNeeded: number } | null }> {
  const levels = await prisma.fanLevel.findMany({ orderBy: { level: 'asc' } });
  
  // If no levels exist in DB, return default level
  if (levels.length === 0) {
    return {
      level: 1,
      name: 'Novato',
      icon: '🌱',
      color: '#10b981',
      nextLevel: null,
    };
  }
  
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
    const userId = getUserId(req);

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
    const userId = getUserId(req);

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

    // Calculate progress within current level
    let progress = null;
    if (levelInfo.nextLevel) {
      const levels = await prisma.fanLevel.findMany({ orderBy: { level: 'asc' } });
      const currentLevelMinXp = levels.find(l => l.level === levelInfo.level)?.minXp || 0;
      const nextLevelMinXp = levels.find(l => l.level === levelInfo.nextLevel!.level)?.minXp || currentLevelMinXp + 100;
      
      const xpInCurrentLevel = userPoints.xp - currentLevelMinXp;
      const xpNeededForLevel = nextLevelMinXp - currentLevelMinXp;
      
      progress = {
        current: xpInCurrentLevel,
        needed: xpNeededForLevel,
        percentage: Math.round((xpInCurrentLevel / xpNeededForLevel) * 100),
      };
    }

    res.json({
      currentXp: userPoints.xp,
      level: levelInfo.level,
      levelName: levelInfo.name,
      levelIcon: levelInfo.icon,
      levelColor: levelInfo.color,
      perks: currentLevelData?.perks || [],
      discountPercent: currentLevelData?.discountPercent || 0,
      bonusXpPercent: currentLevelData?.bonusXpPercent || 0,
      canAccessBeta: currentLevelData?.canAccessBeta || false,
      prioritySupport: currentLevelData?.prioritySupport || false,
      nextLevel: levelInfo.nextLevel,
      progress,
    });
  } catch (error) {
    console.error('Error fetching user level:', error);
    res.status(500).json({ error: 'Error al obtener nivel' });
  }
});

// Get user's level perks (for applying discounts, etc.)
router.get('/my-perks', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const perks = await getUserLevelPerks(userId);
    res.json(perks);
  } catch (error) {
    console.error('Error fetching user perks:', error);
    res.status(500).json({ error: 'Error al obtener perks' });
  }
});

// Get all fan levels (with perk details)
router.get('/levels', async (req: Request, res: Response) => {
  try {
    const levels = await prisma.fanLevel.findMany({
      orderBy: { level: 'asc' },
    });

    // Format response with full perk details
    const formattedLevels = levels.map(level => ({
      level: level.level,
      name: level.name,
      minXp: level.minXp,
      icon: level.icon,
      color: level.color,
      perks: level.perks,
      discountPercent: level.discountPercent,
      bonusXpPercent: level.bonusXpPercent,
      canAccessBeta: level.canAccessBeta,
      prioritySupport: level.prioritySupport,
    }));

    res.json({ levels: formattedLevels });
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
    const userId = getUserId(req);
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
    const requestingUser = getUser(req);
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

