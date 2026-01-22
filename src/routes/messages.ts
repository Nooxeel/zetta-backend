import { Router, Request, Response } from 'express'
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma'
import { authenticate, getUserId } from '../middleware/auth'
import { messageLimiter } from '../middleware/rateLimiter'
import { isAnyBlockBetweenUsers } from '../middleware/blockCheck'
import { io } from '../index'

const router = Router()
const logger = createLogger('Messages')

// Get all conversations for current user
router.get('/conversations', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { participant1Id: userId },
          { participant2Id: userId }
        ],
        status: 'active'
      },
      include: {
        participant1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            isCreator: true
          }
        },
        participant2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            isCreator: true
          }
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          where: { deletedAt: null },
          select: {
            id: true,
            content: true,
            type: true,
            createdAt: true,
            senderId: true
          }
        }
      },
      orderBy: { lastMessageAt: 'desc' }
    })

    // Transform to include unread count for current user
    const transformed = conversations.map(conv => {
      const isParticipant1 = conv.participant1Id === userId
      const otherUser = isParticipant1 ? conv.participant2 : conv.participant1
      const unreadCount = isParticipant1 ? conv.participant1Unread : conv.participant2Unread

      return {
        id: conv.id,
        otherUser,
        lastMessage: conv.messages[0] || null,
        unreadCount,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt
      }
    })

    res.json(transformed)
  } catch (error) {
    logger.error('Get conversations error:', error)
    res.status(500).json({ error: 'Failed to get conversations' })
  }
})

// Get or create conversation with a user
router.post('/conversations', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { recipientId } = req.body

    if (!recipientId) {
      return res.status(400).json({ error: 'recipientId is required' })
    }

    if (recipientId === userId) {
      return res.status(400).json({ error: 'Cannot start conversation with yourself' })
    }

    // Check if recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, username: true, displayName: true, avatar: true, isCreator: true }
    })

    if (!recipient) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if either user has blocked the other
    const blockCheck = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          // Check if recipient (as creator) blocked the current user
          {
            creator: { userId: recipientId },
            blockedUserId: userId
          },
          // Check if current user (as creator) blocked the recipient
          {
            creator: { userId: userId },
            blockedUserId: recipientId
          }
        ]
      }
    })

    if (blockCheck) {
      return res.status(403).json({ error: 'No puedes enviar mensajes a este usuario' })
    }

    // Check if conversation already exists (in either direction)
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { participant1Id: userId, participant2Id: recipientId },
          { participant1Id: recipientId, participant2Id: userId }
        ]
      },
      include: {
        participant1: {
          select: { id: true, username: true, displayName: true, avatar: true, isCreator: true }
        },
        participant2: {
          select: { id: true, username: true, displayName: true, avatar: true, isCreator: true }
        }
      }
    })

    if (!conversation) {
      // Create new conversation
      conversation = await prisma.conversation.create({
        data: {
          participant1Id: userId,
          participant2Id: recipientId
        },
        include: {
          participant1: {
            select: { id: true, username: true, displayName: true, avatar: true, isCreator: true }
          },
          participant2: {
            select: { id: true, username: true, displayName: true, avatar: true, isCreator: true }
          }
        }
      })
    }

    const isParticipant1 = conversation.participant1Id === userId
    const otherUser = isParticipant1 ? conversation.participant2 : conversation.participant1

    res.json({
      id: conversation.id,
      otherUser,
      unreadCount: isParticipant1 ? conversation.participant1Unread : conversation.participant2Unread,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt
    })
  } catch (error) {
    logger.error('Create conversation error:', error)
    // SECURITY: Don't expose error details in production
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Failed to create conversation' 
      : `Failed to create conversation: ${(error as any).message}`
    res.status(500).json({ error: errorMessage })
  }
})

// Get messages in a conversation
router.get('/conversations/:conversationId/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { conversationId } = req.params
    const { cursor, limit = '50' } = req.query

    // Verify user is participant
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
      return res.status(403).json({ error: 'Not authorized to view this conversation' })
    }

    // SECURITY: Check if there's a block between participants
    const otherParticipantId = conversation.participant1Id === userId 
      ? conversation.participant2Id 
      : conversation.participant1Id
    
    const isBlocked = await isAnyBlockBetweenUsers(userId, otherParticipantId)
    if (isBlocked) {
      return res.status(403).json({ 
        error: 'This conversation is no longer available',
        code: 'USER_BLOCKED'
      })
    }

    // Get messages with cursor-based pagination
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor as string) } } : {})
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string)
    })

    // Mark messages as read
    const isParticipant1 = conversation.participant1Id === userId
    await prisma.$transaction([
      // Update unread count to 0
      prisma.conversation.update({
        where: { id: conversationId },
        data: isParticipant1 
          ? { participant1Unread: 0 }
          : { participant2Unread: 0 }
      }),
      // Mark messages from other user as read
      prisma.message.updateMany({
        where: {
          conversationId,
          senderId: { not: userId },
          readAt: null
        },
        data: { readAt: new Date() }
      })
    ])

    res.json({
      messages: messages.reverse(), // Return in chronological order
      nextCursor: messages.length === parseInt(limit as string) 
        ? messages[0].createdAt.toISOString() 
        : null
    })
  } catch (error) {
    logger.error('Get messages error:', error)
    res.status(500).json({ error: 'Failed to get messages' })
  }
})

// Send a message
router.post('/conversations/:conversationId/messages', messageLimiter, authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { conversationId } = req.params
    const { content, type = 'TEXT', price } = req.body

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Content is required' })
    }

    // Verify user is participant
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
      return res.status(403).json({ error: 'Not authorized to send messages in this conversation' })
    }

    // Check if conversation is blocked
    if (conversation.status === 'blocked') {
      return res.status(403).json({ error: 'Esta conversación ha sido bloqueada' })
    }

    const otherUserId = conversation.participant1Id === userId 
      ? conversation.participant2Id 
      : conversation.participant1Id

    // Check if either user has blocked the other
    const blockCheck = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          // Check if other user (as creator) blocked the current user
          {
            creator: { userId: otherUserId },
            blockedUserId: userId
          },
          // Check if current user (as creator) blocked the other user
          {
            creator: { userId: userId },
            blockedUserId: otherUserId
          }
        ]
      }
    })

    if (blockCheck) {
      return res.status(403).json({ error: 'No puedes enviar mensajes a este usuario' })
    }

    const isParticipant1 = conversation.participant1Id === userId

    // Create message and update conversation in transaction
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: content.trim(),
          type,
          price: type === 'PAID_CONTENT' ? price : null
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          }
        }
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          // Increment unread count for the OTHER participant
          ...(isParticipant1
            ? { participant2Unread: { increment: 1 } }
            : { participant1Unread: { increment: 1 } }
          )
        }
      })
    ])

    logger.debug('[Messages] Message created:', message.id)
    logger.debug('[Messages] Emitting to conversation:', conversationId)
    logger.debug('[Messages] Recipient ID:', isParticipant1 ? conversation.participant2Id : conversation.participant1Id)

    // Emit WebSocket event to conversation room
    io.to(`conversation:${conversationId}`).emit('message:new', message)

    // Emit unread count update to the recipient
    const recipientId = isParticipant1 ? conversation.participant2Id : conversation.participant1Id
    const newUnreadCount = isParticipant1 ? conversation.participant2Unread + 1 : conversation.participant1Unread + 1
    
    logger.debug('[Messages] Emitting unread:update to user:', recipientId, 'count:', newUnreadCount)
    io.to(`user:${recipientId}`).emit('unread:update', {
      conversationId,
      unreadCount: newUnreadCount
    })

    // Track mission progress for creators sending messages to fans
    try {
      const sender = await prisma.user.findUnique({
        where: { id: userId },
        select: { isCreator: true }
      })
      
      if (sender?.isCreator) {
        // Find and update creator's dm_fan missions
        const now = new Date()
        const userMissions = await prisma.userMission.findMany({
          where: {
            userId,
            completed: false,
            expiresAt: { gt: now },
            mission: {
              actionType: 'dm_fan',
              isActive: true,
              forCreators: true
            }
          },
          include: { mission: true }
        })
        
        for (const um of userMissions) {
          const newProgress = Math.min(um.progress + 1, um.mission.targetCount)
          const completed = newProgress >= um.mission.targetCount
          
          await prisma.userMission.update({
            where: { id: um.id },
            data: {
              progress: newProgress,
              completed,
              completedAt: completed ? new Date() : null
            }
          })
        }
      }
    } catch (missionError) {
      // Don't fail the message send if mission tracking fails
      logger.warn('Failed to track dm_fan mission:', missionError)
    }

    res.status(201).json(message)
  } catch (error) {
    logger.error('Send message error:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// Get total unread count
router.get('/unread-count', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { participant1Id: userId },
          { participant2Id: userId }
        ],
        status: 'active'
      },
      select: {
        participant1Id: true,
        participant1Unread: true,
        participant2Unread: true
      }
    })

    const totalUnread = conversations.reduce((sum: number, conv: { participant1Id: string; participant1Unread: number; participant2Unread: number }) => {
      const isParticipant1 = conv.participant1Id === userId
      return sum + (isParticipant1 ? conv.participant1Unread : conv.participant2Unread)
    }, 0)

    res.json({ unread: totalUnread })
  } catch (error) {
    logger.error('Get unread count error:', error)
    res.status(500).json({ error: 'Failed to get unread count' })
  }
})

// Delete a message (soft delete)
router.delete('/messages/:messageId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { messageId } = req.params

    const message = await prisma.message.findUnique({
      where: { id: messageId }
    })

    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    if (message.senderId !== userId) {
      return res.status(403).json({ error: 'Can only delete your own messages' })
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() }
    })

    res.json({ success: true })
  } catch (error) {
    logger.error('Delete message error:', error)
    res.status(500).json({ error: 'Failed to delete message' })
  }
})

// Archive/block conversation
router.patch('/conversations/:conversationId/status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { conversationId } = req.params
    const { status } = req.body // 'active', 'archived', 'blocked'

    if (!['active', 'archived', 'blocked'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status }
    })

    res.json({ success: true })
  } catch (error) {
    logger.error('Update conversation status error:', error)
    res.status(500).json({ error: 'Failed to update conversation' })
  }
})

export default router

