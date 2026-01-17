#!/usr/bin/env node
/**
 * Script para ejecutar migraciones SQL en Railway PostgreSQL
 * Uso: DATABASE_URL="postgresql://..." node run-migration.js migrations/add_age_verification_fields.sql
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Uso: node run-migration.js <migration-file.sql>');
  process.exit(1);
}

const prisma = new PrismaClient();

async function runMigration() {
  try {
    const sqlPath = path.resolve(migrationFile);
    
    if (!fs.existsSync(sqlPath)) {
      console.error(`❌ Archivo no encontrado: ${sqlPath}`);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log(`🚀 Ejecutando migración: ${migrationFile}`);
    console.log('─'.repeat(50));
    
    // Split by semicolon and filter empty statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.length > 0) {
        console.log(`\n📝 Ejecutando: ${statement.substring(0, 60)}...`);
        try {
          await prisma.$executeRawUnsafe(statement);
          console.log('   ✅ OK');
        } catch (err) {
          // Ignore "already exists" errors
          if (err.message.includes('already exists') || err.message.includes('duplicate')) {
            console.log('   ⚠️  Ya existe, saltando...');
          } else {
            console.error(`   ❌ Error: ${err.message}`);
          }
        }
      }
    }
    
    console.log('\n' + '─'.repeat(50));
    console.log('✅ Migración completada');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
