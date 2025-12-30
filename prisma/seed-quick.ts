import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function seed() {
  const password = await bcrypt.hash('test1234', 10)
  
  // User 1: test@apapacho.com (creator)
  const user1 = await prisma.user.create({
    data: {
      email: 'test@apapacho.com',
      username: 'gatitaveve',
      displayName: 'Gatita Veve',
      password,
      isCreator: true,
      creatorProfile: {
        create: {
          bio: 'Hola! Soy una creadora de contenido 💕',
          accentColor: '#d946ef'
        }
      }
    }
  })
  
  // User 2: zippy@apapacho.com (creator)
  const user2 = await prisma.user.create({
    data: {
      email: 'zippy@apapacho.com',
      username: 'zippy',
      displayName: 'Zippy',
      password: await bcrypt.hash('Zippy123!', 10),
      isCreator: true,
      creatorProfile: {
        create: {
          bio: 'Developer & Creator',
          accentColor: '#22d3ee'
        }
      }
    }
  })
  
  console.log('✅ Usuarios creados:', user1.email, user2.email)
}

seed().catch(console.error).finally(() => prisma.$disconnect())
