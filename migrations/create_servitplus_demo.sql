-- =====================================================
-- SERVITPLUS Demo Account Setup
-- Cliente: Gasfitería Integral - Servicio Técnico
-- Técnico: Juan Carlos Pulido
-- =====================================================

-- 1. Create user (password hash for: Servitplus2026!)
INSERT INTO "User" (
  id,
  username,
  "displayName",
  email,
  "passwordHash",
  role,
  "emailVerified",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  'servitplus',
  'SERVITPLUS',
  'contacto@servitplus.cl',
  '$2b$10$WsYAq8uaikKtuFjQ4VcaQunmnjPnM8dZkzSoa.IzFOiPzPuhtkHL.',
  'CREATOR',
  true,
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING
RETURNING id;

-- Note: Get the user ID from above, then use it in the queries below
-- Or run this to get it: SELECT id FROM "User" WHERE username = 'servitplus';

-- 2. Create Creator Profile
INSERT INTO "Creator" (
  id,
  bio,
  "backgroundColor",
  "backgroundGradient",
  "accentColor",
  "createdAt",
  "updatedAt"
)
SELECT 
  u.id,
  '🔧 GASFITERÍA INTEGRAL - SERVICIO TÉCNICO

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
+56 9 9507 7828',
  '#1a2744',
  'from-[#1a2744] to-[#0d1520]',
  '#3b82f6',
  NOW(),
  NOW()
FROM "User" u
WHERE u.username = 'servitplus'
ON CONFLICT (id) DO UPDATE SET
  bio = EXCLUDED.bio,
  "backgroundColor" = EXCLUDED."backgroundColor",
  "backgroundGradient" = EXCLUDED."backgroundGradient",
  "accentColor" = EXCLUDED."accentColor",
  "updatedAt" = NOW();

-- 3. Create Social Links (Contact Info)
INSERT INTO "SocialLink" (
  id,
  "creatorId",
  platform,
  url,
  label,
  "order",
  "createdAt",
  "updatedAt"
)
SELECT 
  gen_random_uuid(),
  u.id,
  'phone',
  '+56995077828',
  'WhatsApp / Teléfono',
  0,
  NOW(),
  NOW()
FROM "User" u
WHERE u.username = 'servitplus'
ON CONFLICT DO NOTHING;

INSERT INTO "SocialLink" (
  id,
  "creatorId",
  platform,
  url,
  label,
  "order",
  "createdAt",
  "updatedAt"
)
SELECT 
  gen_random_uuid(),
  u.id,
  'whatsapp',
  'https://wa.me/56995077828',
  'Contactar por WhatsApp',
  1,
  NOW(),
  NOW()
FROM "User" u
WHERE u.username = 'servitplus'
ON CONFLICT DO NOTHING;

INSERT INTO "SocialLink" (
  id,
  "creatorId",
  platform,
  url,
  label,
  "order",
  "createdAt",
  "updatedAt"
)
SELECT 
  gen_random_uuid(),
  u.id,
  'email',
  'mailto:contacto@servitplus.cl',
  'Email',
  2,
  NOW(),
  NOW()
FROM "User" u
WHERE u.username = 'servitplus'
ON CONFLICT DO NOTHING;

-- 4. Verify account was created
SELECT 
  u.id,
  u.username,
  u."displayName",
  u.email,
  u.role,
  c.bio IS NOT NULL as "hasProfile",
  COUNT(sl.id) as "socialLinksCount"
FROM "User" u
LEFT JOIN "Creator" c ON c.id = u.id
LEFT JOIN "SocialLink" sl ON sl."creatorId" = u.id
WHERE u.username = 'servitplus'
GROUP BY u.id, u.username, u."displayName", u.email, u.role, c.bio;

-- =====================================================
-- ACCOUNT CREDENTIALS
-- =====================================================
-- Email: contacto@servitplus.cl
-- Username: servitplus
-- Password: Servitplus2026!
-- Profile URL: https://tu-dominio.com/servitplus
-- Phone: +56 9 9507 7828
-- =====================================================
