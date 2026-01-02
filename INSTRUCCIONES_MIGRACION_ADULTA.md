# Instrucciones para Migrar a Intereses de Plataforma Adulta

## ⚠️ IMPORTANTE: Leer antes de ejecutar

Esta migración **eliminará todos los intereses actuales** y las relaciones de usuarios/creadores con esos intereses. Es una migración destructiva diseñada para cambiar el enfoque de la plataforma.

## Pasos de Migración en Railway

### 1. Acceder a la Consola de PostgreSQL en Railway

1. Ir al proyecto en Railway
2. Seleccionar el servicio PostgreSQL
3. Ir a la pestaña "Data" o "Query"
4. Abrir el editor SQL

### 2. Ejecutar el Script de Migración

Copiar y pegar el contenido completo del archivo [`ADULT_INTERESTS_MIGRATION.sql`](./ADULT_INTERESTS_MIGRATION.sql) en el editor SQL de Railway y ejecutarlo.

**El script hará lo siguiente:**

1. **Eliminar todos los intereses existentes** (CASCADE eliminará automáticamente UserInterest y CreatorInterest)
2. **Actualizar el enum InterestCategory** de 8 categorías a 4 nuevas
3. **Insertar 50 nuevos intereses** enfocados en contenido adulto

### 3. Verificar que la Migración Funcionó

Al final del script se ejecutarán dos queries de verificación:

```sql
-- Debería mostrar 50 intereses totales
SELECT 'Migration completed' as status,
    (SELECT COUNT(*) FROM "Interest") as total_interests,
    (SELECT COUNT(*) FROM "Interest" WHERE category = 'CONTENT_TYPE') as content_type,
    (SELECT COUNT(*) FROM "Interest" WHERE category = 'AESTHETIC') as aesthetic,
    (SELECT COUNT(*) FROM "Interest" WHERE category = 'THEMES') as themes,
    (SELECT COUNT(*) FROM "Interest" WHERE category = 'NICHE') as niche;

-- Debería mostrar:
-- CONTENT_TYPE: 11
-- AESTHETIC: 12
-- THEMES: 14
-- NICHE: 13
```

### 4. Reiniciar el Servicio de Backend (Opcional)

Aunque no es estrictamente necesario, puedes reiniciar el servicio backend en Railway para asegurar que Prisma Client esté sincronizado.

## Nuevas Categorías e Intereses

### CONTENT_TYPE (11 intereses)
- Fotografía, Video, Soft, Explícito, ASMR, Audio, Contenido Escrito (PDF), Arte Digital, Sets Exclusivos, Customs, Videollamadas

### AESTHETIC (12 intereses)
- Lencería, Cosplay, Fetish/BDSM, Fitness/Atlético, Gótico/Alt, E-girl/E-boy, Pin-up/Vintage, Amateur/Casual, Latex/Cuero, Uniforme, Lingerie Fina, Deportivo

### THEMES (14 intereses)
- Anime/Hentai, Gaming/Gamer, Roleplay, Dominación, Sumisión, Voyeur/Exhibición, Parejas, Solo, JOI, POV, Girlfriend Experience, Humillación, FinDom, Worship

### NICHE (13 intereses)
- BBW/Curvy, Petite, MILF/Maduro, Trans, Gay, Lesbianas, Feet, Pregnancy, Hairy, Tattoos/Piercings, Muscle, Crossdressing, Asiático

## Características Especiales

### Contenido Escrito en PDF
Se agregó el interés "Contenido Escrito" específicamente para soportar la venta de historias eróticas y literatura adulta en formato PDF. Este será un tipo de contenido que los creadores podrán ofrecer.

### Flag NSFW
La mayoría de los intereses tienen `isNSFW: true`, excepto algunos como:
- Soft
- ASMR
- Cosplay
- Fitness/Atlético
- Gótico/Alt
- E-girl/E-boy
- Pin-up/Vintage
- Deportivo
- Gaming/Gamer
- Tattoos/Piercings
- Asiático

## Impacto en Usuarios Existentes

⚠️ **Todos los usuarios y creadores perderán sus intereses seleccionados** y deberán seleccionar nuevos intereses de la nueva lista.

**Para mitigar esto:**
1. Considera enviar un email/notificación a los usuarios explicando el cambio
2. Redirigir usuarios/creadores a la página de selección de intereses en su próximo login
3. Mostrar un banner/modal explicando el cambio de categorías

## Despliegue del Frontend

El frontend ya ha sido desplegado a Vercel con los cambios sincronizados. Una vez ejecutada la migración SQL en Railway, todo debería funcionar correctamente.

## Troubleshooting

### Error: "column category does not exist"
La columna se elimina y recrea durante la migración. Asegúrate de ejecutar el script completo.

### Error: "type InterestCategory does not exist"
El enum se elimina y recrea. Ejecuta el script completo sin interrupciones.

### Error: "interests not showing in frontend"
1. Verifica que la migración se ejecutó correctamente: `SELECT COUNT(*) FROM "Interest";` debería retornar 50
2. Reinicia el backend en Railway
3. Verifica que el frontend esté desplegado con los cambios más recientes

---

**✅ Una vez completada la migración, la plataforma estará lista para funcionar como plataforma de contenido adulto con categorías especializadas.**
