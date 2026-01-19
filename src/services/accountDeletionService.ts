/**
 * Account Deletion Service
 * 
 * Handles user account deletion with legal compliance:
 * - Verifies creator has no pending balance
 * - Cancels active subscriptions (no refund)
 * - Anonymizes financial records (6 year retention for tax law)
 * - Deletes personal data
 * 
 * Chilean Law Requirements:
 * - Código Tributario Art. 17: Keep financial records 6 years
 * - Ley 19.628: Right to data deletion
 * - Ley 19.496: Cannot retain funds that belong to user
 */

import prisma from '../lib/prisma';
import { getCreatorBalance } from './ledgerService';
import { createLogger } from '../lib/logger';
import crypto from 'crypto';

const logger = createLogger('AccountDeletion');

// Generate anonymous identifier for records
function generateAnonymousId(): string {
  return `DELETED_${crypto.randomBytes(8).toString('hex')}`;
}

export interface DeletionPrecheck {
  canDelete: boolean;
  blockers: string[];
  warnings: string[];
  stats: {
    activeSubscriptions: number;
    pendingBalance: number;
    totalPosts: number;
    totalMessages: number;
  };
}

/**
 * Check if user can delete their account
 */
export async function checkAccountDeletion(userId: string): Promise<DeletionPrecheck> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  
  // Get user with creator profile
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      creatorProfile: true,
      subscriptions: {
        where: { status: 'active' }
      }
    }
  });

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  // Stats
  let pendingBalance = 0;
  let totalPosts = 0;
  let totalMessages = 0;

  // Check if creator with pending balance
  if (user.creatorProfile) {
    try {
      const balance = await getCreatorBalance(user.creatorProfile.id);
      pendingBalance = Number(balance.payable);
      
      if (pendingBalance > 0) {
        blockers.push(`Tienes un balance pendiente de $${pendingBalance.toLocaleString('es-CL')} CLP. Debes retirar tus fondos antes de eliminar la cuenta.`);
      }
    } catch (error) {
      // If ledger system not configured, assume no balance
      logger.warn('Could not check creator balance (ledger not configured)');
    }

    // Count posts
    totalPosts = await prisma.post.count({
      where: { creatorId: user.creatorProfile.id }
    });

    if (totalPosts > 0) {
      warnings.push(`Se eliminarán ${totalPosts} publicaciones permanentemente.`);
    }

    // Check active subscribers
    const activeSubscribers = await prisma.subscription.count({
      where: { 
        creatorId: user.creatorProfile.id,
        status: 'active'
      }
    });

    if (activeSubscribers > 0) {
      warnings.push(`${activeSubscribers} suscriptores activos perderán acceso a tu contenido.`);
    }
  }

  // Count messages
  totalMessages = await prisma.message.count({
    where: { senderId: userId }
  });

  if (totalMessages > 0) {
    warnings.push(`Se eliminarán ${totalMessages} mensajes enviados.`);
  }

  // Active subscriptions as fan
  if (user.subscriptions.length > 0) {
    warnings.push(`${user.subscriptions.length} suscripción(es) activa(s) serán canceladas sin reembolso.`);
  }

  return {
    canDelete: blockers.length === 0,
    blockers,
    warnings,
    stats: {
      activeSubscriptions: user.subscriptions.length,
      pendingBalance,
      totalPosts,
      totalMessages
    }
  };
}

/**
 * Delete user account with all data
 */
export async function deleteUserAccount(
  userId: string, 
  password: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  
  // 1. Verify user exists and password is correct
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      creatorProfile: true
    }
  });

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  // Verify password
  const bcrypt = await import('bcryptjs');
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new Error('Contraseña incorrecta');
  }

  // 2. Pre-check deletion eligibility
  const precheck = await checkAccountDeletion(userId);
  if (!precheck.canDelete) {
    throw new Error(precheck.blockers.join(' '));
  }

  const anonymousId = generateAnonymousId();

  // 3. Execute deletion in transaction
  await prisma.$transaction(async (tx) => {
    const creatorId = user.creatorProfile?.id;

    // === CANCEL SUBSCRIPTIONS (as fan) ===
    await tx.subscription.updateMany({
      where: { userId, status: 'active' },
      data: { 
        status: 'cancelled',
        autoRenew: false,
        endDate: new Date()
      }
    });

    // === CANCEL SUBSCRIPTIONS (as creator) ===
    if (creatorId) {
      await tx.subscription.updateMany({
        where: { creatorId, status: 'active' },
        data: { 
          status: 'cancelled',
          autoRenew: false,
          endDate: new Date()
        }
      });
    }

    // === ANONYMIZE FINANCIAL RECORDS (keep for 6 years) ===
    // Donations received (as creator)
    if (creatorId) {
      await tx.donation.updateMany({
        where: { toCreatorId: creatorId },
        data: { message: null } // Remove personal messages
      });
    }

    // Donations sent (as fan) - anonymize sender
    await tx.donation.updateMany({
      where: { fromUserId: userId },
      data: { 
        message: null,
        isAnonymous: true 
      }
    });

    // Transactions - keep but remove metadata
    if (creatorId) {
      await tx.transaction.updateMany({
        where: { creatorId },
        data: { metadata: {} }
      });
    }

    // === DELETE PERSONAL DATA ===
    
    // Delete messages
    await tx.message.deleteMany({
      where: { senderId: userId }
    });

    // Delete conversations where user is participant
    await tx.conversation.deleteMany({
      where: {
        OR: [
          { participant1Id: userId },
          { participant2Id: userId }
        ]
      }
    });

    // Delete comments sent
    await tx.comment.deleteMany({
      where: { userId }
    });

    // Delete post comments
    await tx.postComment.deleteMany({
      where: { userId }
    });

    // Delete favorites
    await tx.favorite.deleteMany({
      where: { userId }
    });

    // Delete user interests
    await tx.userInterest.deleteMany({
      where: { userId }
    });

    // Delete saved cards
    await tx.savedCard.deleteMany({
      where: { userId }
    });

    // Delete refresh tokens
    await tx.$executeRaw`DELETE FROM "RefreshToken" WHERE "userId" = ${userId}`;

    // Delete password reset tokens
    await tx.passwordResetToken.deleteMany({
      where: { userId }
    });

    // Delete email verification tokens
    await tx.emailVerificationToken.deleteMany({
      where: { userId }
    });

    // === DELETE CREATOR DATA ===
    if (creatorId) {
      // Delete posts (cascade deletes likes, comments)
      await tx.post.deleteMany({
        where: { creatorId }
      });

      // Delete music tracks
      await tx.musicTrack.deleteMany({
        where: { creatorId }
      });

      // Delete social links
      await tx.socialLink.deleteMany({
        where: { creatorId }
      });

      // Delete subscription tiers (subscriptions already cancelled)
      // Note: Can't delete if there are historical subscriptions referencing them
      // So we just deactivate them
      await tx.subscriptionTier.updateMany({
        where: { creatorId },
        data: { isActive: false }
      });

      // Delete bank accounts (sensitive data)
      await tx.creatorBankAccount.deleteMany({
        where: { creatorId }
      });

      // Delete products
      await tx.product.updateMany({
        where: { creatorId },
        data: { 
          isActive: false,
          deletedAt: new Date()
        }
      });

      // Delete comments received
      await tx.comment.deleteMany({
        where: { creatorId }
      });

      // Delete audit logs
      await tx.profileAuditLog.deleteMany({
        where: { creatorId }
      });

      // Delete creator interests
      await tx.creatorInterest.deleteMany({
        where: { creatorId }
      });

      // Delete blocked users
      await tx.blockedUser.deleteMany({
        where: { creatorId }
      });

      // Anonymize creator profile (keep for historical references)
      await tx.creator.update({
        where: { id: creatorId },
        data: {
          bio: null,
          bioTitle: 'Cuenta eliminada',
          extendedInfo: null,
          profileImage: null,
          coverImage: null,
          backgroundImage: null,
          status: 'DELETED' as any // Will need to add this enum value
        }
      });
    }

    // === ANONYMIZE USER (keep ID for foreign key integrity) ===
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `${anonymousId}@deleted.apapacho.app`,
        username: anonymousId,
        password: crypto.randomBytes(32).toString('hex'), // Randomize password
        displayName: 'Usuario Eliminado',
        avatar: null,
        bio: null,
        coverImage: null,
        birthdate: null,
        ageVerified: false,
        ageVerifiedAt: null,
        ageVerificationIp: null,
        emailVerified: false,
        emailVerifiedAt: null,
        referralCode: null
      }
    });

    // Log deletion for audit
    logger.info(`Account deleted: ${userId} -> ${anonymousId}`, {
      reason,
      hadCreatorProfile: !!creatorId,
      stats: {
        subscriptionsCancelled: user.creatorProfile 
          ? await tx.subscription.count({ where: { creatorId } })
          : 0
      }
    });
  });

  return {
    success: true,
    message: 'Tu cuenta ha sido eliminada permanentemente. Lamentamos verte partir.'
  };
}

/**
 * Export user data (GDPR compliance)
 */
export async function exportUserData(userId: string): Promise<object> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      creatorProfile: {
        include: {
          socialLinks: true,
          subscriptionTiers: true,
          posts: {
            select: {
              id: true,
              title: true,
              description: true,
              visibility: true,
              createdAt: true
            }
          }
        }
      },
      subscriptions: {
        include: {
          tier: { select: { name: true, price: true } },
          creator: { 
            select: { 
              user: { select: { username: true } } 
            } 
          }
        }
      },
      donationsSent: {
        select: {
          amount: true,
          currency: true,
          message: true,
          createdAt: true,
          toCreator: {
            select: { user: { select: { username: true } } }
          }
        }
      },
      favorites: {
        include: {
          creator: {
            select: { user: { select: { username: true } } }
          }
        }
      },
      comments: {
        select: {
          content: true,
          createdAt: true,
          isApproved: true
        }
      },
      interests: {
        include: {
          interest: { select: { name: true, category: true } }
        }
      }
    }
  });

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  // Remove sensitive fields
  const { password, ...safeUser } = user;

  return {
    exportedAt: new Date().toISOString(),
    user: {
      email: safeUser.email,
      username: safeUser.username,
      displayName: safeUser.displayName,
      bio: safeUser.bio,
      createdAt: safeUser.createdAt,
      isCreator: safeUser.isCreator
    },
    creatorProfile: safeUser.creatorProfile ? {
      bio: safeUser.creatorProfile.bio,
      socialLinks: safeUser.creatorProfile.socialLinks,
      subscriptionTiers: safeUser.creatorProfile.subscriptionTiers,
      postsCount: safeUser.creatorProfile.posts.length
    } : null,
    subscriptions: safeUser.subscriptions.map(s => ({
      creator: s.creator.user.username,
      tier: s.tier.name,
      price: s.tier.price,
      status: s.status,
      startDate: s.startDate
    })),
    donations: safeUser.donationsSent.map(d => ({
      to: d.toCreator.user.username,
      amount: d.amount,
      currency: d.currency,
      date: d.createdAt
    })),
    favorites: safeUser.favorites.map(f => f.creator.user.username),
    comments: safeUser.comments,
    interests: safeUser.interests.map(i => i.interest.name)
  };
}
