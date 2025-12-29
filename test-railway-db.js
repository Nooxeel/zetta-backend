const { PrismaClient } = require('@prisma/client');

const DATABASE_URL = 'postgresql://postgres:fPaQUyQpFxkYYWLyMaeXFutXMQRmbuBS@metro.proxy.rlwy.net:22773/railway';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function testConnection() {
  try {
    console.log('🔍 Probando conexión a Railway PostgreSQL...\n');
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Conexión exitosa a la base de datos\n');
    
    // Check users
    const users = await prisma.user.findMany({
      select: { id: true, email: true, username: true, isCreator: true }
    });
    console.log(`📊 Usuarios encontrados: ${users.length}`);
    users.forEach(u => console.log(`  - ${u.email} (${u.username}) ${u.isCreator ? '[Creator]' : '[Fan]'}`));
    
    // Check creators
    const creators = await prisma.creator.findMany({
      select: { id: true, userId: true, displayName: true }
    });
    console.log(`\n🎨 Creadores encontrados: ${creators.length}`);
    creators.forEach(c => console.log(`  - ${c.displayName}`));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
