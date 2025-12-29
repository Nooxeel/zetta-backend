#!/usr/bin/env node
/**
 * Crear usuarios de prueba en Railway PostgreSQL
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const RAILWAY_URL = process.env.RAILWAY_DATABASE_URL;

if (!RAILWAY_URL) {
  console.error('❌ Falta RAILWAY_DATABASE_URL');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: RAILWAY_URL } }
});

async function seed() {
  console.log('🌱 Creando datos de prueba...\n');

  try {
    // Usuario creador gatitaveve
    const hashedPassword1 = await bcrypt.hash('test1234', 10);
    const user1 = await prisma.user.upsert({
      where: { email: 'test@apapacho.com' },
      update: {},
      create: {
        id: '466b26a6-9abd-4693-8aec-8a17894ac48b',
        email: 'test@apapacho.com',
        username: 'gatitaveve',
        displayName: 'Gatita Veve',
        password: hashedPassword1,
        isCreator: true
      }
    });
    console.log('✅ Usuario creador: test@apapacho.com / test1234');

    // Creator profile
    await prisma.creator.upsert({
      where: { userId: user1.id },
      update: {},
      create: {
        userId: user1.id,
        bio: 'Creadora de contenido',
        profileImage: '/images/466b26a6-9abd-4693-8aec-8a17894ac48b/profile.jpeg'
      }
    });
    console.log('✅ Perfil de creador creado\n');

    // Usuario creador Zippy
    const hashedPassword2 = await bcrypt.hash('Zippy123!', 10);
    const user2 = await prisma.user.upsert({
      where: { email: 'zippy@apapacho.com' },
      update: {},
      create: {
        email: 'zippy@apapacho.com',
        username: 'zippy',
        displayName: 'Zippy',
        password: hashedPassword2,
        isCreator: true
      }
    });
    console.log('✅ Usuario creador: zippy@apapacho.com / Zippy123!');

    // Creator profile Zippy
    await prisma.creator.upsert({
      where: { userId: user2.id },
      update: {},
      create: {
        userId: user2.id,
        bio: 'Creador de contenido Zippy'
      }
    });
    console.log('✅ Perfil de creador Zippy creado\n');

    // Usuario fan
    const hashedPassword3 = await bcrypt.hash('Test1234!', 10);
    const user3 = await prisma.user.upsert({
      where: { email: 'fan@test.com' },
      update: {},
      create: {
        email: 'fan@test.com',
        username: 'fantest',
        displayName: 'Fan Test',
        password: hashedPassword3,
        isCreator: false
      }
    });
    console.log('✅ Usuario fan: fan@test.com / Test1234!\n');

    console.log('✨ ¡3 usuarios creados exitosamente!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
