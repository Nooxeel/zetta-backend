-- ============================================
-- MIGRACIÓN: INTERESES ENFOCADOS EN CONTENIDO ADULTO
-- Reemplaza las categorías e intereses actuales con nuevas apropiadas
-- para una plataforma de contenido adulto
-- ============================================

-- PASO 1: Eliminar todos los intereses existentes
-- (Las relaciones UserInterest y CreatorInterest se eliminarán automáticamente por CASCADE)
DELETE FROM "Interest";

-- PASO 2: Actualizar el enum InterestCategory
-- Primero crear el nuevo enum
CREATE TYPE "InterestCategory_new" AS ENUM ('CONTENT_TYPE', 'AESTHETIC', 'THEMES', 'NICHE');

-- Eliminar la columna category temporalmente (se recrea después)
ALTER TABLE "Interest" DROP COLUMN "category";

-- Eliminar el enum antiguo
DROP TYPE "InterestCategory";

-- Renombrar el nuevo enum
ALTER TYPE "InterestCategory_new" RENAME TO "InterestCategory";

-- Recrear la columna con el nuevo enum
ALTER TABLE "Interest" ADD COLUMN "category" "InterestCategory" NOT NULL DEFAULT 'CONTENT_TYPE';

-- PASO 3: Insertar nuevos intereses enfocados en contenido adulto
INSERT INTO "Interest" (id, slug, name, description, icon, category, "isNSFW", "usageCount", "createdAt", "updatedAt")
VALUES

-- ==================== CONTENT_TYPE (11 intereses) ====================
(gen_random_uuid(), 'fotografia', 'Fotografía', 'Contenido fotográfico profesional y amateur', '📸', 'CONTENT_TYPE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'video', 'Video', 'Contenido en formato video', '🎥', 'CONTENT_TYPE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'soft', 'Soft', 'Contenido sugerente pero no explícito', '💕', 'CONTENT_TYPE'::"InterestCategory", false, 0, NOW(), NOW()),
(gen_random_uuid(), 'explicito', 'Explícito', 'Contenido adulto explícito', '🔞', 'CONTENT_TYPE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'asmr', 'ASMR', 'Audio ASMR y contenido sensorial', '🎧', 'CONTENT_TYPE'::"InterestCategory", false, 0, NOW(), NOW()),
(gen_random_uuid(), 'audio', 'Audio', 'Contenido de audio erótico', '🔊', 'CONTENT_TYPE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'contenido-escrito', 'Contenido Escrito', 'Historias eróticas y literatura adulta en PDF', '📝', 'CONTENT_TYPE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'arte-digital', 'Arte Digital', 'Ilustraciones y arte digital 2D/3D', '🎨', 'CONTENT_TYPE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'sets-exclusivos', 'Sets Exclusivos', 'Colecciones premium de contenido', '⭐', 'CONTENT_TYPE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'customs', 'Customs', 'Contenido personalizado por pedido', '✨', 'CONTENT_TYPE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'videollamadas', 'Videollamadas', 'Sesiones privadas en vivo', '📹', 'CONTENT_TYPE'::"InterestCategory", true, 0, NOW(), NOW()),

-- ==================== AESTHETIC (12 intereses) ====================
(gen_random_uuid(), 'lenceria', 'Lencería', 'Modelaje de lencería y ropa íntima', '👙', 'AESTHETIC'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'cosplay', 'Cosplay', 'Disfraces y caracterización de personajes', '🎭', 'AESTHETIC'::"InterestCategory", false, 0, NOW(), NOW()),
(gen_random_uuid(), 'fetish-bdsm', 'Fetish/BDSM', 'Contenido fetichista y BDSM', '⛓️', 'AESTHETIC'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'fitness', 'Fitness/Atlético', 'Cuerpo atlético y contenido fitness', '💪', 'AESTHETIC'::"InterestCategory", false, 0, NOW(), NOW()),
(gen_random_uuid(), 'gotico-alt', 'Gótico/Alt', 'Estética gótica y alternativa', '🖤', 'AESTHETIC'::"InterestCategory", false, 0, NOW(), NOW()),
(gen_random_uuid(), 'egirl-eboy', 'E-girl/E-boy', 'Estética gamer/internet', '🎮', 'AESTHETIC'::"InterestCategory", false, 0, NOW(), NOW()),
(gen_random_uuid(), 'pinup-vintage', 'Pin-up/Vintage', 'Estilo retro y pin-up', '💄', 'AESTHETIC'::"InterestCategory", false, 0, NOW(), NOW()),
(gen_random_uuid(), 'amateur-casual', 'Amateur/Casual', 'Contenido casero y natural', '🏠', 'AESTHETIC'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'latex-leather', 'Latex/Cuero', 'Atuendos de latex y cuero', '🥾', 'AESTHETIC'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'uniforme', 'Uniforme', 'Uniformes y roleplay laboral', '👔', 'AESTHETIC'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'lingerie-fina', 'Lingerie Fina', 'Lencería de lujo y alta gama', '💎', 'AESTHETIC'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'deportivo', 'Deportivo', 'Ropa deportiva y activewear', '🏋️', 'AESTHETIC'::"InterestCategory", false, 0, NOW(), NOW()),

-- ==================== THEMES (14 intereses) ====================
(gen_random_uuid(), 'anime-hentai', 'Anime/Hentai', 'Temática anime y hentai', '🎌', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'gaming-gamer', 'Gaming/Gamer', 'Temática de videojuegos', '🎮', 'THEMES'::"InterestCategory", false, 0, NOW(), NOW()),
(gen_random_uuid(), 'roleplay', 'Roleplay', 'Juego de roles y fantasías', '🎪', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'dominacion', 'Dominación', 'Contenido dominante', '👑', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'sumision', 'Sumisión', 'Contenido sumiso', '🙇', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'voyeur-exhibicion', 'Voyeur/Exhibición', 'Voyeurismo y exhibicionismo', '👀', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'parejas', 'Parejas', 'Contenido de parejas', '💑', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'solo', 'Solo', 'Contenido individual', '💋', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'joi', 'JOI', 'Instrucciones de masturbación', '🗣️', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'pov', 'POV', 'Punto de vista en primera persona', '👁️', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'girlfriend-experience', 'Girlfriend Experience', 'Experiencia de novia/novio', '💌', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'humillacion', 'Humillación', 'Contenido de humillación consensuada', '😈', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'findom', 'FinDom', 'Dominación financiera', '💸', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'worship', 'Worship', 'Adoración corporal', '🙏', 'THEMES'::"InterestCategory", true, 0, NOW(), NOW()),

-- ==================== NICHE (13 intereses) ====================
(gen_random_uuid(), 'bbw-curvy', 'BBW/Curvy', 'Cuerpos grandes y curvilíneos', '🍑', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'petite', 'Petite', 'Cuerpos pequeños y delgados', '🌸', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'milf-maduro', 'MILF/Maduro', 'Contenido maduro +30', '👩', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'trans', 'Trans', 'Creadores/as trans', '🏳️‍⚧️', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'gay', 'Gay', 'Contenido gay masculino', '🏳️‍🌈', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'lesbian', 'Lesbianas', 'Contenido lésbico', '👩‍❤️‍👩', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'feet', 'Feet', 'Fetiche de pies', '👣', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'pregnancy', 'Pregnancy', 'Contenido de embarazo', '🤰', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'hairy', 'Hairy', 'Vello corporal natural', '🌿', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'tattoos-piercings', 'Tattoos/Piercings', 'Cuerpo modificado con tatuajes y piercings', '🎨', 'NICHE'::"InterestCategory", false, 0, NOW(), NOW()),
(gen_random_uuid(), 'muscle', 'Muscle', 'Cuerpos musculosos', '💪', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'crossdressing', 'Crossdressing', 'Crossdressing y transformismo', '👗', 'NICHE'::"InterestCategory", true, 0, NOW(), NOW()),
(gen_random_uuid(), 'asian', 'Asiático', 'Creadores asiáticos', '🌏', 'NICHE'::"InterestCategory", false, 0, NOW(), NOW());

-- PASO 4: Verificar que todo funcionó correctamente
SELECT
    'Migration completed' as status,
    (SELECT COUNT(*) FROM "Interest") as total_interests,
    (SELECT COUNT(*) FROM "Interest" WHERE category = 'CONTENT_TYPE') as content_type,
    (SELECT COUNT(*) FROM "Interest" WHERE category = 'AESTHETIC') as aesthetic,
    (SELECT COUNT(*) FROM "Interest" WHERE category = 'THEMES') as themes,
    (SELECT COUNT(*) FROM "Interest" WHERE category = 'NICHE') as niche;

-- Mostrar todos los intereses por categoría
SELECT category, COUNT(*) as count, STRING_AGG(name, ', ' ORDER BY name) as interests
FROM "Interest"
GROUP BY category
ORDER BY category;
