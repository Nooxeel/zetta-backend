/**
 * Seed script for SERVITPLUS demo account
 * Cliente: Servitplus - Gasfitería Integral
 * Técnico: Juan Carlos Pulido
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Creating SERVITPLUS demo account...')

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: 'contacto@servitplus.cl' }
  })

  if (existingUser) {
    console.log('⚠️  User already exists, updating profile...')
    
    // Update existing user
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        username: 'servitplus',
        displayName: 'SERVITPLUS',
        email: 'contacto@servitplus.cl',
        role: 'CREATOR',
      }
    })

    // Update or create creator profile
    await prisma.creator.upsert({
      where: { id: updatedUser.id },
      create: {
        id: updatedUser.id,
        bio: `🔧 GASFITERÍA INTEGRAL - SERVICIO TÉCNICO

✅ Técnico Certificado SEC
👨‍🔧 Juan Carlos Pulido
🏠 Atención Domiciliaria

📋 SERVICIOS:
• Mantención y Reparación
• Instalación de Sistemas de Gas
• Calefont Ionizado, Forzado y Natural
• Grifería baños y Cocinas
• Detección de Fugas de Gas
• Soldaduras Plata y Estaño
• Limpieza de Cañerías (Sarro)
• Instalación Filtro AntiSarro
• Informe Técnico T6

🏭 MARCAS AUTORIZADAS:
Ursus Trotter • Splendid • Mademsa • Neckar • Junkers

📞 ¡LLAMA AHORA!
+56 9 9507 7828`,
        backgroundColor: '#1a2744',
        backgroundGradient: 'from-[#1a2744] to-[#0d1520]',
        accentColor: '#3b82f6',
        profileImage: null,
        coverImage: null,
      },
      update: {
        bio: `🔧 GASFITERÍA INTEGRAL - SERVICIO TÉCNICO

✅ Técnico Certificado SEC
👨‍🔧 Juan Carlos Pulido
🏠 Atención Domiciliaria

📋 SERVICIOS:
• Mantención y Reparación
• Instalación de Sistemas de Gas
• Calefont Ionizado, Forzado y Natural
• Grifería baños y Cocinas
• Detección de Fugas de Gas
• Soldaduras Plata y Estaño
• Limpieza de Cañerías (Sarro)
• Instalación Filtro AntiSarro
• Informe Técnico T6

🏭 MARCAS AUTORIZADAS:
Ursus Trotter • Splendid • Mademsa • Neckar • Junkers

📞 ¡LLAMA AHORA!
+56 9 9507 7828`,
        backgroundColor: '#1a2744',
        backgroundGradient: 'from-[#1a2744] to-[#0d1520]',
        accentColor: '#3b82f6',
      }
    })

    // Delete existing social links
    await prisma.socialLink.deleteMany({
      where: { creatorId: updatedUser.id }
    })

    // Create social links with contact info
    await prisma.socialLink.createMany({
      data: [
        {
          creatorId: updatedUser.id,
          platform: 'phone',
          url: '+56995077828',
          label: 'WhatsApp / Teléfono',
          order: 0
        },
        {
          creatorId: updatedUser.id,
          platform: 'whatsapp',
          url: 'https://wa.me/56995077828',
          label: 'Contactar por WhatsApp',
          order: 1
        },
        {
          creatorId: updatedUser.id,
          platform: 'email',
          url: 'mailto:contacto@servitplus.cl',
          label: 'Email',
          order: 2
        }
      ]
    })

    console.log('✅ User updated successfully')
    console.log('📧 Email: contacto@servitplus.cl')
    console.log('👤 Username: servitplus')
    console.log('📱 Phone: +56 9 9507 7828')
    return
  }

  // Create new user with hashed password
  const hashedPassword = await bcrypt.hash('Servitplus2026!', 10)

  const user = await prisma.user.create({
    data: {
      username: 'servitplus',
      displayName: 'SERVITPLUS',
      email: 'contacto@servitplus.cl',
      passwordHash: hashedPassword,
      role: 'CREATOR',
      emailVerified: true,
      creatorProfile: {
        create: {
          bio: `🔧 GASFITERÍA INTEGRAL - SERVICIO TÉCNICO

✅ Técnico Certificado SEC
👨‍🔧 Juan Carlos Pulido
🏠 Atención Domiciliaria

📋 SERVICIOS:
• Mantención y Reparación
• Instalación de Sistemas de Gas
• Calefont Ionizado, Forzado y Natural
• Grifería baños y Cocinas
• Detección de Fugas de Gas
• Soldaduras Plata y Estaño
• Limpieza de Cañerías (Sarro)
• Instalación Filtro AntiSarro
• Informe Técnico T6

🏭 MARCAS AUTORIZADAS:
Ursus Trotter • Splendid • Mademsa • Neckar • Junkers

📞 ¡LLAMA AHORA!
+56 9 9507 7828`,
          backgroundColor: '#1a2744',
          backgroundGradient: 'from-[#1a2744] to-[#0d1520]',
          accentColor: '#3b82f6',
          profileImage: null,
          coverImage: null,
        }
      }
    },
    include: {
      creatorProfile: true
    }
  })

  // Create social links with contact info
  await prisma.socialLink.createMany({
    data: [
      {
        creatorId: user.id,
        platform: 'phone',
        url: '+56995077828',
        label: 'WhatsApp / Teléfono',
        order: 0
      },
      {
        creatorId: user.id,
        platform: 'whatsapp',
        url: 'https://wa.me/56995077828',
        label: 'Contactar por WhatsApp',
        order: 1
      },
      {
        creatorId: user.id,
        platform: 'email',
        url: 'mailto:contacto@servitplus.cl',
        label: 'Email',
        order: 2
      }
    ]
  })

  console.log('✅ SERVITPLUS demo account created successfully!')
  console.log('\n📋 Account Details:')
  console.log('   Email: contacto@servitplus.cl')
  console.log('   Password: Servitplus2026!')
  console.log('   Username: servitplus')
  console.log('   Profile URL: https://apapacho.com/servitplus')
  console.log('   Phone: +56 9 9507 7828')
  console.log('\n🔗 Social Links:')
  console.log('   • WhatsApp: +56 9 9507 7828')
  console.log('   • Email: contacto@servitplus.cl')
  console.log('\n⚠️  Next Steps:')
  console.log('   1. Upload flyer image as profile picture')
  console.log('   2. Add service photos to gallery')
  console.log('   3. No subscription tiers needed (demo account)')
}

main()
  .catch((e) => {
    console.error('❌ Error creating SERVITPLUS account:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
