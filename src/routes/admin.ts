import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('Admin')

/**
 * GET /api/admin/users
 *
 * List all registered users (admin only).
 */
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        image: u.image,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
      })),
      count: users.length,
    })
  } catch (error: any) {
    logger.error('Failed to list users:', error)
    res.status(500).json({ error: 'Failed to list users', details: error.message })
  }
})

/**
 * PATCH /api/admin/users/:id/role
 *
 * Update a user's role. Body: { role: "ADMIN" | "BASIC" }
 */
router.patch('/users/:id/role', async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { role } = req.body

  if (!role || !['ADMIN', 'BASIC'].includes(role)) {
    res.status(400).json({ error: 'Invalid role. Must be ADMIN or BASIC.' })
    return
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { role },
    })

    logger.info(`Role updated: ${user.email} → ${role} (by ${req.user!.email})`)

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    })
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'User not found' })
      return
    }
    logger.error('Failed to update user role:', error)
    res.status(500).json({ error: 'Failed to update user role', details: error.message })
  }
})

/**
 * DELETE /api/admin/users/:id
 *
 * Delete a user. Cannot delete yourself.
 */
router.delete('/users/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string

  if (id === req.user!.userId) {
    res.status(400).json({ error: 'Cannot delete your own account' })
    return
  }

  try {
    const user = await prisma.user.delete({ where: { id } })
    logger.info(`User deleted: ${user.email} (by ${req.user!.email})`)
    res.json({ message: `User ${user.email} deleted` })
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'User not found' })
      return
    }
    logger.error('Failed to delete user:', error)
    res.status(500).json({ error: 'Failed to delete user', details: error.message })
  }
})

export default router
