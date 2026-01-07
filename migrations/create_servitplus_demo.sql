-- =====================================================
-- SERVITPLUS Demo Account Setup
-- Cliente: Gasfitería Integral - Servicio Técnico
-- Técnico: Juan Carlos Pulido
-- =====================================================

-- 1. Create user (password: Servitplus2026!)
INSERT INTO "User" (
  id,
  username,
  "displayName",
  email,
  password,
  "isCreator",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  'servitplus',
  'SERVITPLUS',
  'contacto@servitplus.cl',
  '$2b$10$WsYAq8uaikKtuFjQ4VcaQunmnjPnM8dZkzSoa.IzFOiPzPuhtkHL.',
  true,
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING
RETURNING id;

-- Get the user ID
-- SELECT id FROM "User" WHERE username = 'servitplus';

-- 2. Create Creator Profile (replace <USER_ID> with the ID from step 1)
INSERT INTO "Creator" (
  id,
  "userId",
  bio,
  "backgroundColor",
  "backgroundGradient",
  "accentColor",
  "createdAt",
  "updatedAt"
)
SELECT 
  gen_random_uuid(),
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
ON CONFLICT ("userId") DO UPDATE SET
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
  c.id,
  'phone',
  '+56995077828',
  'WhatsApp / Teléfono',
  0,
  NOW(),
  NOW()
FROM "User" u
JOIN "Creator" c ON c."userId" = u.id
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
  c.id,
  'whatsapp',
  'https://wa.me/56995077828',
  'Contactar por WhatsApp',
  1,
  NOW(),
  NOW()
FROM "User" u
JOIN "Creator" c ON c."userId" = u.id
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
  c.id,
  'email',
  'mailto:contacto@servitplus.cl',
  'Email',
  2,
  NOW(),
  NOW()
FROM "User" u
JOIN "Creator" c ON c."userId" = u.id
WHERE u.username = 'servitplus'
ON CONFLICT DO NOTHING;

-- 4. Verify account was created
SELECT 
  u.id as "userId",
  u.username,
  u."displayName",
  u.email,
  u."isCreator",
  c.id as "creatorId",
  c.bio IS NOT NULL as "hasProfile",
  COUNT(sl.id) as "socialLinksCount"
FROM "User" u
LEFT JOIN "Creator" c ON c."userId" = u.id
LEFT JOIN "SocialLink" sl ON sl."creatorId" = c.id
WHERE u.username = 'servitplus'
GROUP BY u.id, u.username, u."displayName", u.email, u."isCreator", c.id, c.bio;

-- =====================================================
-- ACCOUNT CREDENTIALS
-- =====================================================
-- Email: contacto@servitplus.cl
-- Username: servitplus
-- Password: Servitplus2026!
-- Profile URL: https://apapacho.com/servitplus
-- Phone: +56 9 9507 7828
-- =====================================================
