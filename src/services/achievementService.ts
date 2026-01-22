import prisma from '../lib/prisma';

// ==================== BADGE DEFINITIONS ====================

const BADGES = [
  // === STREAK BADGES ===
  { code: 'streak_3', name: 'Comenzando', description: '3 días consecutivos', icon: '🌱', category: 'STREAK', rarity: 'COMMON', pointsReward: 10, xpReward: 20, unlockType: 'streak', unlockValue: 3 },
  { code: 'streak_7', name: 'Una Semana', description: '7 días consecutivos', icon: '🔥', category: 'STREAK', rarity: 'UNCOMMON', pointsReward: 25, xpReward: 50, unlockType: 'streak', unlockValue: 7 },
  { code: 'streak_14', name: 'Dos Semanas', description: '14 días consecutivos', icon: '⚡', category: 'STREAK', rarity: 'RARE', pointsReward: 50, xpReward: 100, unlockType: 'streak', unlockValue: 14 },
  { code: 'streak_30', name: 'Racha Épica', description: '30 días consecutivos', icon: '💎', category: 'STREAK', rarity: 'EPIC', pointsReward: 100, xpReward: 200, unlockType: 'streak', unlockValue: 30 },
  { code: 'streak_100', name: 'Leyenda', description: '100 días consecutivos', icon: '👑', category: 'STREAK', rarity: 'LEGENDARY', pointsReward: 500, xpReward: 1000, unlockType: 'streak', unlockValue: 100 },

  // === SPENDING BADGES ===
  { code: 'spend_10', name: 'Primer Apoyo', description: 'Gastaste $10 en la plataforma', icon: '💵', category: 'SPENDING', rarity: 'COMMON', pointsReward: 15, xpReward: 25, unlockType: 'spending', unlockValue: 10 },
  { code: 'spend_50', name: 'Buen Patrocinador', description: 'Gastaste $50 en la plataforma', icon: '💰', category: 'SPENDING', rarity: 'UNCOMMON', pointsReward: 50, xpReward: 75, unlockType: 'spending', unlockValue: 50 },
  { code: 'spend_100', name: 'Gran Patrocinador', description: 'Gastaste $100 en la plataforma', icon: '🤑', category: 'SPENDING', rarity: 'RARE', pointsReward: 100, xpReward: 150, unlockType: 'spending', unlockValue: 100 },
  { code: 'spend_500', name: 'Mecenas', description: 'Gastaste $500 en la plataforma', icon: '💎', category: 'SPENDING', rarity: 'EPIC', pointsReward: 300, xpReward: 500, unlockType: 'spending', unlockValue: 500 },
  { code: 'spend_1000', name: 'Leyenda VIP', description: 'Gastaste $1000 en la plataforma', icon: '👑', category: 'SPENDING', rarity: 'LEGENDARY', pointsReward: 750, xpReward: 1000, unlockType: 'spending', unlockValue: 1000 },

  // === SUBSCRIPTION/LOYALTY BADGES ===
  { code: 'sub_1', name: 'Primer Fan', description: 'Tu primera suscripción', icon: '⭐', category: 'LOYALTY', rarity: 'COMMON', pointsReward: 20, xpReward: 30, unlockType: 'subscriptions', unlockValue: 1 },
  { code: 'sub_3', name: 'Coleccionista', description: 'Suscrito a 3 creadores', icon: '🌟', category: 'LOYALTY', rarity: 'UNCOMMON', pointsReward: 40, xpReward: 60, unlockType: 'subscriptions', unlockValue: 3 },
  { code: 'sub_5', name: 'Super Fan', description: 'Suscrito a 5 creadores', icon: '✨', category: 'LOYALTY', rarity: 'RARE', pointsReward: 75, xpReward: 100, unlockType: 'subscriptions', unlockValue: 5 },
  { code: 'sub_10', name: 'VIP', description: 'Suscrito a 10 creadores', icon: '💫', category: 'LOYALTY', rarity: 'EPIC', pointsReward: 150, xpReward: 200, unlockType: 'subscriptions', unlockValue: 10 },
  { code: 'sub_25', name: 'Ultra Fan', description: 'Suscrito a 25 creadores', icon: '🏆', category: 'LOYALTY', rarity: 'LEGENDARY', pointsReward: 500, xpReward: 750, unlockType: 'subscriptions', unlockValue: 25 },

  // === TIPPING BADGES ===
  { code: 'tip_1', name: 'Primera Propina', description: 'Enviaste tu primera propina', icon: '💝', category: 'TIPPING', rarity: 'COMMON', pointsReward: 10, xpReward: 15, unlockType: 'tips', unlockValue: 1 },
  { code: 'tip_10', name: 'Generoso', description: 'Enviaste 10 propinas', icon: '💖', category: 'TIPPING', rarity: 'UNCOMMON', pointsReward: 30, xpReward: 50, unlockType: 'tips', unlockValue: 10 },
  { code: 'tip_50', name: 'Muy Generoso', description: 'Enviaste 50 propinas', icon: '💗', category: 'TIPPING', rarity: 'RARE', pointsReward: 75, xpReward: 100, unlockType: 'tips', unlockValue: 50 },
  { code: 'tip_100', name: 'Corazón de Oro', description: 'Enviaste 100 propinas', icon: '💛', category: 'TIPPING', rarity: 'EPIC', pointsReward: 150, xpReward: 250, unlockType: 'tips', unlockValue: 100 },

  // === SOCIAL BADGES ===
  { code: 'comment_1', name: 'Primer Comentario', description: 'Tu primer comentario', icon: '💬', category: 'SOCIAL', rarity: 'COMMON', pointsReward: 5, xpReward: 10, unlockType: 'comments', unlockValue: 1 },
  { code: 'comment_25', name: 'Comunicativo', description: '25 comentarios', icon: '🗣️', category: 'SOCIAL', rarity: 'UNCOMMON', pointsReward: 25, xpReward: 40, unlockType: 'comments', unlockValue: 25 },
  { code: 'comment_100', name: 'Comentarista', description: '100 comentarios', icon: '📢', category: 'SOCIAL', rarity: 'RARE', pointsReward: 75, xpReward: 100, unlockType: 'comments', unlockValue: 100 },
  { code: 'like_10', name: 'Fan Casual', description: 'Diste 10 likes', icon: '❤️', category: 'SOCIAL', rarity: 'COMMON', pointsReward: 5, xpReward: 10, unlockType: 'likes', unlockValue: 10 },
  { code: 'like_100', name: 'Fan Entusiasta', description: 'Diste 100 likes', icon: '💕', category: 'SOCIAL', rarity: 'UNCOMMON', pointsReward: 25, xpReward: 40, unlockType: 'likes', unlockValue: 100 },
  { code: 'like_500', name: 'Mega Fan', description: 'Diste 500 likes', icon: '💞', category: 'SOCIAL', rarity: 'RARE', pointsReward: 75, xpReward: 100, unlockType: 'likes', unlockValue: 500 },

  // === MISSION BADGES ===
  { code: 'mission_10', name: 'Misionero', description: 'Completaste 10 misiones', icon: '🎯', category: 'MISSIONS', rarity: 'COMMON', pointsReward: 20, xpReward: 30, unlockType: 'missions', unlockValue: 10 },
  { code: 'mission_50', name: 'Experto en Misiones', description: 'Completaste 50 misiones', icon: '🏹', category: 'MISSIONS', rarity: 'UNCOMMON', pointsReward: 50, xpReward: 75, unlockType: 'missions', unlockValue: 50 },
  { code: 'mission_100', name: 'Maestro de Misiones', description: 'Completaste 100 misiones', icon: '⚔️', category: 'MISSIONS', rarity: 'RARE', pointsReward: 100, xpReward: 150, unlockType: 'missions', unlockValue: 100 },
  { code: 'mission_500', name: 'Leyenda de Misiones', description: 'Completaste 500 misiones', icon: '🏅', category: 'MISSIONS', rarity: 'EPIC', pointsReward: 250, xpReward: 400, unlockType: 'missions', unlockValue: 500 },

  // === MILESTONE BADGES ===
  { code: 'xp_100', name: 'Primeros Pasos', description: 'Alcanzaste 100 XP', icon: '🌱', category: 'MILESTONE', rarity: 'COMMON', pointsReward: 10, xpReward: 0, unlockType: 'xp', unlockValue: 100 },
  { code: 'xp_500', name: 'Creciendo', description: 'Alcanzaste 500 XP', icon: '🌿', category: 'MILESTONE', rarity: 'UNCOMMON', pointsReward: 25, xpReward: 0, unlockType: 'xp', unlockValue: 500 },
  { code: 'xp_1000', name: 'Ascendiendo', description: 'Alcanzaste 1,000 XP', icon: '🌳', category: 'MILESTONE', rarity: 'RARE', pointsReward: 50, xpReward: 0, unlockType: 'xp', unlockValue: 1000 },
  { code: 'xp_5000', name: 'Experto', description: 'Alcanzaste 5,000 XP', icon: '🌲', category: 'MILESTONE', rarity: 'EPIC', pointsReward: 150, xpReward: 0, unlockType: 'xp', unlockValue: 5000 },
  { code: 'xp_10000', name: 'Maestro', description: 'Alcanzaste 10,000 XP', icon: '🏔️', category: 'MILESTONE', rarity: 'LEGENDARY', pointsReward: 500, xpReward: 0, unlockType: 'xp', unlockValue: 10000 },

  // === TENURE BADGES ===
  { code: 'tenure_30', name: '1 Mes', description: '1 mes en la plataforma', icon: '📅', category: 'SPECIAL', rarity: 'COMMON', pointsReward: 20, xpReward: 30, unlockType: 'tenure', unlockValue: 30 },
  { code: 'tenure_90', name: '3 Meses', description: '3 meses en la plataforma', icon: '🗓️', category: 'SPECIAL', rarity: 'UNCOMMON', pointsReward: 50, xpReward: 75, unlockType: 'tenure', unlockValue: 90 },
  { code: 'tenure_180', name: '6 Meses', description: '6 meses en la plataforma', icon: '📆', category: 'SPECIAL', rarity: 'RARE', pointsReward: 100, xpReward: 150, unlockType: 'tenure', unlockValue: 180 },
  { code: 'tenure_365', name: 'Veterano', description: '1 año en la plataforma', icon: '🎂', category: 'SPECIAL', rarity: 'EPIC', pointsReward: 300, xpReward: 500, unlockType: 'tenure', unlockValue: 365 },

  // === CREATOR BADGES ===
  { code: 'creator_first_sub', name: 'Primer Suscriptor', description: 'Conseguiste tu primer suscriptor', icon: '🌟', category: 'CREATOR', rarity: 'COMMON', pointsReward: 50, xpReward: 75, unlockType: 'creator_subscribers', unlockValue: 1 },
  { code: 'creator_10_subs', name: 'Creador Emergente', description: '10 suscriptores activos', icon: '⭐', category: 'CREATOR', rarity: 'UNCOMMON', pointsReward: 100, xpReward: 150, unlockType: 'creator_subscribers', unlockValue: 10 },
  { code: 'creator_100_subs', name: 'Creador Popular', description: '100 suscriptores activos', icon: '🌠', category: 'CREATOR', rarity: 'RARE', pointsReward: 250, xpReward: 400, unlockType: 'creator_subscribers', unlockValue: 100 },
  { code: 'creator_1000_subs', name: 'Estrella', description: '1,000 suscriptores activos', icon: '🌟', category: 'CREATOR', rarity: 'EPIC', pointsReward: 750, xpReward: 1000, unlockType: 'creator_subscribers', unlockValue: 1000 },
  { code: 'creator_first_tip', name: 'Primera Propina Recibida', description: 'Recibiste tu primera propina', icon: '💝', category: 'CREATOR', rarity: 'COMMON', pointsReward: 25, xpReward: 40, unlockType: 'creator_tips_received', unlockValue: 1 },
  { code: 'creator_100_tips', name: 'Querido por Fans', description: 'Recibiste 100 propinas', icon: '💖', category: 'CREATOR', rarity: 'RARE', pointsReward: 150, xpReward: 250, unlockType: 'creator_tips_received', unlockValue: 100 },
];

// ==================== LEVEL DEFINITIONS WITH PERKS ====================

const LEVELS_WITH_PERKS = [
  { level: 1, name: 'Novato', minXp: 0, icon: '🌱', color: '#6b7280', perks: ['Acceso básico'], discountPercent: 0, bonusXpPercent: 0 },
  { level: 2, name: 'Aprendiz', minXp: 100, icon: '🌿', color: '#22c55e', perks: ['Badge de nivel'], discountPercent: 0, bonusXpPercent: 0 },
  { level: 3, name: 'Aficionado', minXp: 300, icon: '🌲', color: '#16a34a', perks: ['Badge de nivel', 'Acceso a ranking'], discountPercent: 0, bonusXpPercent: 5 },
  { level: 4, name: 'Entusiasta', minXp: 600, icon: '⭐', color: '#3b82f6', perks: ['Badge exclusivo', '+5% XP bonus'], discountPercent: 0, bonusXpPercent: 5 },
  { level: 5, name: 'Fan', minXp: 1000, icon: '🌟', color: '#8b5cf6', perks: ['5% descuento suscripciones', '+5% XP bonus'], discountPercent: 5, bonusXpPercent: 5 },
  { level: 6, name: 'Super Fan', minXp: 1500, icon: '✨', color: '#a855f7', perks: ['Badge especial', '+10% XP bonus'], discountPercent: 5, bonusXpPercent: 10 },
  { level: 7, name: 'Ultra Fan', minXp: 2500, icon: '💫', color: '#d946ef', perks: ['Frame especial en comentarios', '+10% XP'], discountPercent: 5, bonusXpPercent: 10 },
  { level: 8, name: 'Élite', minXp: 4000, icon: '💎', color: '#ec4899', perks: ['10% descuento', 'Badge élite', '+15% XP'], discountPercent: 10, bonusXpPercent: 15, canAccessBeta: true },
  { level: 9, name: 'Legendario', minXp: 6000, icon: '👑', color: '#f59e0b', perks: ['Badge dorado', 'Acceso beta features', '+20% XP'], discountPercent: 10, bonusXpPercent: 20, canAccessBeta: true },
  { level: 10, name: 'Mítico', minXp: 10000, icon: '🏆', color: '#f97316', perks: ['15% descuento', 'Badge mítico', 'Soporte prioritario', '+25% XP'], discountPercent: 15, bonusXpPercent: 25, canAccessBeta: true, prioritySupport: true },
];

// ==================== SEEDING FUNCTIONS ====================

export async function seedBadges() {
  const existingCount = await prisma.badge.count();
  const existingBadges = await prisma.badge.findMany({ select: { code: true } });
  const existingCodes = new Set(existingBadges.map(b => b.code));

  let added = 0;
  for (const badge of BADGES) {
    if (!existingCodes.has(badge.code)) {
      await prisma.badge.create({
        data: {
          ...badge,
          category: badge.category as any,
          rarity: badge.rarity as any,
        }
      });
      added++;
    }
  }

  if (added > 0) {
    console.log(`✅ Seeded ${added} new badges (total: ${existingCount + added})`);
  }
}

export async function seedLevelsWithPerks() {
  for (const level of LEVELS_WITH_PERKS) {
    await prisma.fanLevel.upsert({
      where: { level: level.level },
      update: {
        name: level.name,
        minXp: level.minXp,
        icon: level.icon,
        color: level.color,
        perks: level.perks,
        discountPercent: level.discountPercent,
        bonusXpPercent: level.bonusXpPercent,
        canAccessBeta: level.canAccessBeta || false,
        prioritySupport: level.prioritySupport || false,
      },
      create: {
        level: level.level,
        name: level.name,
        minXp: level.minXp,
        icon: level.icon,
        color: level.color,
        perks: level.perks,
        discountPercent: level.discountPercent,
        bonusXpPercent: level.bonusXpPercent,
        canAccessBeta: level.canAccessBeta || false,
        prioritySupport: level.prioritySupport || false,
      }
    });
  }
  console.log('✅ Levels with perks seeded/updated');
}

// ==================== ACHIEVEMENT CHECKING ====================

interface UserStats {
  streak: number;
  totalSpent: number;
  activeSubscriptions: number;
  tipsSent: number;
  comments: number;
  likes: number;
  missionsCompleted: number;
  xp: number;
  tenureDays: number;
  // Creator stats
  isCreator: boolean;
  subscribers?: number;
  tipsReceived?: number;
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userPoints: true,
      creatorProfile: true,
    }
  });

  if (!user) throw new Error('User not found');

  // OPTIMIZED: Execute all queries in parallel instead of sequentially
  const [
    donationsAgg,
    activeSubscriptions,
    tipsSent,
    comments,
    likes,
    missionsCompleted,
    creatorStats
  ] = await Promise.all([
    // Total spent (donations)
    prisma.donation.aggregate({
      where: { fromUserId: userId },
      _sum: { amount: true }
    }),
    // Active subscriptions count
    prisma.subscription.count({
      where: { userId, status: 'ACTIVE' }
    }),
    // Tips sent count
    prisma.donation.count({
      where: { fromUserId: userId }
    }),
    // Comments count
    prisma.comment.count({
      where: { userId }
    }),
    // Likes count
    prisma.postLike.count({
      where: { userId }
    }),
    // Missions completed
    prisma.userMission.count({
      where: { userId, completed: true, claimed: true }
    }),
    // Creator stats (only if creator)
    user.isCreator && user.creatorProfile
      ? Promise.all([
          prisma.subscription.count({
            where: { 
              tier: { creatorId: user.creatorProfile.id },
              status: 'ACTIVE'
            }
          }),
          prisma.donation.count({
            where: { toCreatorId: user.creatorProfile.id }
          })
        ])
      : Promise.resolve([0, 0] as [number, number])
  ]);

  // Calculate tenure in days
  const tenureDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));

  return {
    streak: user.userPoints?.loginStreak || 0,
    totalSpent: donationsAgg._sum.amount || 0,
    activeSubscriptions,
    tipsSent,
    comments,
    likes,
    missionsCompleted,
    xp: user.userPoints?.xp || 0,
    tenureDays,
    isCreator: user.isCreator,
    subscribers: creatorStats[0],
    tipsReceived: creatorStats[1],
  };
}

export async function checkAndAwardBadges(userId: string): Promise<string[]> {
  const stats = await getUserStats(userId);
  const awardedBadges: string[] = [];

  // Get all badges
  const badges = await prisma.badge.findMany({
    where: { isActive: true }
  });

  // Get user's existing badges
  const userBadges = await prisma.userBadge.findMany({
    where: { userId },
    select: { badgeId: true }
  });
  const earnedBadgeIds = new Set(userBadges.map(ub => ub.badgeId));

  for (const badge of badges) {
    if (earnedBadgeIds.has(badge.id)) continue;

    let shouldAward = false;

    switch (badge.unlockType) {
      case 'streak':
        shouldAward = stats.streak >= badge.unlockValue;
        break;
      case 'spending':
        shouldAward = stats.totalSpent >= badge.unlockValue;
        break;
      case 'subscriptions':
        shouldAward = stats.activeSubscriptions >= badge.unlockValue;
        break;
      case 'tips':
        shouldAward = stats.tipsSent >= badge.unlockValue;
        break;
      case 'comments':
        shouldAward = stats.comments >= badge.unlockValue;
        break;
      case 'likes':
        shouldAward = stats.likes >= badge.unlockValue;
        break;
      case 'missions':
        shouldAward = stats.missionsCompleted >= badge.unlockValue;
        break;
      case 'xp':
        shouldAward = stats.xp >= badge.unlockValue;
        break;
      case 'tenure':
        shouldAward = stats.tenureDays >= badge.unlockValue;
        break;
      case 'creator_subscribers':
        shouldAward = stats.isCreator && (stats.subscribers || 0) >= badge.unlockValue;
        break;
      case 'creator_tips_received':
        shouldAward = stats.isCreator && (stats.tipsReceived || 0) >= badge.unlockValue;
        break;
      // 'manual' badges are only awarded explicitly
    }

    if (shouldAward) {
      await prisma.userBadge.create({
        data: { userId, badgeId: badge.id }
      });

      // Award bonus XP and points
      if (badge.xpReward > 0 || badge.pointsReward > 0) {
        await prisma.userPoints.upsert({
          where: { userId },
          update: {
            xp: { increment: badge.xpReward },
            totalEarned: { increment: badge.pointsReward },
            points: { increment: badge.pointsReward },
          },
          create: {
            userId,
            xp: badge.xpReward,
            totalEarned: badge.pointsReward,
            points: badge.pointsReward,
          }
        });
      }

      awardedBadges.push(badge.code);
      console.log(`🏆 Awarded badge "${badge.name}" to user ${userId}`);
    }
  }

  return awardedBadges;
}

// ==================== GET USER LEVEL PERKS ====================

export async function getUserLevelPerks(userId: string) {
  const userPoints = await prisma.userPoints.findUnique({
    where: { userId }
  });

  const xp = userPoints?.xp || 0;

  // Get current level
  const level = await prisma.fanLevel.findFirst({
    where: { minXp: { lte: xp } },
    orderBy: { minXp: 'desc' }
  });

  if (!level) {
    return {
      level: 1,
      name: 'Novato',
      discountPercent: 0,
      bonusXpPercent: 0,
      perks: ['Acceso básico'],
      canAccessBeta: false,
      prioritySupport: false,
    };
  }

  return {
    level: level.level,
    name: level.name,
    discountPercent: level.discountPercent,
    bonusXpPercent: level.bonusXpPercent,
    perks: level.perks,
    canAccessBeta: level.canAccessBeta,
    prioritySupport: level.prioritySupport,
  };
}

// Initialize on import
seedBadges().catch(console.error);
seedLevelsWithPerks().catch(console.error);
