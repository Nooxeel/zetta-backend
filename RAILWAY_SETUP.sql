-- ============================================
-- SCRIPT DE CONFIGURACIÓN PARA RAILWAY
-- Ejecuta este script completo en la consola de PostgreSQL de Railway
-- ============================================

-- PASO 1: Crear el enum InterestCategory (si no existe)
DO $$ BEGIN
    CREATE TYPE "InterestCategory" AS ENUM ('ENTERTAINMENT', 'LIFESTYLE', 'ADULT', 'ART', 'GAMING', 'MUSIC', 'FITNESS', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- PASO 2: Crear tabla Interest (si no existe)
CREATE TABLE IF NOT EXISTS "Interest" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "category" "InterestCategory" NOT NULL,
    "isNSFW" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Interest_pkey" PRIMARY KEY ("id")
);

-- PASO 3: Crear tabla UserInterest (si no existe)
CREATE TABLE IF NOT EXISTS "UserInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserInterest_pkey" PRIMARY KEY ("id")
);

-- PASO 4: Crear tabla CreatorInterest (si no existe)
CREATE TABLE IF NOT EXISTS "CreatorInterest" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "interestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorInterest_pkey" PRIMARY KEY ("id")
);

-- PASO 5: Crear índices (si no existen)
CREATE UNIQUE INDEX IF NOT EXISTS "Interest_slug_key" ON "Interest"("slug");
CREATE INDEX IF NOT EXISTS "Interest_slug_idx" ON "Interest"("slug");
CREATE INDEX IF NOT EXISTS "Interest_category_idx" ON "Interest"("category");
CREATE INDEX IF NOT EXISTS "Interest_usageCount_idx" ON "Interest"("usageCount" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "UserInterest_userId_interestId_key" ON "UserInterest"("userId", "interestId");
CREATE INDEX IF NOT EXISTS "UserInterest_userId_idx" ON "UserInterest"("userId");
CREATE INDEX IF NOT EXISTS "UserInterest_interestId_idx" ON "UserInterest"("interestId");
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorInterest_creatorId_interestId_key" ON "CreatorInterest"("creatorId", "interestId");
CREATE INDEX IF NOT EXISTS "CreatorInterest_creatorId_idx" ON "CreatorInterest"("creatorId");
CREATE INDEX IF NOT EXISTS "CreatorInterest_interestId_idx" ON "CreatorInterest"("interestId");

-- PASO 6: Agregar Foreign Keys (si no existen)
DO $$ BEGIN
    ALTER TABLE "UserInterest" ADD CONSTRAINT "UserInterest_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "UserInterest" ADD CONSTRAINT "UserInterest_interestId_fkey"
        FOREIGN KEY ("interestId") REFERENCES "Interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CreatorInterest" ADD CONSTRAINT "CreatorInterest_creatorId_fkey"
        FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CreatorInterest" ADD CONSTRAINT "CreatorInterest_interestId_fkey"
        FOREIGN KEY ("interestId") REFERENCES "Interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- PASO 7: Seed de 45 intereses (solo si la tabla está vacía)
INSERT INTO "Interest" (id, slug, name, description, icon, category, "isNSFW", "usageCount", "createdAt", "updatedAt")
SELECT * FROM (VALUES
-- ENTERTAINMENT (5)
(gen_random_uuid(), 'anime', 'Anime', 'Anime y manga japonés', '🎌', 'ENTERTAINMENT', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'cosplay', 'Cosplay', 'Disfraces y caracterización', '🎭', 'ENTERTAINMENT', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'streaming', 'Streaming', 'Transmisiones en vivo', '📺', 'ENTERTAINMENT', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'peliculas', 'Películas', 'Cine y películas', '🎬', 'ENTERTAINMENT', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'series', 'Series', 'Series de TV', '📽️', 'ENTERTAINMENT', false, 0, NOW(), NOW()),

-- GAMING (5)
(gen_random_uuid(), 'gaming', 'Gaming', 'Videojuegos en general', '🎮', 'GAMING', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'esports', 'Esports', 'Deportes electrónicos competitivos', '🏆', 'GAMING', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'retro-gaming', 'Retro Gaming', 'Videojuegos clásicos', '👾', 'GAMING', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'rpg', 'RPG', 'Juegos de rol', '⚔️', 'GAMING', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'fps', 'FPS/Shooters', 'Juegos de disparos', '🎯', 'GAMING', false, 0, NOW(), NOW()),

-- MUSIC (5)
(gen_random_uuid(), 'musica', 'Música', 'Música en general', '🎵', 'MUSIC', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'rock', 'Rock', 'Rock y metal', '🎸', 'MUSIC', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'electronica', 'Electrónica', 'Música electrónica y EDM', '🎧', 'MUSIC', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'reggaeton', 'Reggaetón', 'Reggaetón y urbano', '🎤', 'MUSIC', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'kpop', 'K-Pop', 'Música pop coreana', '💜', 'MUSIC', false, 0, NOW(), NOW()),

-- ART (5)
(gen_random_uuid(), 'fotografia', 'Fotografía', 'Arte fotográfico', '📸', 'ART', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'dibujo', 'Dibujo', 'Ilustración y dibujo', '🎨', 'ART', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'diseno', 'Diseño', 'Diseño gráfico y digital', '✏️', 'ART', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'arte-digital', 'Arte Digital', 'Creación digital', '🖌️', 'ART', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'modelaje', 'Modelaje', 'Modelaje y poses', '📷', 'ART', false, 0, NOW(), NOW()),

-- FITNESS (5)
(gen_random_uuid(), 'fitness', 'Fitness', 'Ejercicio y entrenamiento', '💪', 'FITNESS', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'yoga', 'Yoga', 'Yoga y meditación', '🧘', 'FITNESS', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'gym', 'Gym', 'Gimnasio y musculación', '🏋️', 'FITNESS', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'running', 'Running', 'Carrera y atletismo', '🏃', 'FITNESS', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'deportes', 'Deportes', 'Deportes en general', '⚽', 'FITNESS', false, 0, NOW(), NOW()),

-- LIFESTYLE (6)
(gen_random_uuid(), 'comida', 'Comida', 'Gastronomía y cocina', '🍔', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'viajes', 'Viajes', 'Viajes y turismo', '✈️', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'moda', 'Moda', 'Moda y estilo', '👗', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'belleza', 'Belleza', 'Belleza y maquillaje', '💄', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'mascotas', 'Mascotas', 'Animales y mascotas', '🐶', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'autos', 'Autos', 'Automóviles y motos', '🚗', 'LIFESTYLE', false, 0, NOW(), NOW()),

-- ADULT (5)
(gen_random_uuid(), 'explicito', 'Explícito', 'Contenido explícito para adultos', '🔞', 'ADULT', true, 0, NOW(), NOW()),
(gen_random_uuid(), 'lenceria', 'Lencería', 'Modelaje de lencería', '👙', 'ADULT', true, 0, NOW(), NOW()),
(gen_random_uuid(), 'fetish', 'Fetish', 'Contenido fetichista', '🔞', 'ADULT', true, 0, NOW(), NOW()),
(gen_random_uuid(), 'boudoir', 'Boudoir', 'Fotografía boudoir', '📸', 'ADULT', true, 0, NOW(), NOW()),
(gen_random_uuid(), 'adulto-anime', 'Adulto Anime', 'Anime y hentai para adultos', '🔞', 'ADULT', true, 0, NOW(), NOW()),

-- OTHER (5)
(gen_random_uuid(), 'educacion', 'Educación', 'Contenido educativo', '📚', 'OTHER', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'tecnologia', 'Tecnología', 'Tech y gadgets', '💻', 'OTHER', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'podcast', 'Podcast', 'Podcasts y audio', '🎙️', 'OTHER', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'asmr', 'ASMR', 'ASMR y relajación', '🎧', 'OTHER', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'comedia', 'Comedia', 'Humor y comedia', '😂', 'OTHER', false, 0, NOW(), NOW())
) AS t(id, slug, name, description, icon, category, "isNSFW", "usageCount", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "Interest" LIMIT 1);

-- Verificar que todo funcionó correctamente
SELECT
    'Tables created' as status,
    (SELECT COUNT(*) FROM "Interest") as interests_count,
    (SELECT COUNT(*) FROM "UserInterest") as user_interests_count,
    (SELECT COUNT(*) FROM "CreatorInterest") as creator_interests_count;

-- Mostrar intereses por categoría
SELECT category, COUNT(*) as count
FROM "Interest"
GROUP BY category
ORDER BY category;
