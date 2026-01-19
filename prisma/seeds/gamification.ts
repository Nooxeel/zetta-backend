import { PrismaClient, BadgeCategory, BadgeRarity } from '@prisma/client';

const prisma = new PrismaClient();

// Badge definitions
const BADGES = [
  // TIPPING badges
  {
    code: 'first_tip',
    name: 'Primera Propina',
    description: 'Envía tu primera propina a un creador',
    icon: '💝',
    category: BadgeCategory.TIPPING,
    rarity: BadgeRarity.COMMON,
    pointsReward: 10,
  },
  {
    code: 'generous_tipper',
    name: 'Generoso',
    description: 'Envía propinas a 5 creadores diferentes',
    icon: '🎁',
    category: BadgeCategory.TIPPING,
    rarity: BadgeRarity.UNCOMMON,
    pointsReward: 25,
  },
  {
    code: 'big_spender',
    name: 'Big Spender',
    description: 'Gasta más de $100 en propinas',
    icon: '💎',
    category: BadgeCategory.TIPPING,
    rarity: BadgeRarity.RARE,
    pointsReward: 50,
  },
  {
    code: 'whale',
    name: 'Ballena',
    description: 'Gasta más de $500 en propinas',
    icon: '🐋',
    category: BadgeCategory.TIPPING,
    rarity: BadgeRarity.EPIC,
    pointsReward: 100,
  },
  {
    code: 'top_tipper_week',
    name: 'Top Tipper Semanal',
    description: 'Sé el #1 tipper de la semana',
    icon: '🏆',
    category: BadgeCategory.TIPPING,
    rarity: BadgeRarity.LEGENDARY,
    pointsReward: 200,
  },

  // STREAK badges
  {
    code: 'streak_3',
    name: 'En Racha',
    description: 'Mantén una racha de 3 días',
    icon: '🔥',
    category: BadgeCategory.STREAK,
    rarity: BadgeRarity.COMMON,
    pointsReward: 5,
  },
  {
    code: 'streak_7',
    name: 'Constante',
    description: 'Mantén una racha de 7 días',
    icon: '🔥',
    category: BadgeCategory.STREAK,
    rarity: BadgeRarity.UNCOMMON,
    pointsReward: 15,
  },
  {
    code: 'streak_30',
    name: 'Fanático',
    description: 'Mantén una racha de 30 días',
    icon: '🔥',
    category: BadgeCategory.STREAK,
    rarity: BadgeRarity.RARE,
    pointsReward: 50,
  },
  {
    code: 'streak_100',
    name: 'Leyenda',
    description: 'Mantén una racha de 100 días',
    icon: '🌟',
    category: BadgeCategory.STREAK,
    rarity: BadgeRarity.LEGENDARY,
    pointsReward: 200,
  },

  // SOCIAL badges
  {
    code: 'first_comment',
    name: 'Primer Comentario',
    description: 'Deja tu primer comentario en un perfil',
    icon: '💬',
    category: BadgeCategory.SOCIAL,
    rarity: BadgeRarity.COMMON,
    pointsReward: 5,
  },
  {
    code: 'commentator',
    name: 'Comentarista',
    description: 'Deja 10 comentarios aprobados',
    icon: '📝',
    category: BadgeCategory.SOCIAL,
    rarity: BadgeRarity.UNCOMMON,
    pointsReward: 20,
  },
  {
    code: 'first_favorite',
    name: 'Primer Favorito',
    description: 'Agrega tu primer creador a favoritos',
    icon: '❤️',
    category: BadgeCategory.SOCIAL,
    rarity: BadgeRarity.COMMON,
    pointsReward: 5,
  },
  {
    code: 'collector',
    name: 'Coleccionista',
    description: 'Ten 10 creadores en favoritos',
    icon: '💖',
    category: BadgeCategory.SOCIAL,
    rarity: BadgeRarity.UNCOMMON,
    pointsReward: 20,
  },

  // LOYALTY badges
  {
    code: 'first_sub',
    name: 'Primera Suscripción',
    description: 'Suscríbete a tu primer creador',
    icon: '⭐',
    category: BadgeCategory.LOYALTY,
    rarity: BadgeRarity.COMMON,
    pointsReward: 15,
  },
  {
    code: 'loyal_fan',
    name: 'Fan Leal',
    description: 'Mantén una suscripción por 3 meses',
    icon: '🌟',
    category: BadgeCategory.LOYALTY,
    rarity: BadgeRarity.RARE,
    pointsReward: 50,
  },
  {
    code: 'super_supporter',
    name: 'Super Supporter',
    description: 'Suscríbete a 5 creadores al mismo tiempo',
    icon: '👑',
    category: BadgeCategory.LOYALTY,
    rarity: BadgeRarity.EPIC,
    pointsReward: 100,
  },

  // MILESTONE badges
  {
    code: 'points_100',
    name: '100 Puntos',
    description: 'Acumula 100 puntos en total',
    icon: '💯',
    category: BadgeCategory.MILESTONE,
    rarity: BadgeRarity.COMMON,
    pointsReward: 10,
  },
  {
    code: 'points_500',
    name: '500 Puntos',
    description: 'Acumula 500 puntos en total',
    icon: '🎯',
    category: BadgeCategory.MILESTONE,
    rarity: BadgeRarity.UNCOMMON,
    pointsReward: 25,
  },
  {
    code: 'points_1000',
    name: 'Mil Puntos',
    description: 'Acumula 1,000 puntos en total',
    icon: '🏅',
    category: BadgeCategory.MILESTONE,
    rarity: BadgeRarity.RARE,
    pointsReward: 50,
  },
  {
    code: 'roulette_winner',
    name: 'Suertudo',
    description: 'Gana el jackpot en la ruleta',
    icon: '🎰',
    category: BadgeCategory.MILESTONE,
    rarity: BadgeRarity.RARE,
    pointsReward: 25,
  },

  // SPECIAL badges
  {
    code: 'early_adopter',
    name: 'Early Adopter',
    description: 'Usuario de los primeros 1000',
    icon: '🚀',
    category: BadgeCategory.SPECIAL,
    rarity: BadgeRarity.LEGENDARY,
    pointsReward: 100,
  },
  {
    code: 'verified_fan',
    name: 'Fan Verificado',
    description: 'Verifica tu edad y email',
    icon: '✅',
    category: BadgeCategory.SPECIAL,
    rarity: BadgeRarity.COMMON,
    pointsReward: 20,
  },
];

// Fan levels
const LEVELS = [
  { level: 1, name: 'Novato', minXp: 0, icon: '🌱', color: '#9CA3AF', perks: [] },
  { level: 2, name: 'Fan', minXp: 100, icon: '⭐', color: '#60A5FA', perks: ['Acceso a chat general'] },
  { level: 3, name: 'Super Fan', minXp: 300, icon: '🌟', color: '#34D399', perks: ['Badge visible en perfil', 'Emojis exclusivos'] },
  { level: 4, name: 'Mega Fan', minXp: 600, icon: '💫', color: '#A78BFA', perks: ['Descuento 5% en suscripciones', 'Prioridad en comentarios'] },
  { level: 5, name: 'Ultra Fan', minXp: 1000, icon: '🔥', color: '#F472B6', perks: ['Descuento 10% en suscripciones', 'Badge premium'] },
  { level: 6, name: 'Elite', minXp: 2000, icon: '👑', color: '#FBBF24', perks: ['Acceso anticipado a contenido', 'Badge dorado'] },
  { level: 7, name: 'Leyenda', minXp: 5000, icon: '🏆', color: '#F59E0B', perks: ['Badge animado', 'Menciones en perfiles'] },
  { level: 8, name: 'Mítico', minXp: 10000, icon: '💎', color: '#EC4899', perks: ['Badge legendario', 'Beneficios VIP'] },
];

export async function seedGamification() {
  console.log('🎮 Seeding gamification data...');

  // Seed badges
  for (const badge of BADGES) {
    await prisma.badge.upsert({
      where: { code: badge.code },
      update: badge,
      create: badge,
    });
  }
  console.log(`  ✅ ${BADGES.length} badges created/updated`);

  // Seed fan levels
  for (const level of LEVELS) {
    await prisma.fanLevel.upsert({
      where: { level: level.level },
      update: level,
      create: level,
    });
  }
  console.log(`  ✅ ${LEVELS.length} fan levels created/updated`);

  console.log('🎮 Gamification seeding complete!');
}

// Run directly if this file is executed
if (require.main === module) {
  seedGamification()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      prisma.$disconnect();
      process.exit(1);
    });
}
