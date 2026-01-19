#!/usr/bin/env node

/**
 * Database Backup Script for Apapacho
 * 
 * This script creates a backup of the PostgreSQL database and uploads it to Cloudinary.
 * Can be run manually or as a scheduled cron job.
 * 
 * Usage:
 *   node scripts/backup-db.js
 * 
 * Environment Variables Required:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *   - BACKUP_WEBHOOK_URL (optional): URL to notify on backup completion
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Only run if we have the required env vars
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set')
  process.exit(1)
}

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFileName = `apapacho-backup-${timestamp}.sql`
  const backupPath = `/tmp/${backupFileName}`

  console.log(`Starting backup: ${backupFileName}`)

  try {
    // 1. Create PostgreSQL dump
    console.log('Creating database dump...')
    execSync(`pg_dump "${process.env.DATABASE_URL}" > ${backupPath}`, {
      stdio: 'inherit'
    })

    const stats = fs.statSync(backupPath)
    console.log(`Backup created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

    // 2. Compress the backup
    console.log('Compressing backup...')
    execSync(`gzip ${backupPath}`)
    const compressedPath = `${backupPath}.gz`

    // 3. Upload to Cloudinary (as raw file)
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      console.log('Uploading to Cloudinary...')
      const cloudinary = require('cloudinary').v2
      
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      })

      const result = await cloudinary.uploader.upload(compressedPath, {
        resource_type: 'raw',
        folder: 'apapacho-backups',
        public_id: backupFileName.replace('.sql', ''),
        overwrite: true
      })

      console.log('Uploaded to Cloudinary:', result.secure_url)
    }

    // 4. Clean up local file
    fs.unlinkSync(compressedPath)
    console.log('Local backup file cleaned up')

    // 5. Notify webhook if configured
    if (process.env.BACKUP_WEBHOOK_URL) {
      const response = await fetch(process.env.BACKUP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'success',
          backup: backupFileName,
          timestamp: new Date().toISOString(),
          size: stats.size
        })
      })
      console.log('Webhook notified:', response.status)
    }

    console.log('✅ Backup completed successfully!')
    return { success: true, fileName: backupFileName }

  } catch (error) {
    console.error('❌ Backup failed:', error.message)
    
    // Notify webhook of failure
    if (process.env.BACKUP_WEBHOOK_URL) {
      await fetch(process.env.BACKUP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }).catch(() => {})
    }

    throw error
  }
}

// Run backup
backup()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
