#!/usr/bin/env node
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const RAILWAY_URL = process.env.RAILWAY_DATABASE_URL;

if (!RAILWAY_URL) {
  console.error('❌ Falta RAILWAY_DATABASE_URL');
  process.exit(1);
}

async function migrate() {
  console.log('🚀 Iniciando migración simple...\n');

  // Conectar a SQLite
  const sqlite = new PrismaClient({
    datasources: { db: { url: 'file:./prisma/dev.db' } }
  });

  // Conectar a PostgreSQL
  const pg = new PrismaClient({
    datasources: { db: { url: RAILWAY_URL } }
  });

  try {
    // 1. Usuarios
    console.log('📦 Migrando usuarios...');
    const users = await sqlite.user.findMany();
    for (const user of users) {
      await pg.user.upsert({
        where: { id: user.id },
        update: {},
        create: user
      });
    }
    console.log(`✅ ${users.length} usuarios migrados\n`);

    // 2. Creadores
    console.log('🎨 Migrando creadores...');
    const creators = await sqlite.creator.findMany({ include: { musicTracks: true, socialLinks: true, subscriptionTiers: true } });
    for (const creator of creators) {
      const { musicTracks, socialLinks, subscriptionTiers, ...creatorData } = creator;
      await pg.creator.upsert({
        where: { userId: creator.userId },
        update: {},
        create: creatorData
      });

      // Music tracks
      for (const track of musicTracks) {
        await pg.musicTrack.upsert({
          where: { id: track.id },
          update: {},
          create: track
        });
      }

      // Social links
      for (const link of socialLinks) {
        await pg.socialLink.upsert({
          where: { id: link.id },
          update: {},
          create: link
        });
      }

      // Subscription tiers
      for (const tier of subscriptionTiers) {
        await pg.subscriptionTier.upsert({
          where: { id: tier.id },
          update: {},
          create: tier
        });
      }
    }
    console.log(`✅ ${creators.length} creadores migrados\n`);

    // 3. Posts
    console.log('📝 Migrando posts...');
    const posts = await sqlite.post.findMany();
    for (const post of posts) {
      await pg.post.upsert({
        where: { id: post.id },
        update: {},
        create: post
      });
    }
    console.log(`✅ ${posts.length} posts migrados\n`);

    // 4. Comentarios
    console.log('💬 Migrando comentarios...');
    const comments = await sqlite.comment.findMany();
    for (const comment of comments) {
      await pg.comment.upsert({
        where: { id: comment.id },
        update: {},
        create: comment
      });
    }
    console.log(`✅ ${comments.length} comentarios migrados\n`);

    // 5. Favoritos
    console.log('⭐ Migrando favoritos...');
    const favorites = await sqlite.favorite.findMany();
    for (const fav of favorites) {
      await pg.favorite.upsert({
        where: { userId_creatorId: { userId: fav.userId, creatorId: fav.creatorId } },
        update: {},
        create: fav
      });
    }
    console.log(`✅ ${favorites.length} favoritos migrados\n`);

    console.log('✨ ¡Migración completada!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await sqlite.$disconnect();
    await pg.$disconnect();
  }
}

migrate();
