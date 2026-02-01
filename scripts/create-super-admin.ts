/**
 * Script para crear el super usuario admin secreto
 * 
 * Uso:
 * SUPER_ADMIN_EMAIL=admin@secret.com SUPER_ADMIN_PASSWORD=superSecretPass npm run create-admin
 * 
 * IMPORTANTE: Este usuario NO aparecerá en listados públicos
 */

import bcrypt from 'bcryptjs'
import prisma from '../src/lib/prisma'
import { createLogger } from '../src/lib/logger'

const logger = createLogger('CreateAdmin')

async function createSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL
  const password = process.env.SUPER_ADMIN_PASSWORD
  const username = process.env.SUPER_ADMIN_USERNAME || 'superadmin'
  const displayName = process.env.SUPER_ADMIN_DISPLAY_NAME || 'System Admin'

  if (!email || !password) {
    logger.error('❌ SUPER_ADMIN_EMAIL y SUPER_ADMIN_PASSWORD son requeridos')
    logger.error('Uso: SUPER_ADMIN_EMAIL=admin@secret.com SUPER_ADMIN_PASSWORD=superSecretPass npm run create-admin')
    process.exit(1)
  }

  if (password.length < 12) {
    logger.error('❌ La contraseña debe tener al menos 12 caracteres')
    process.exit(1)
  }

  try {
    // Verificar si ya existe
    const existingAdmin = await prisma.user.findFirst({
      where: {
        role: 'SUPER_ADMIN'
      }
    })

    if (existingAdmin) {
      logger.warn('⚠️  Ya existe un super admin')
      logger.info('Email:', existingAdmin.email)
      logger.info('Username:', existingAdmin.username)
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      })

      readline.question('¿Deseas crear otro super admin? (s/N): ', async (answer: string) => {
        readline.close()
        
        if (answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'y') {
          logger.info('Operación cancelada')
          process.exit(0)
        }

        await createAdmin()
      })

      return
    }

    await createAdmin()

  } catch (error) {
    logger.error('Error creando super admin:', error)
    process.exit(1)
  }

  async function createAdmin() {
    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(password!, 10)

      // Crear usuario
      const admin = await prisma.user.create({
        data: {
          email: email!,
          username,
          displayName,
          password: hashedPassword,
          role: 'SUPER_ADMIN',
          isCreator: false,
          ageVerified: true, // Auto-verificado
          emailVerified: true, // Auto-verificado
          ageVerifiedAt: new Date(),
          emailVerifiedAt: new Date()
        }
      })

      logger.info('✅ Super admin creado exitosamente!')
      logger.info('')
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      logger.info('📋 Credenciales del Super Admin:')
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      logger.info(`Email:    ${admin.email}`)
      logger.info(`Username: ${admin.username}`)
      logger.info(`ID:       ${admin.id}`)
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      logger.info('')
      logger.info('🔒 Este usuario es secreto y NO aparecerá en listados públicos')
      logger.info('🛡️  Endpoints de moderación disponibles en /api/admin/moderation/*')
      logger.info('')
      logger.warn('⚠️  GUARDA ESTAS CREDENCIALES EN UN LUGAR SEGURO')
      
      process.exit(0)
    } catch (error: any) {
      if (error.code === 'P2002') {
        logger.error('❌ Ya existe un usuario con ese email o username')
      } else {
        logger.error('Error creando super admin:', error)
      }
      process.exit(1)
    }
  }
}

createSuperAdmin()
