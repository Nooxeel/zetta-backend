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

// ========== FAN MISSIONS ==========
const DAILY_MISSIONS = [
  // Engagement
  { code: 'daily_login', name: 'Iniciar Sesión', description: 'Inicia sesión hoy', icon: '📅', actionType: 'login', targetCount: 1, pointsReward: 5, xpReward: 10, category: 'ENGAGEMENT', forCreators: false },
  // Social
  { code: 'daily_like', name: 'Dar Like', description: 'Da like a un post', icon: '❤️', actionType: 'like', targetCount: 1, pointsReward: 3, xpReward: 5, category: 'SOCIAL', forCreators: false },
  { code: 'daily_comment', name: 'Comentar', description: 'Comenta en un perfil', icon: '💬', actionType: 'comment', targetCount: 1, pointsReward: 5, xpReward: 10, category: 'SOCIAL', forCreators: false },
  // Discovery
  { code: 'daily_visit', name: 'Explorador', description: 'Visita 3 perfiles', icon: '👀', actionType: 'visit', targetCount: 3, pointsReward: 5, xpReward: 10, category: 'DISCOVERY', forCreators: false },
  { code: 'daily_favorite', name: 'Favorito del Día', description: 'Añade un creador a favoritos', icon: '⭐', actionType: 'favorite', targetCount: 1, pointsReward: 5, xpReward: 8, category: 'DISCOVERY', forCreators: false },
  // Messaging
  { code: 'daily_message', name: 'Mensajero', description: 'Envía un mensaje', icon: '✉️', actionType: 'message', targetCount: 1, pointsReward: 5, xpReward: 10, category: 'MESSAGING', forCreators: false },
  // Tipping
  { code: 'daily_tip', name: 'Propinador', description: 'Envía una propina', icon: '💸', actionType: 'tip', targetCount: 1, pointsReward: 10, xpReward: 15, category: 'TIPPING', forCreators: false },
  // Spending
  { code: 'daily_subscribe', name: 'Nuevo Fan', description: 'Suscríbete a un creador', icon: '🎟️', actionType: 'subscribe', targetCount: 1, pointsReward: 15, xpReward: 20, category: 'SPENDING', forCreators: false },
  // Fun
  { code: 'daily_ruleta', name: 'Suerte del Día', description: 'Juega la ruleta', icon: '🎰', actionType: 'ruleta', targetCount: 1, pointsReward: 3, xpReward: 5, category: 'ENGAGEMENT', forCreators: false },
  { code: 'daily_share', name: 'Compartidor', description: 'Comparte un perfil', icon: '📤', actionType: 'share', targetCount: 1, pointsReward: 5, xpReward: 10, category: 'SOCIAL', forCreators: false },
];

const WEEKLY_MISSIONS = [
  // Engagement
  { code: 'weekly_streak', name: 'Racha Semanal', description: 'Inicia sesión 5 días seguidos', icon: '🔥', actionType: 'login', targetCount: 5, pointsReward: 25, xpReward: 50, category: 'ENGAGEMENT', forCreators: false },
  // Tipping
  { code: 'weekly_tips', name: 'Generoso', description: 'Envía 3 propinas', icon: '💰', actionType: 'tip', targetCount: 3, pointsReward: 30, xpReward: 60, category: 'TIPPING', forCreators: false },
  // Social
  { code: 'weekly_social', name: 'Social', description: 'Deja 5 comentarios', icon: '🗣️', actionType: 'comment', targetCount: 5, pointsReward: 25, xpReward: 50, category: 'SOCIAL', forCreators: false },
  { code: 'weekly_likes', name: 'Fan Activo', description: 'Da 10 likes', icon: '💕', actionType: 'like', targetCount: 10, pointsReward: 20, xpReward: 40, category: 'SOCIAL', forCreators: false },
  // Discovery
  { code: 'weekly_explorer', name: 'Explorador Premium', description: 'Visita 10 perfiles diferentes', icon: '🌎', actionType: 'visit', targetCount: 10, pointsReward: 20, xpReward: 40, category: 'DISCOVERY', forCreators: false },
  // Messaging
  { code: 'weekly_messages', name: 'Conversador', description: 'Envía 10 mensajes', icon: '💬', actionType: 'message', targetCount: 10, pointsReward: 25, xpReward: 50, category: 'MESSAGING', forCreators: false },
  // Spending
  { code: 'weekly_subscribe', name: 'Coleccionista', description: 'Suscríbete a 2 creadores', icon: '👑', actionType: 'subscribe', targetCount: 2, pointsReward: 40, xpReward: 80, category: 'SPENDING', forCreators: false },
  { code: 'weekly_spend', name: 'Gran Gastador', description: 'Gasta $10+ en propinas', icon: '🤑', actionType: 'spend', targetCount: 10, pointsReward: 50, xpReward: 100, category: 'SPENDING', forCreators: false },
  // Discovery
  { code: 'weekly_profiles', name: 'Curioso', description: 'Mira 20 perfiles', icon: '🔍', actionType: 'visit', targetCount: 20, pointsReward: 20, xpReward: 40, category: 'DISCOVERY', forCreators: false },
];

// ========== CREATOR MISSIONS ==========
const CREATOR_DAILY_MISSIONS = [
  // Content
  { code: 'creator_daily_post', name: 'Publicador', description: 'Publica 1 post', icon: '📸', actionType: 'post', targetCount: 1, pointsReward: 10, xpReward: 15, category: 'CONTENT', forCreators: true },
  { code: 'creator_daily_story', name: 'Historia del Día', description: 'Sube una historia', icon: '📱', actionType: 'story', targetCount: 1, pointsReward: 8, xpReward: 10, category: 'CONTENT', forCreators: true },
  // Engagement
  { code: 'creator_daily_reply', name: 'Respondedor', description: 'Responde 3 mensajes', icon: '💬', actionType: 'reply', targetCount: 3, pointsReward: 10, xpReward: 15, category: 'CREATOR_ENGAGEMENT', forCreators: true },
  { code: 'creator_daily_dm', name: 'Conectar', description: 'Envía un mensaje a un fan', icon: '✉️', actionType: 'dm_fan', targetCount: 1, pointsReward: 5, xpReward: 10, category: 'CREATOR_ENGAGEMENT', forCreators: true },
  // Growth
  { code: 'creator_daily_live', name: 'En Vivo', description: 'Haz un live/stream', icon: '🔴', actionType: 'live', targetCount: 1, pointsReward: 20, xpReward: 30, category: 'CREATOR_GROWTH', forCreators: true },
];

const CREATOR_WEEKLY_MISSIONS = [
  // Content
  { code: 'creator_weekly_posts', name: 'Creador Activo', description: 'Publica 5 posts', icon: '🎨', actionType: 'post', targetCount: 5, pointsReward: 40, xpReward: 60, category: 'CONTENT', forCreators: true },
  { code: 'creator_weekly_video', name: 'Videógrafo', description: 'Sube 2 videos', icon: '🎬', actionType: 'video', targetCount: 2, pointsReward: 30, xpReward: 50, category: 'CONTENT', forCreators: true },
  // Engagement  
  { code: 'creator_weekly_replies', name: 'Atención al Fan', description: 'Responde 20 mensajes', icon: '📨', actionType: 'reply', targetCount: 20, pointsReward: 50, xpReward: 80, category: 'CREATOR_ENGAGEMENT', forCreators: true },
  { code: 'creator_weekly_broadcast', name: 'Comunicador', description: 'Envía un Mass DM', icon: '📢', actionType: 'broadcast', targetCount: 1, pointsReward: 20, xpReward: 30, category: 'CREATOR_ENGAGEMENT', forCreators: true },
  // Growth
  { code: 'creator_weekly_earnings', name: 'Meta de Ingresos', description: 'Gana $50+ esta semana', icon: '💎', actionType: 'earn', targetCount: 50, pointsReward: 75, xpReward: 100, category: 'CREATOR_GROWTH', forCreators: true },
  { code: 'creator_weekly_subs', name: 'Magnetismo', description: 'Consigue 3 nuevos suscriptores', icon: '🧲', actionType: 'new_subscriber', targetCount: 3, pointsReward: 60, xpReward: 80, category: 'CREATOR_GROWTH', forCreators: true },
  { code: 'creator_weekly_tips', name: 'Propinero', description: 'Recibe 5 propinas', icon: '💵', actionType: 'receive_tip', targetCount: 5, pointsReward: 40, xpReward: 60, category: 'CREATOR_GROWTH', forCreators: true },
];

// ==================== SEED MISSIONS (run once) ====================

async function ensureMissionsSeeded() {
  // Check if we need to add new missions (version check)
  const missionCount = await prisma.mission.count();
  const expectedCount = DAILY_MISSIONS.length + WEEKLY_MISSIONS.length + 
                        CREATOR_DAILY_MISSIONS.length + CREATOR_WEEKLY_MISSIONS.length;
  
  // If we have fewer missions than expected, seed missing ones
  if (missionCount < expectedCount) {
    console.log(`📋 Seeding missions... (current: ${missionCount}, expected: ${expectedCount})`);
    
    // Get existing mission codes
    const existingMissions = await prisma.mission.findMany({ select: { code: true } });
    const existingCodes = new Set(existingMissions.map(m => m.code));
    
    // Seed fan daily missions
    for (const mission of DAILY_MISSIONS) {
      if (!existingCodes.has(mission.code)) {
        await prisma.mission.create({
          data: { ...mission, type: 'DAILY', category: mission.category as any }
        });
        console.log(`  ✅ Added: ${mission.code}`);
      }
    }
    
    // Seed fan weekly missions
    for (const mission of WEEKLY_MISSIONS) {
      if (!existingCodes.has(mission.code)) {
        await prisma.mission.create({
          data: { ...mission, type: 'WEEKLY', category: mission.category as any }
        });
        console.log(`  ✅ Added: ${mission.code}`);
      }
    }
    
    // Seed creator daily missions
    for (const mission of CREATOR_DAILY_MISSIONS) {
      if (!existingCodes.has(mission.code)) {
        await prisma.mission.create({
          data: { ...mission, type: 'DAILY', category: mission.category as any }
        });
        console.log(`  ✅ Added: ${mission.code}`);
      }
    }
    
    // Seed creator weekly missions
    for (const mission of CREATOR_WEEKLY_MISSIONS) {
      if (!existingCodes.has(mission.code)) {
        await prisma.mission.create({
          data: { ...mission, type: 'WEEKLY', category: mission.category as any }
        });
        console.log(`  ✅ Added: ${mission.code}`);
      }
    }
    
    console.log('✅ Missions seeded successfully');
  }
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

async function assignDailyMissions(userId: string, isCreator: boolean = false) {
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

  // Get random daily missions based on user type
  // Fans get 3 fan missions, Creators get 3 fan + 2 creator missions
  const fanMissions = await prisma.mission.findMany({
    where: { type: 'DAILY', isActive: true, forCreators: false }
  });

  // Ensure login mission is always included
  const loginMission = fanMissions.find(m => m.code === 'daily_login');
  const otherMissions = fanMissions.filter(m => m.code !== 'daily_login');
  
  const shuffledFan = otherMissions.sort(() => Math.random() - 0.5);
  const selectedMissions: typeof fanMissions = [];
  
  // Always add login mission first
  if (loginMission) {
    selectedMissions.push(loginMission);
  }
  
  // Add 2 more random missions (or 3 if no login mission found)
  const remainingSlots = loginMission ? 2 : 3;
  selectedMissions.push(...shuffledFan.slice(0, remainingSlots));

  // If user is a creator, also give them creator missions
  if (isCreator) {
    const creatorMissions = await prisma.mission.findMany({
      where: { type: 'DAILY', isActive: true, forCreators: true }
    });
    const shuffledCreator = creatorMissions.sort(() => Math.random() - 0.5);
    selectedMissions.push(...shuffledCreator.slice(0, 2));
  }

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

async function assignWeeklyMissions(userId: string, isCreator: boolean = false) {
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

  // Get random weekly missions based on user type
  // Fans get 2 fan missions, Creators get 2 fan + 2 creator missions
  const fanMissions = await prisma.mission.findMany({
    where: { type: 'WEEKLY', isActive: true, forCreators: false }
  });

  const shuffledFan = fanMissions.sort(() => Math.random() - 0.5);
  const selectedMissions = shuffledFan.slice(0, 2);

  // If user is a creator, also give them creator missions
  if (isCreator) {
    const creatorMissions = await prisma.mission.findMany({
      where: { type: 'WEEKLY', isActive: true, forCreators: true }
    });
    const shuffledCreator = creatorMissions.sort(() => Math.random() - 0.5);
    selectedMissions.push(...shuffledCreator.slice(0, 2));
  }

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
    const isCreator = req.user?.isCreator || false;
    const now = new Date();

    // Ensure missions are assigned (creators get extra missions)
    await assignDailyMissions(userId, isCreator);
    await assignWeeklyMissions(userId, isCreator);

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

    // Format response - separate fan and creator missions
    const formatMission = (um: UserMissionWithMission) => ({
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
      expiresAt: um.expiresAt,
      forCreators: um.mission.forCreators
    });

    const daily = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'DAILY' && !um.mission.forCreators)
      .map(formatMission);

    const weekly = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'WEEKLY' && !um.mission.forCreators)
      .map(formatMission);

    // Creator-specific missions
    const creatorDaily = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'DAILY' && um.mission.forCreators)
      .map(formatMission);

    const creatorWeekly = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'WEEKLY' && um.mission.forCreators)
      .map(formatMission);

    res.json({
      daily,
      weekly,
      creatorDaily,
      creatorWeekly,
      summary: {
        dailyCompleted: daily.filter((m: { completed: boolean }) => m.completed).length,
        dailyTotal: daily.length,
        weeklyCompleted: weekly.filter((m: { completed: boolean }) => m.completed).length,
        weeklyTotal: weekly.length,
        creatorDailyCompleted: creatorDaily.filter((m: { completed: boolean }) => m.completed).length,
        creatorDailyTotal: creatorDaily.length,
        creatorWeeklyCompleted: creatorWeekly.filter((m: { completed: boolean }) => m.completed).length,
        creatorWeeklyTotal: creatorWeekly.length,
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
