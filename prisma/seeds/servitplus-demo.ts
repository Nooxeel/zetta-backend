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
        isCreator: true,
      }
    })

    // Update or create creator profile
    await prisma.creator.upsert({
      where: { userId: updatedUser.id },
      create: {
        userId: updatedUser.id,
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
    const existingCreator = await prisma.creator.findUnique({
      where: { userId: updatedUser.id }
    })

    if (existingCreator) {
      await prisma.socialLink.deleteMany({
        where: { creatorId: existingCreator.id }
      })

      // Create social links with contact info
      await prisma.socialLink.createMany({
        data: [
          {
            creatorId: existingCreator.id,
            platform: 'phone',
            url: '+56995077828',
            label: 'WhatsApp / Teléfono',
            order: 0
          },
          {
            creatorId: existingCreator.id,
            platform: 'whatsapp',
            url: 'https://wa.me/56995077828',
            label: 'Contactar por WhatsApp',
            order: 1
          },
          {
            creatorId: existingCreator.id,
          platform: 'email',
          url: 'mailto:contacto@servitplus.cl',
          label: 'Email',
          order: 2
        }
      ]
    })
    }

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
      password: hashedPassword,
      isCreator: true,
    }
  })

  // Create creator profile
  const creator = await prisma.creator.create({
    data: {
      userId: user.id,
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

  // Create social links with contact info
  await prisma.socialLink.createMany({
    data: [
      {
        creatorId: creator.id,
        platform: 'phone',
        url: '+56995077828',
        label: 'WhatsApp / Teléfono',
        order: 0
      },
      {
        creatorId: creator.id,
        platform: 'whatsapp',
        url: 'https://wa.me/56995077828',
        label: 'Contactar por WhatsApp',
        order: 1
      },
      {
        creatorId: creator.id,
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
