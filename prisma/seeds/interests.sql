-- Seed default interests for Apapacho platform
-- Run this after the migration to populate the Interest table

INSERT INTO "Interest" (id, slug, name, description, icon, category, "isNSFW", "usageCount", "createdAt", "updatedAt") VALUES
-- ENTERTAINMENT (Anime, series, películas, etc.)
(gen_random_uuid(), 'anime', 'Anime', 'Anime y manga japonés', '🎌', 'ENTERTAINMENT', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'cosplay', 'Cosplay', 'Disfraces y caracterización', '🎭', 'ENTERTAINMENT', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'streaming', 'Streaming', 'Transmisiones en vivo', '📺', 'ENTERTAINMENT', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'peliculas', 'Películas', 'Cine y películas', '🎬', 'ENTERTAINMENT', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'series', 'Series', 'Series de TV', '📽️', 'ENTERTAINMENT', false, 0, NOW(), NOW()),

-- GAMING
(gen_random_uuid(), 'gaming', 'Gaming', 'Videojuegos en general', '🎮', 'GAMING', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'esports', 'Esports', 'Deportes electrónicos competitivos', '🏆', 'GAMING', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'retro-gaming', 'Retro Gaming', 'Videojuegos clásicos', '👾', 'GAMING', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'rpg', 'RPG', 'Juegos de rol', '⚔️', 'GAMING', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'fps', 'FPS/Shooters', 'Juegos de disparos', '🎯', 'GAMING', false, 0, NOW(), NOW()),

-- MUSIC
(gen_random_uuid(), 'musica', 'Música', 'Música en general', '🎵', 'MUSIC', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'rock', 'Rock', 'Rock y metal', '🎸', 'MUSIC', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'electronica', 'Electrónica', 'Música electrónica y EDM', '🎧', 'MUSIC', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'reggaeton', 'Reggaetón', 'Reggaetón y urbano', '🎤', 'MUSIC', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'kpop', 'K-Pop', 'Música pop coreana', '💜', 'MUSIC', false, 0, NOW(), NOW()),

-- ART
(gen_random_uuid(), 'fotografia', 'Fotografía', 'Arte fotográfico', '📸', 'ART', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'dibujo', 'Dibujo', 'Ilustración y dibujo', '🎨', 'ART', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'diseno', 'Diseño', 'Diseño gráfico y digital', '✏️', 'ART', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'arte-digital', 'Arte Digital', 'Creación digital', '🖌️', 'ART', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'modelaje', 'Modelaje', 'Modelaje y poses', '📷', 'ART', false, 0, NOW(), NOW()),

-- FITNESS
(gen_random_uuid(), 'fitness', 'Fitness', 'Ejercicio y entrenamiento', '💪', 'FITNESS', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'yoga', 'Yoga', 'Yoga y meditación', '🧘', 'FITNESS', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'gym', 'Gym', 'Gimnasio y musculación', '🏋️', 'FITNESS', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'running', 'Running', 'Carrera y atletismo', '🏃', 'FITNESS', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'deportes', 'Deportes', 'Deportes en general', '⚽', 'FITNESS', false, 0, NOW(), NOW()),

-- LIFESTYLE
(gen_random_uuid(), 'comida', 'Comida', 'Gastronomía y cocina', '🍔', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'viajes', 'Viajes', 'Viajes y turismo', '✈️', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'moda', 'Moda', 'Moda y estilo', '👗', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'belleza', 'Belleza', 'Belleza y maquillaje', '💄', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'mascotas', 'Mascotas', 'Animales y mascotas', '🐶', 'LIFESTYLE', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'autos', 'Autos', 'Automóviles y motos', '🚗', 'LIFESTYLE', false, 0, NOW(), NOW()),

-- ADULT (NSFW Content)
(gen_random_uuid(), 'explicito', 'Explícito', 'Contenido explícito para adultos', '🔞', 'ADULT', true, 0, NOW(), NOW()),
(gen_random_uuid(), 'lenceria', 'Lencería', 'Modelaje de lencería', '👙', 'ADULT', true, 0, NOW(), NOW()),
(gen_random_uuid(), 'fetish', 'Fetish', 'Contenido fetichista', '🔞', 'ADULT', true, 0, NOW(), NOW()),
(gen_random_uuid(), 'boudoir', 'Boudoir', 'Fotografía boudoir', '📸', 'ADULT', true, 0, NOW(), NOW()),
(gen_random_uuid(), 'adulto-anime', 'Adulto Anime', 'Anime y hentai para adultos', '🔞', 'ADULT', true, 0, NOW(), NOW()),

-- OTHER
(gen_random_uuid(), 'educacion', 'Educación', 'Contenido educativo', '📚', 'OTHER', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'tecnologia', 'Tecnología', 'Tech y gadgets', '💻', 'OTHER', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'podcast', 'Podcast', 'Podcasts y audio', '🎙️', 'OTHER', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'asmr', 'ASMR', 'ASMR y relajación', '🎧', 'OTHER', false, 0, NOW(), NOW()),
(gen_random_uuid(), 'comedia', 'Comedia', 'Humor y comedia', '😂', 'OTHER', false, 0, NOW(), NOW());
