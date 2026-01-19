import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, Mission, UserMission, Prisma } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Extend Request to include user
interface AuthRequest extends Request {
  user?: {
    userId: string;
    isCreator?: boolean;
  };
}

// ==================== MISSION DEFINITIONS ====================

const DAILY_MISSIONS = [
  { code: 'daily_login', name: 'Iniciar Sesión', description: 'Inicia sesión hoy', icon: '📅', actionType: 'login', targetCount: 1, pointsReward: 5, xpReward: 10, category: 'ENGAGEMENT' },
  { code: 'daily_like', name: 'Dar Like', description: 'Da like a un post', icon: '❤️', actionType: 'like', targetCount: 1, pointsReward: 3, xpReward: 5, category: 'SOCIAL' },
  { code: 'daily_comment', name: 'Comentar', description: 'Comenta en un perfil', icon: '💬', actionType: 'comment', targetCount: 1, pointsReward: 5, xpReward: 10, category: 'SOCIAL' },
  { code: 'daily_visit', name: 'Explorador', description: 'Visita 3 perfiles', icon: '👀', actionType: 'visit', targetCount: 3, pointsReward: 5, xpReward: 10, category: 'DISCOVERY' },
  { code: 'daily_favorite', name: 'Favorito del Día', description: 'Añade un creador a favoritos', icon: '⭐', actionType: 'favorite', targetCount: 1, pointsReward: 5, xpReward: 8, category: 'DISCOVERY' },
];

const WEEKLY_MISSIONS = [
  { code: 'weekly_streak', name: 'Racha Semanal', description: 'Inicia sesión 5 días seguidos', icon: '🔥', actionType: 'login', targetCount: 5, pointsReward: 25, xpReward: 50, category: 'ENGAGEMENT' },
  { code: 'weekly_tips', name: 'Generoso', description: 'Envía 3 propinas', icon: '💰', actionType: 'tip', targetCount: 3, pointsReward: 30, xpReward: 60, category: 'TIPPING' },
  { code: 'weekly_social', name: 'Social', description: 'Deja 5 comentarios', icon: '🗣️', actionType: 'comment', targetCount: 5, pointsReward: 25, xpReward: 50, category: 'SOCIAL' },
  { code: 'weekly_likes', name: 'Fan Activo', description: 'Da 10 likes', icon: '💕', actionType: 'like', targetCount: 10, pointsReward: 20, xpReward: 40, category: 'SOCIAL' },
  { code: 'weekly_explorer', name: 'Explorador Premium', description: 'Visita 10 perfiles diferentes', icon: '🌎', actionType: 'visit', targetCount: 10, pointsReward: 20, xpReward: 40, category: 'DISCOVERY' },
];

// ==================== SEED MISSIONS (run once) ====================

async function ensureMissionsSeeded() {
  const existingCount = await prisma.mission.count();
  if (existingCount > 0) return;

  // Seed daily missions
  for (const mission of DAILY_MISSIONS) {
    await prisma.mission.create({
      data: {
        ...mission,
        type: 'DAILY',
        category: mission.category as any,
      }
    });
  }

  // Seed weekly missions
  for (const mission of WEEKLY_MISSIONS) {
    await prisma.mission.create({
      data: {
        ...mission,
        type: 'WEEKLY',
        category: mission.category as any,
      }
    });
  }

  console.log('✅ Missions seeded successfully');
}

// Call on startup
ensureMissionsSeeded().catch(console.error);

// ==================== HELPER FUNCTIONS ====================

function getStartOfDay(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function getEndOfDay(): Date {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

function getStartOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday start
  const start = new Date(now.setDate(diff));
  start.setHours(0, 0, 0, 0);
  return start;
}

function getEndOfWeek(): Date {
  const start = getStartOfWeek();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

async function assignDailyMissions(userId: string) {
  const startOfDay = getStartOfDay();
  const endOfDay = getEndOfDay();

  // Check if user already has daily missions for today
  const existingDaily = await prisma.userMission.findFirst({
    where: {
      userId,
      assignedAt: { gte: startOfDay, lte: endOfDay },
      mission: { type: 'DAILY' }
    }
  });

  if (existingDaily) return; // Already assigned

  // Get 3 random daily missions
  const allDaily = await prisma.mission.findMany({
    where: { type: 'DAILY', isActive: true }
  });

  const shuffled = allDaily.sort(() => Math.random() - 0.5);
  const selectedMissions = shuffled.slice(0, 3);

  // Assign missions
  for (const mission of selectedMissions) {
    await prisma.userMission.create({
      data: {
        userId,
        missionId: mission.id,
        expiresAt: endOfDay,
        assignedAt: new Date()
      }
    });
  }
}

async function assignWeeklyMissions(userId: string) {
  const startOfWeek = getStartOfWeek();
  const endOfWeek = getEndOfWeek();

  // Check if user already has weekly missions for this week
  const existingWeekly = await prisma.userMission.findFirst({
    where: {
      userId,
      assignedAt: { gte: startOfWeek, lte: endOfWeek },
      mission: { type: 'WEEKLY' }
    }
  });

  if (existingWeekly) return; // Already assigned

  // Get 2 random weekly missions
  const allWeekly = await prisma.mission.findMany({
    where: { type: 'WEEKLY', isActive: true }
  });

  const shuffled = allWeekly.sort(() => Math.random() - 0.5);
  const selectedMissions = shuffled.slice(0, 2);

  // Assign missions
  for (const mission of selectedMissions) {
    await prisma.userMission.create({
      data: {
        userId,
        missionId: mission.id,
        expiresAt: endOfWeek,
        assignedAt: new Date()
      }
    });
  }
}

// Define type for userMission with mission included
type UserMissionWithMission = UserMission & { mission: Mission };

// ==================== ROUTES ====================

// GET /api/missions - Get user's current missions
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();

    // Ensure missions are assigned
    await assignDailyMissions(userId);
    await assignWeeklyMissions(userId);

    // Get current missions (not expired)
    const userMissions = await prisma.userMission.findMany({
      where: {
        userId,
        expiresAt: { gt: now }
      },
      include: {
        mission: true
      },
      orderBy: [
        { mission: { type: 'asc' } }, // DAILY before WEEKLY
        { completed: 'asc' }
      ]
    });

    // Format response
    const daily = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'DAILY')
      .map((um: UserMissionWithMission) => ({
        id: um.id,
        missionId: um.mission.id,
        code: um.mission.code,
        name: um.mission.name,
        description: um.mission.description,
        icon: um.mission.icon,
        type: um.mission.type,
        category: um.mission.category,
        actionType: um.mission.actionType,
        targetCount: um.mission.targetCount,
        progress: um.progress,
        completed: um.completed,
        claimed: um.claimed,
        pointsReward: um.mission.pointsReward,
        xpReward: um.mission.xpReward,
        expiresAt: um.expiresAt
      }));

    const weekly = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'WEEKLY')
      .map((um: UserMissionWithMission) => ({
        id: um.id,
        missionId: um.mission.id,
        code: um.mission.code,
        name: um.mission.name,
        description: um.mission.description,
        icon: um.mission.icon,
        type: um.mission.type,
        category: um.mission.category,
        actionType: um.mission.actionType,
        targetCount: um.mission.targetCount,
        progress: um.progress,
        completed: um.completed,
        claimed: um.claimed,
        pointsReward: um.mission.pointsReward,
        xpReward: um.mission.xpReward,
        expiresAt: um.expiresAt
      }));

    res.json({
      daily,
      weekly,
      summary: {
        dailyCompleted: daily.filter((m: { completed: boolean }) => m.completed).length,
        dailyTotal: daily.length,
        weeklyCompleted: weekly.filter((m: { completed: boolean }) => m.completed).length,
        weeklyTotal: weekly.length,
        unclaimedRewards: userMissions.filter((um: UserMissionWithMission) => um.completed && !um.claimed).length
      }
    });
  } catch (error) {
    console.error('Error getting missions:', error);
    res.status(500).json({ error: 'Error getting missions' });
  }
});

// POST /api/missions/:userMissionId/claim - Claim mission reward
router.post('/:userMissionId/claim', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { userMissionId } = req.params;

    const userMission = await prisma.userMission.findFirst({
      where: {
        id: userMissionId,
        userId,
        completed: true,
        claimed: false
      },
      include: { mission: true }
    });

    if (!userMission) {
      return res.status(404).json({ error: 'Mission not found or already claimed' });
    }

    // Get or create user points
    let userPoints = await prisma.userPoints.findUnique({
      where: { userId }
    });

    if (!userPoints) {
      userPoints = await prisma.userPoints.create({
        data: { userId }
      });
    }

    // Award points and XP
    const pointsReward = userMission.mission.pointsReward;
    const xpReward = userMission.mission.xpReward;

    await prisma.userPoints.update({
      where: { userId },
      data: {
        points: { increment: pointsReward },
        totalEarned: { increment: pointsReward },
        xp: { increment: xpReward }
      }
    });

    // Mark as claimed
    await prisma.userMission.update({
      where: { id: userMissionId },
      data: { claimed: true }
    });

    // Log the reward
    await prisma.pointsHistory.create({
      data: {
        userPointsId: userPoints.id,
        amount: pointsReward,
        reason: `mission_${userMission.mission.code}`
      }
    });

    res.json({
      success: true,
      reward: {
        points: pointsReward,
        xp: xpReward
      },
      message: `¡Ganaste ${pointsReward} puntos y ${xpReward} XP!`
    });
  } catch (error) {
    console.error('Error claiming mission:', error);
    res.status(500).json({ error: 'Error claiming mission' });
  }
});

// POST /api/missions/track - Track mission progress (internal use)
router.post('/track', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { actionType, count = 1 } = req.body;

    if (!actionType) {
      return res.status(400).json({ error: 'actionType is required' });
    }

    const now = new Date();

    // Find user's active missions matching this action
    const userMissions = await prisma.userMission.findMany({
      where: {
        userId,
        completed: false,
        expiresAt: { gt: now },
        mission: {
          actionType,
          isActive: true
        }
      },
      include: { mission: true }
    });

    const completedMissions: string[] = [];

    for (const um of userMissions) {
      const newProgress = Math.min(um.progress + count, um.mission.targetCount);
      const completed = newProgress >= um.mission.targetCount;

      await prisma.userMission.update({
        where: { id: um.id },
        data: {
          progress: newProgress,
          completed,
          completedAt: completed ? new Date() : null
        }
      });

      if (completed) {
        completedMissions.push(um.mission.name);
      }
    }

    res.json({
      success: true,
      missionsUpdated: userMissions.length,
      completedMissions
    });
  } catch (error) {
    console.error('Error tracking mission:', error);
    res.status(500).json({ error: 'Error tracking mission' });
  }
});

export default router;
