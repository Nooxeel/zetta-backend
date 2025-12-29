#!/usr/bin/env node
/**
 * Script para migrar datos de SQLite local a PostgreSQL en Railway
 * Uso: RAILWAY_DATABASE_URL="postgresql://..." node migrate-to-railway.js
 */

const { PrismaClient } = require('@prisma/client');

if (!process.env.RAILWAY_DATABASE_URL) {
  console.error('❌ Error: Falta la variable RAILWAY_DATABASE_URL');
  process.exit(1);
}

// Guardar la URL de Railway
const railwayUrl = process.env.RAILWAY_DATABASE_URL;

// Configurar SQLite (sin env var)
process.env.DATABASE_URL = 'file:./prisma/dev.db';
const sqlite = new PrismaClient();

// Configurar PostgreSQL
process.env.DATABASE_URL = railwayUrl;
const postgres = new PrismaClient();

async function migrate() {
  try {
    console.log('🚀 Iniciando migración...\n');

    // 1. Usuarios
    console.log('📦 Migrando usuarios...');
    const users = await sqlite.user.findMany();
    for (const user of users) {
      await postgres.user.upsert({
        where: { id: user.id },
        update: user,
        create: user
      });
    }
    console.log(`✅ ${users.length} usuarios migrados\n`);

    // 2. Creadores
    console.log('🎨 Migrando creadores...');
    const creators = await sqlite.creator.findMany();
    for (const creator of creators) {
      await postgres.creator.upsert({
        where: { userId: creator.userId },
        update: creator,
        create: creator
      });
    }
    console.log(`✅ ${creators.length} creadores migrados\n`);

    // 3. Posts
    console.log('📝 Migrando posts...');
    const posts = await sqlite.post.findMany();
    for (const post of posts) {
      await postgres.post.upsert({
        where: { id: post.id },
        update: post,
        create: post
      });
    }
    console.log(`✅ ${posts.length} posts migrados\n`);

    // 4. Comentarios
    console.log('💬 Migrando comentarios...');
    const comments = await sqlite.comment.findMany();
    for (const comment of comments) {
      await postgres.comment.upsert({
        where: { id: comment.id },
        update: comment,
        create: comment
      });
    }
    console.log(`✅ ${comments.length} comentarios migrados\n`);

    // 5. Favoritos
    console.log('⭐ Migrando favoritos...');
    const favorites = await sqlite.favorite.findMany();
    for (const favorite of favorites) {
      await postgres.favorite.upsert({
        where: { 
          userId_creatorId: {
            userId: favorite.userId,
            creatorId: favorite.creatorId
          }
        },
        update: favorite,
        create: favorite
      });
    }
    console.log(`✅ ${favorites.length} favoritos migrados\n`);

    console.log('✨ ¡Migración completada exitosamente!');
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    process.exit(1);
  } finally {
    await sqlite.$disconnect();
    await postgres.$disconnect();
  }
}

migrate();
