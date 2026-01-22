import { Router, Request, Response, NextFunction } from 'express';
import { Mission, UserMission, Prisma } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

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
  // Engagement
  { code: 'creator_daily_dm', name: 'Conectar', description: 'Envía un mensaje a un fan', icon: '✉️', actionType: 'dm_fan', targetCount: 1, pointsReward: 5, xpReward: 10, category: 'CREATOR_ENGAGEMENT', forCreators: true },
  { code: 'creator_daily_reply', name: 'Respondedor', description: 'Responde 3 mensajes de fans', icon: '💬', actionType: 'reply_fan', targetCount: 3, pointsReward: 10, xpReward: 15, category: 'CREATOR_ENGAGEMENT', forCreators: true },
  { code: 'creator_daily_approve', name: 'Moderador', description: 'Aprueba 3 comentarios', icon: '✅', actionType: 'approve_comment', targetCount: 3, pointsReward: 8, xpReward: 12, category: 'CREATOR_ENGAGEMENT', forCreators: true },
];

const CREATOR_WEEKLY_MISSIONS = [
  // Content
  { code: 'creator_weekly_posts', name: 'Creador Activo', description: 'Publica 5 posts', icon: '🎨', actionType: 'post', targetCount: 5, pointsReward: 40, xpReward: 60, category: 'CONTENT', forCreators: true },
  { code: 'creator_weekly_video', name: 'Videógrafo', description: 'Sube 2 videos', icon: '🎬', actionType: 'video', targetCount: 2, pointsReward: 30, xpReward: 50, category: 'CONTENT', forCreators: true },
  // Engagement  
  { code: 'creator_weekly_broadcast', name: 'Comunicador', description: 'Envía un Mass DM', icon: '📢', actionType: 'broadcast', targetCount: 1, pointsReward: 20, xpReward: 30, category: 'CREATOR_ENGAGEMENT', forCreators: true },
  { code: 'creator_weekly_messages', name: 'Mensajero', description: 'Envía 10 mensajes a fans', icon: '💬', actionType: 'dm_fan', targetCount: 10, pointsReward: 35, xpReward: 50, category: 'CREATOR_ENGAGEMENT', forCreators: true },
  { code: 'creator_weekly_replies', name: 'Atención al Fan', description: 'Responde 20 mensajes de fans', icon: '📨', actionType: 'reply_fan', targetCount: 20, pointsReward: 50, xpReward: 80, category: 'CREATOR_ENGAGEMENT', forCreators: true },
  // Growth
  { code: 'creator_weekly_earnings', name: 'Meta de Ingresos', description: 'Gana $50+ esta semana', icon: '💎', actionType: 'earn', targetCount: 50, pointsReward: 75, xpReward: 100, category: 'CREATOR_GROWTH', forCreators: true },
  { code: 'creator_weekly_subs', name: 'Magnetismo', description: 'Consigue 3 nuevos suscriptores', icon: '🧲', actionType: 'new_subscriber', targetCount: 3, pointsReward: 60, xpReward: 80, category: 'CREATOR_GROWTH', forCreators: true },
  { code: 'creator_weekly_tips', name: 'Propinero', description: 'Recibe 5 propinas', icon: '💵', actionType: 'receive_tip', targetCount: 5, pointsReward: 40, xpReward: 60, category: 'CREATOR_GROWTH', forCreators: true },
];

// ========== CREATOR MONTHLY MISSIONS ==========
const CREATOR_MONTHLY_MISSIONS = [
  { code: 'creator_monthly_posts', name: 'Creador Prolífico', description: 'Publica 20 posts este mes', icon: '🏆', actionType: 'post', targetCount: 20, pointsReward: 150, xpReward: 200, category: 'CONTENT', forCreators: true },
  { code: 'creator_monthly_earnings', name: 'Gran Mes', description: 'Gana $200+ este mes', icon: '💰', actionType: 'earn', targetCount: 200, pointsReward: 200, xpReward: 300, category: 'CREATOR_GROWTH', forCreators: true },
  { code: 'creator_monthly_subs', name: 'Influencer', description: 'Consigue 10 nuevos suscriptores', icon: '🌟', actionType: 'new_subscriber', targetCount: 10, pointsReward: 150, xpReward: 200, category: 'CREATOR_GROWTH', forCreators: true },
  { code: 'creator_monthly_engagement', name: 'Comunidad Activa', description: 'Recibe 50 comentarios', icon: '💬', actionType: 'receive_comment', targetCount: 50, pointsReward: 100, xpReward: 150, category: 'CREATOR_ENGAGEMENT', forCreators: true },
];

// ========== CREATOR ACHIEVEMENTS (One-time milestones) ==========
const CREATOR_ACHIEVEMENTS = [
  // First time achievements
  { code: 'creator_first_photo', name: 'Primera Foto', description: 'Sube tu primera imagen', icon: '📷', actionType: 'upload_photo', targetCount: 1, pointsReward: 20, xpReward: 30, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_first_video', name: 'Primera Video', description: 'Sube tu primer video', icon: '🎥', actionType: 'upload_video', targetCount: 1, pointsReward: 30, xpReward: 50, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_first_subscriber', name: 'Primer Suscriptor', description: 'Consigue tu primer suscriptor', icon: '🎉', actionType: 'get_subscriber', targetCount: 1, pointsReward: 50, xpReward: 100, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_first_tip', name: 'Primera Propina', description: 'Recibe tu primera propina', icon: '💝', actionType: 'receive_tip', targetCount: 1, pointsReward: 30, xpReward: 50, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_first_comment', name: 'Primer Comentario', description: 'Recibe tu primer comentario', icon: '💬', actionType: 'receive_comment', targetCount: 1, pointsReward: 15, xpReward: 25, category: 'CREATOR_MILESTONE', forCreators: true },
  
  // Milestone achievements - Likes
  { code: 'creator_5_likes', name: '5 Likes', description: 'Obtén 5 likes en total', icon: '❤️', actionType: 'total_likes', targetCount: 5, pointsReward: 25, xpReward: 40, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_25_likes', name: '25 Likes', description: 'Obtén 25 likes en total', icon: '💕', actionType: 'total_likes', targetCount: 25, pointsReward: 50, xpReward: 80, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_100_likes', name: '100 Likes', description: 'Obtén 100 likes en total', icon: '💖', actionType: 'total_likes', targetCount: 100, pointsReward: 100, xpReward: 150, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_500_likes', name: '500 Likes', description: 'Obtén 500 likes en total', icon: '💗', actionType: 'total_likes', targetCount: 500, pointsReward: 200, xpReward: 300, category: 'CREATOR_MILESTONE', forCreators: true },
  
  // Milestone achievements - Comments
  { code: 'creator_5_comments', name: '5 Comentarios', description: 'Recibe 5 comentarios en tu libro de visitas', icon: '📝', actionType: 'total_comments', targetCount: 5, pointsReward: 25, xpReward: 40, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_25_comments', name: '25 Comentarios', description: 'Recibe 25 comentarios en tu libro de visitas', icon: '📖', actionType: 'total_comments', targetCount: 25, pointsReward: 50, xpReward: 80, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_100_comments', name: '100 Comentarios', description: 'Recibe 100 comentarios en tu libro de visitas', icon: '📚', actionType: 'total_comments', targetCount: 100, pointsReward: 100, xpReward: 150, category: 'CREATOR_MILESTONE', forCreators: true },
  
  // Milestone achievements - Subscribers
  { code: 'creator_5_subs', name: '5 Suscriptores', description: 'Consigue 5 suscriptores', icon: '⭐', actionType: 'total_subscribers', targetCount: 5, pointsReward: 75, xpReward: 100, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_10_subs', name: '10 Suscriptores', description: 'Consigue 10 suscriptores', icon: '🌟', actionType: 'total_subscribers', targetCount: 10, pointsReward: 100, xpReward: 150, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_25_subs', name: '25 Suscriptores', description: 'Consigue 25 suscriptores', icon: '✨', actionType: 'total_subscribers', targetCount: 25, pointsReward: 150, xpReward: 200, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_50_subs', name: '50 Suscriptores', description: 'Consigue 50 suscriptores', icon: '💫', actionType: 'total_subscribers', targetCount: 50, pointsReward: 250, xpReward: 350, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_100_subs', name: '100 Suscriptores', description: 'Consigue 100 suscriptores', icon: '🏅', actionType: 'total_subscribers', targetCount: 100, pointsReward: 500, xpReward: 750, category: 'CREATOR_MILESTONE', forCreators: true },
  
  // Milestone achievements - Tips received
  { code: 'creator_5_tips', name: '5 Propinas', description: 'Recibe 5 propinas', icon: '💵', actionType: 'total_tips', targetCount: 5, pointsReward: 50, xpReward: 75, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_25_tips', name: '25 Propinas', description: 'Recibe 25 propinas', icon: '💴', actionType: 'total_tips', targetCount: 25, pointsReward: 100, xpReward: 150, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_100_tips', name: '100 Propinas', description: 'Recibe 100 propinas', icon: '💎', actionType: 'total_tips', targetCount: 100, pointsReward: 250, xpReward: 400, category: 'CREATOR_MILESTONE', forCreators: true },
  
  // Content milestones
  { code: 'creator_10_posts', name: '10 Publicaciones', description: 'Publica 10 posts', icon: '📸', actionType: 'total_posts', targetCount: 10, pointsReward: 50, xpReward: 75, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_50_posts', name: '50 Publicaciones', description: 'Publica 50 posts', icon: '📷', actionType: 'total_posts', targetCount: 50, pointsReward: 150, xpReward: 200, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_100_posts', name: '100 Publicaciones', description: 'Publica 100 posts', icon: '🏆', actionType: 'total_posts', targetCount: 100, pointsReward: 300, xpReward: 500, category: 'CREATOR_MILESTONE', forCreators: true },
  
  // Earnings milestones
  { code: 'creator_earn_100', name: 'Primeros $100', description: 'Gana $100 en total', icon: '💰', actionType: 'total_earnings', targetCount: 100, pointsReward: 100, xpReward: 150, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_earn_500', name: '$500 Ganados', description: 'Gana $500 en total', icon: '🤑', actionType: 'total_earnings', targetCount: 500, pointsReward: 250, xpReward: 350, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_earn_1000', name: '$1000 Ganados', description: 'Gana $1000 en total', icon: '💎', actionType: 'total_earnings', targetCount: 1000, pointsReward: 500, xpReward: 750, category: 'CREATOR_MILESTONE', forCreators: true },
  
  // Special achievements
  { code: 'creator_verified', name: 'Verificado', description: 'Verifica tu cuenta', icon: '✅', actionType: 'verify_account', targetCount: 1, pointsReward: 100, xpReward: 200, category: 'CREATOR_MILESTONE', forCreators: true },
  { code: 'creator_complete_profile', name: 'Perfil Completo', description: 'Completa tu perfil al 100%', icon: '🎨', actionType: 'complete_profile', targetCount: 1, pointsReward: 50, xpReward: 75, category: 'CREATOR_MILESTONE', forCreators: true },
];

// ========== FAN ACHIEVEMENTS (One-time milestones) ==========
const FAN_ACHIEVEMENTS = [
  // First time achievements
  { code: 'fan_first_subscription', name: 'Primera Suscripción', description: 'Suscríbete a tu primer creador', icon: '🎟️', actionType: 'first_subscribe', targetCount: 1, pointsReward: 30, xpReward: 50, category: 'MILESTONE', forCreators: false },
  { code: 'fan_first_tip', name: 'Primera Propina', description: 'Envía tu primera propina', icon: '💸', actionType: 'first_tip', targetCount: 1, pointsReward: 25, xpReward: 40, category: 'MILESTONE', forCreators: false },
  { code: 'fan_first_comment', name: 'Primer Comentario', description: 'Deja tu primer comentario', icon: '💬', actionType: 'first_comment', targetCount: 1, pointsReward: 15, xpReward: 25, category: 'MILESTONE', forCreators: false },
  { code: 'fan_first_favorite', name: 'Primer Favorito', description: 'Añade tu primer creador a favoritos', icon: '⭐', actionType: 'first_favorite', targetCount: 1, pointsReward: 10, xpReward: 15, category: 'MILESTONE', forCreators: false },
  { code: 'fan_first_message', name: 'Primer Mensaje', description: 'Envía tu primer mensaje', icon: '✉️', actionType: 'first_message', targetCount: 1, pointsReward: 15, xpReward: 25, category: 'MILESTONE', forCreators: false },
  
  // Subscription milestones
  { code: 'fan_3_subs', name: 'Coleccionista Novato', description: 'Suscríbete a 3 creadores', icon: '🎫', actionType: 'total_subscriptions', targetCount: 3, pointsReward: 50, xpReward: 75, category: 'MILESTONE', forCreators: false },
  { code: 'fan_5_subs', name: 'Coleccionista', description: 'Suscríbete a 5 creadores', icon: '🎪', actionType: 'total_subscriptions', targetCount: 5, pointsReward: 75, xpReward: 100, category: 'MILESTONE', forCreators: false },
  { code: 'fan_10_subs', name: 'Super Fan', description: 'Suscríbete a 10 creadores', icon: '🏆', actionType: 'total_subscriptions', targetCount: 10, pointsReward: 150, xpReward: 200, category: 'MILESTONE', forCreators: false },
  
  // Tipping milestones
  { code: 'fan_5_tips', name: 'Generoso', description: 'Envía 5 propinas', icon: '💵', actionType: 'total_tips_sent', targetCount: 5, pointsReward: 50, xpReward: 75, category: 'MILESTONE', forCreators: false },
  { code: 'fan_25_tips', name: 'Mecenas', description: 'Envía 25 propinas', icon: '💎', actionType: 'total_tips_sent', targetCount: 25, pointsReward: 125, xpReward: 175, category: 'MILESTONE', forCreators: false },
  { code: 'fan_100_tips', name: 'Benefactor', description: 'Envía 100 propinas', icon: '👑', actionType: 'total_tips_sent', targetCount: 100, pointsReward: 300, xpReward: 500, category: 'MILESTONE', forCreators: false },
  
  // Likes milestones
  { code: 'fan_10_likes', name: '10 Likes Dados', description: 'Da 10 likes', icon: '❤️', actionType: 'total_likes_given', targetCount: 10, pointsReward: 20, xpReward: 30, category: 'MILESTONE', forCreators: false },
  { code: 'fan_50_likes', name: '50 Likes Dados', description: 'Da 50 likes', icon: '💕', actionType: 'total_likes_given', targetCount: 50, pointsReward: 50, xpReward: 75, category: 'MILESTONE', forCreators: false },
  { code: 'fan_200_likes', name: '200 Likes Dados', description: 'Da 200 likes', icon: '💖', actionType: 'total_likes_given', targetCount: 200, pointsReward: 100, xpReward: 150, category: 'MILESTONE', forCreators: false },
  
  // Comments milestones
  { code: 'fan_5_comments', name: '5 Comentarios', description: 'Deja 5 comentarios', icon: '📝', actionType: 'total_comments_made', targetCount: 5, pointsReward: 25, xpReward: 40, category: 'MILESTONE', forCreators: false },
  { code: 'fan_25_comments', name: '25 Comentarios', description: 'Deja 25 comentarios', icon: '📖', actionType: 'total_comments_made', targetCount: 25, pointsReward: 75, xpReward: 100, category: 'MILESTONE', forCreators: false },
  { code: 'fan_100_comments', name: '100 Comentarios', description: 'Deja 100 comentarios', icon: '📚', actionType: 'total_comments_made', targetCount: 100, pointsReward: 150, xpReward: 200, category: 'MILESTONE', forCreators: false },
  
  // Favorites milestones
  { code: 'fan_5_favorites', name: '5 Favoritos', description: 'Añade 5 creadores a favoritos', icon: '⭐', actionType: 'total_favorites', targetCount: 5, pointsReward: 25, xpReward: 40, category: 'MILESTONE', forCreators: false },
  { code: 'fan_15_favorites', name: '15 Favoritos', description: 'Añade 15 creadores a favoritos', icon: '🌟', actionType: 'total_favorites', targetCount: 15, pointsReward: 50, xpReward: 75, category: 'MILESTONE', forCreators: false },
  
  // Spending milestones
  { code: 'fan_spend_50', name: 'Gastador $50', description: 'Gasta $50 en la plataforma', icon: '💰', actionType: 'total_spent', targetCount: 50, pointsReward: 75, xpReward: 100, category: 'MILESTONE', forCreators: false },
  { code: 'fan_spend_200', name: 'Gastador $200', description: 'Gasta $200 en la plataforma', icon: '🤑', actionType: 'total_spent', targetCount: 200, pointsReward: 200, xpReward: 300, category: 'MILESTONE', forCreators: false },
  { code: 'fan_spend_500', name: 'VIP', description: 'Gasta $500 en la plataforma', icon: '💎', actionType: 'total_spent', targetCount: 500, pointsReward: 400, xpReward: 600, category: 'MILESTONE', forCreators: false },
  
  // Engagement milestones
  { code: 'fan_7_day_streak', name: 'Racha de 7 Días', description: 'Inicia sesión 7 días seguidos', icon: '🔥', actionType: 'login_streak', targetCount: 7, pointsReward: 50, xpReward: 75, category: 'MILESTONE', forCreators: false },
  { code: 'fan_30_day_streak', name: 'Racha de 30 Días', description: 'Inicia sesión 30 días seguidos', icon: '🔥', actionType: 'login_streak', targetCount: 30, pointsReward: 200, xpReward: 300, category: 'MILESTONE', forCreators: false },
  
  // Special achievements
  { code: 'fan_verified', name: 'Verificado', description: 'Verifica tu cuenta', icon: '✅', actionType: 'verify_account', targetCount: 1, pointsReward: 50, xpReward: 100, category: 'MILESTONE', forCreators: false },
  { code: 'fan_complete_profile', name: 'Perfil Completo', description: 'Completa tu perfil al 100%', icon: '🎨', actionType: 'complete_profile', targetCount: 1, pointsReward: 25, xpReward: 40, category: 'MILESTONE', forCreators: false },
  { code: 'fan_ruleta_winner', name: 'Ganador de Ruleta', description: 'Gana un premio en la ruleta', icon: '🎰', actionType: 'ruleta_win', targetCount: 1, pointsReward: 20, xpReward: 30, category: 'MILESTONE', forCreators: false },
];

// ========== FAN MONTHLY MISSIONS ==========
const FAN_MONTHLY_MISSIONS = [
  { code: 'fan_monthly_tips', name: 'Mecenas Mensual', description: 'Envía 10 propinas este mes', icon: '💰', actionType: 'tip', targetCount: 10, pointsReward: 100, xpReward: 150, category: 'TIPPING', forCreators: false },
  { code: 'fan_monthly_explore', name: 'Explorador Experto', description: 'Visita 50 perfiles este mes', icon: '🌎', actionType: 'visit', targetCount: 50, pointsReward: 75, xpReward: 100, category: 'DISCOVERY', forCreators: false },
  { code: 'fan_monthly_social', name: 'Mariposa Social', description: 'Deja 20 comentarios este mes', icon: '🦋', actionType: 'comment', targetCount: 20, pointsReward: 80, xpReward: 120, category: 'SOCIAL', forCreators: false },
  { code: 'fan_monthly_streak', name: 'Dedicación', description: 'Inicia sesión 20 días este mes', icon: '🏅', actionType: 'login', targetCount: 20, pointsReward: 100, xpReward: 150, category: 'ENGAGEMENT', forCreators: false },
];

// ==================== SEED MISSIONS (run once) ====================

async function ensureMissionsSeeded() {
  // Check if we need to add new missions (version check)
  const missionCount = await prisma.mission.count();
  const expectedCount = DAILY_MISSIONS.length + WEEKLY_MISSIONS.length + 
                        CREATOR_DAILY_MISSIONS.length + CREATOR_WEEKLY_MISSIONS.length +
                        CREATOR_MONTHLY_MISSIONS.length + CREATOR_ACHIEVEMENTS.length +
                        FAN_ACHIEVEMENTS.length + FAN_MONTHLY_MISSIONS.length;
  
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
    
    // Seed fan monthly missions
    for (const mission of FAN_MONTHLY_MISSIONS) {
      if (!existingCodes.has(mission.code)) {
        await prisma.mission.create({
          data: { ...mission, type: 'MONTHLY', category: mission.category as any }
        });
        console.log(`  ✅ Added: ${mission.code}`);
      }
    }
    
    // Seed fan achievements
    for (const mission of FAN_ACHIEVEMENTS) {
      if (!existingCodes.has(mission.code)) {
        await prisma.mission.create({
          data: { ...mission, type: 'ACHIEVEMENT', category: mission.category as any }
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
    
    // Seed creator monthly missions
    for (const mission of CREATOR_MONTHLY_MISSIONS) {
      if (!existingCodes.has(mission.code)) {
        await prisma.mission.create({
          data: { ...mission, type: 'MONTHLY', category: mission.category as any }
        });
        console.log(`  ✅ Added: ${mission.code}`);
      }
    }
    
    // Seed creator achievements
    for (const mission of CREATOR_ACHIEVEMENTS) {
      if (!existingCodes.has(mission.code)) {
        await prisma.mission.create({
          data: { ...mission, type: 'ACHIEVEMENT', category: mission.category as any }
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

  // Assign missions using batch insert
  if (selectedMissions.length > 0) {
    const now = new Date();
    await prisma.userMission.createMany({
      data: selectedMissions.map(mission => ({
        userId,
        missionId: mission.id,
        expiresAt: endOfDay,
        assignedAt: now
      })),
      skipDuplicates: true
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

  // Assign missions using batch insert
  if (selectedMissions.length > 0) {
    const now = new Date();
    await prisma.userMission.createMany({
      data: selectedMissions.map(mission => ({
        userId,
        missionId: mission.id,
        expiresAt: endOfWeek,
        assignedAt: now
      })),
      skipDuplicates: true
    });
  }
}

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function getEndOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

async function assignMonthlyMissions(userId: string, isCreator: boolean = false) {
  const startOfMonth = getStartOfMonth();
  const endOfMonth = getEndOfMonth();

  // Check if user already has monthly missions for this month
  const existingMonthly = await prisma.userMission.findFirst({
    where: {
      userId,
      assignedAt: { gte: startOfMonth, lte: endOfMonth },
      mission: { type: 'MONTHLY' }
    }
  });

  if (existingMonthly) return; // Already assigned

  // Get all monthly missions based on user type
  const fanMissions = await prisma.mission.findMany({
    where: { type: 'MONTHLY', isActive: true, forCreators: false }
  });

  const shuffledFan = fanMissions.sort(() => Math.random() - 0.5);
  const selectedMissions = shuffledFan.slice(0, 2); // 2 fan monthly missions

  // If user is a creator, also give them creator missions
  if (isCreator) {
    const creatorMissions = await prisma.mission.findMany({
      where: { type: 'MONTHLY', isActive: true, forCreators: true }
    });
    const shuffledCreator = creatorMissions.sort(() => Math.random() - 0.5);
    selectedMissions.push(...shuffledCreator.slice(0, 2)); // 2 creator monthly missions
  }

  // Assign missions using batch insert
  if (selectedMissions.length > 0) {
    const now = new Date();
    await prisma.userMission.createMany({
      data: selectedMissions.map(mission => ({
        userId,
        missionId: mission.id,
        expiresAt: endOfMonth,
        assignedAt: now
      })),
      skipDuplicates: true
    });
  }
}

async function assignAchievements(userId: string, isCreator: boolean = false) {
  // Get already assigned achievements for this user
  const existingAchievements = await prisma.userMission.findMany({
    where: {
      userId,
      mission: { type: 'ACHIEVEMENT' }
    },
    select: { missionId: true }
  });
  const existingIds = new Set(existingAchievements.map(a => a.missionId));

  // Far future expiry for achievements (they don't expire)
  const farFuture = new Date('2099-12-31');
  const now = new Date();

  // Get all achievements to assign
  const achievementsToAssign: { missionId: string }[] = [];

  // Assign fan achievements that haven't been assigned yet
  const fanAchievements = await prisma.mission.findMany({
    where: { type: 'ACHIEVEMENT', isActive: true, forCreators: false }
  });

  for (const achievement of fanAchievements) {
    if (!existingIds.has(achievement.id)) {
      achievementsToAssign.push({ missionId: achievement.id });
    }
  }

  // If user is a creator, also assign creator achievements
  if (isCreator) {
    const creatorAchievements = await prisma.mission.findMany({
      where: { type: 'ACHIEVEMENT', isActive: true, forCreators: true }
    });

    for (const achievement of creatorAchievements) {
      if (!existingIds.has(achievement.id)) {
        achievementsToAssign.push({ missionId: achievement.id });
      }
    }
  }

  // Batch insert all new achievements
  if (achievementsToAssign.length > 0) {
    await prisma.userMission.createMany({
      data: achievementsToAssign.map(a => ({
        userId,
        missionId: a.missionId,
        expiresAt: farFuture,
        assignedAt: now
      })),
      skipDuplicates: true
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

    // Ensure missions are assigned in parallel (creators get extra missions)
    await Promise.all([
      assignDailyMissions(userId, isCreator),
      assignWeeklyMissions(userId, isCreator),
      assignMonthlyMissions(userId, isCreator),
      assignAchievements(userId, isCreator)
    ]);

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

    const monthly = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'MONTHLY' && !um.mission.forCreators)
      .map(formatMission);

    const achievements = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'ACHIEVEMENT' && !um.mission.forCreators)
      .map(formatMission);

    // Creator-specific missions
    const creatorDaily = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'DAILY' && um.mission.forCreators)
      .map(formatMission);

    const creatorWeekly = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'WEEKLY' && um.mission.forCreators)
      .map(formatMission);

    const creatorMonthly = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'MONTHLY' && um.mission.forCreators)
      .map(formatMission);

    const creatorAchievements = userMissions
      .filter((um: UserMissionWithMission) => um.mission.type === 'ACHIEVEMENT' && um.mission.forCreators)
      .map(formatMission);

    res.json({
      daily,
      weekly,
      monthly,
      achievements,
      creatorDaily,
      creatorWeekly,
      creatorMonthly,
      creatorAchievements,
      summary: {
        dailyCompleted: daily.filter((m: { completed: boolean }) => m.completed).length,
        dailyTotal: daily.length,
        weeklyCompleted: weekly.filter((m: { completed: boolean }) => m.completed).length,
        weeklyTotal: weekly.length,
        monthlyCompleted: monthly.filter((m: { completed: boolean }) => m.completed).length,
        monthlyTotal: monthly.length,
        achievementsCompleted: achievements.filter((m: { completed: boolean }) => m.completed).length,
        achievementsTotal: achievements.length,
        creatorDailyCompleted: creatorDaily.filter((m: { completed: boolean }) => m.completed).length,
        creatorDailyTotal: creatorDaily.length,
        creatorWeeklyCompleted: creatorWeekly.filter((m: { completed: boolean }) => m.completed).length,
        creatorWeeklyTotal: creatorWeekly.length,
        creatorMonthlyCompleted: creatorMonthly.filter((m: { completed: boolean }) => m.completed).length,
        creatorMonthlyTotal: creatorMonthly.length,
        creatorAchievementsCompleted: creatorAchievements.filter((m: { completed: boolean }) => m.completed).length,
        creatorAchievementsTotal: creatorAchievements.length,
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
