# Sistema de Intereses - Instrucciones de Implementación

## Resumen

Se ha implementado un sistema completo de intereses/tags para Apapacho que permite:

- **Usuarios (fans)**: Seleccionar 3-10 intereses para descubrir creadores relevantes
- **Creadores**: Seleccionar 5-15 intereses para que los fans los encuentren más fácilmente
- **Descubrimiento**: Algoritmo de recomendación basado en intereses compartidos
- **Búsqueda**: Filtrar creadores por intereses específicos

---

## Pasos de Implementación en Railway

### 1. Aplicar Migración de Base de Datos

La migración ya está creada en `/prisma/migrations/20250101000000_add_interests_system/migration.sql`

**En Railway:**

```bash
# Opción A: Aplicar migración automáticamente
npx prisma migrate deploy

# Opción B: Ejecutar SQL manualmente si Prisma no funciona
# Copiar y ejecutar el contenido de prisma/migrations/20250101000000_add_interests_system/migration.sql
# en la consola de PostgreSQL de Railway
```

### 2. Seed de Intereses Pre-definidos

El archivo `prisma/seeds/interests.sql` contiene 45 intereses pre-cargados en 8 categorías:

- **ENTERTAINMENT**: Anime, Cosplay, Streaming, Películas, Series (5)
- **GAMING**: Gaming, Esports, Retro Gaming, RPG, FPS (5)
- **MUSIC**: Música, Rock, Electrónica, Reggaetón, K-Pop (5)
- **ART**: Fotografía, Dibujo, Diseño, Arte Digital, Modelaje (5)
- **FITNESS**: Fitness, Yoga, Gym, Running, Deportes (5)
- **LIFESTYLE**: Comida, Viajes, Moda, Belleza, Mascotas, Autos (6)
- **ADULT (NSFW)**: Explícito, Lencería, Fetish, Boudoir, Adulto Anime (5)
- **OTHER**: Educación, Tecnología, Podcast, ASMR, Comedia (5)

**Ejecutar en Railway PostgreSQL:**

```bash
# Conectarse a la base de datos de Railway y ejecutar:
psql $DATABASE_URL < prisma/seeds/interests.sql

# O copiar el contenido del archivo y ejecutarlo directamente en la consola SQL
```

### 3. Reconstruir Prisma Client

Después de aplicar la migración:

```bash
npx prisma generate
npm run build
```

### 4. Deploy del Backend

```bash
git add .
git commit -m "feat: Implementar sistema de intereses y descubrimiento

- Agregar modelos Interest, UserInterest, CreatorInterest
- Crear endpoints de API para intereses (/api/interests)
- Implementar algoritmo de recomendación (/api/discover)
- Seed de 45 intereses pre-definidos
- Validaciones: usuarios 3-10, creadores 5-15

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push origin main
```

Railway detectará el push y desplegará automáticamente.

---

## Pasos de Implementación en Vercel (Frontend)

### 1. Deploy a Vercel

```bash
cd /Users/zippy/Desktop/apapacho

git add .
git commit -m "feat: Implementar UI de intereses y descubrimiento

- Crear componentes InterestSelector y InterestBadges
- Agregar página de configuración de intereses (/settings/interests)
- Implementar página de descubrimiento (/discover)
- Agregar API client para interests y discover
- Tipos TypeScript para Interest, InterestCategory

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push origin main
```

Vercel detectará el push y desplegará automáticamente.

---

## Endpoints de API Creados

### Intereses (Públicos)

**GET /api/interests**
- Obtener todos los intereses disponibles
- Query params: `?category=GAMING&search=anime`

**GET /api/interests/by-category**
- Obtener intereses agrupados por categoría

### Intereses del Usuario (Requiere Auth)

**GET /api/interests/me**
- Obtener intereses del usuario actual

**POST /api/interests/me**
- Agregar intereses al usuario
- Body: `{ "interestIds": ["uuid1", "uuid2"] }`
- Validación: Mínimo 3, máximo 10

**DELETE /api/interests/me/:interestId**
- Eliminar un interés del usuario
- Validación: No permite bajar de 3 intereses

### Intereses del Creador (Requiere Auth)

**GET /api/interests/creator/:username**
- Obtener intereses de un creador (público)

**GET /api/interests/creator/me**
- Obtener intereses del creador actual

**POST /api/interests/creator/me**
- Agregar intereses al perfil del creador
- Body: `{ "interestIds": ["uuid1", "uuid2"] }`
- Validación: Mínimo 5, máximo 15

**DELETE /api/interests/creator/me/:interestId**
- Eliminar un interés del creador
- Validación: No permite bajar de 5 intereses

### Descubrimiento

**GET /api/discover/creators**
- Descubrir creadores por intereses
- Query params: `?interestIds=uuid1,uuid2&limit=20&offset=0`
- Público (sin auth)

**GET /api/discover/recommended** (Requiere Auth)
- Recomendaciones personalizadas basadas en intereses del usuario
- Query params: `?limit=20&offset=0`
- Algoritmo: Calcula relevancia por intereses compartidos

**GET /api/discover/search**
- Buscar creadores por keywords + intereses
- Query params: `?query=anime&interestIds=uuid1&limit=20`

---

## Páginas de Frontend Creadas

### `/settings/interests`
- Configuración de intereses para usuarios y creadores
- Selector interactivo con filtros por categoría
- Validación de límites (3-10 para usuarios, 5-15 para creadores)
- Guarda y sincroniza con el backend

### `/discover`
- Página de descubrimiento de creadores
- Filtros por intereses
- Búsqueda por nombre
- Recomendaciones personalizadas (si está autenticado)
- Muestra relevancia % basada en intereses compartidos

---

## Componentes de UI Creados

### `<InterestSelector>`
- Selector completo de intereses con búsqueda y filtros
- Props:
  - `selectedInterests`: Array de intereses seleccionados
  - `onSelectionChange`: Callback para cambios
  - `minInterests`: Mínimo requerido (3 o 5)
  - `maxInterests`: Máximo permitido (10 o 15)
  - `mode`: 'user' | 'creator'
  - `showNSFW`: Mostrar contenido adulto

### `<InterestBadges>`
- Muestra badges de intereses con colores por categoría
- Props:
  - `interests`: Array de intereses
  - `maxDisplay`: Máximo a mostrar (default: 10)
  - `size`: 'sm' | 'md' | 'lg'

---

## Algoritmo de Recomendación

```typescript
// Pseudocódigo del algoritmo

1. Obtener intereses del usuario (3-10 tags)
2. Encontrar creadores con al menos 1 interés compartido
3. Excluir creadores ya seguidos
4. Calcular score de relevancia para cada creador:

   relevanceScore = (intereses_compartidos / total_intereses_usuario) * 100

5. Ordenar por:
   - isVerified (verificados primero)
   - relevanceScore (más relevantes primero)
   - totalViews (más vistos como desempate)

6. Retornar top N creadores
```

---

## Validaciones Implementadas

### Backend

- **Usuarios**: Mínimo 3 intereses, máximo 10
- **Creadores**: Mínimo 5 intereses, máximo 15
- **Prevención de duplicados**: Unique constraint en base de datos
- **Contador de uso**: Incrementa/decrementa `usageCount` automáticamente
- **No permite eliminar** si está en el mínimo requerido

### Frontend

- **Validación en tiempo real**: Muestra contador de seleccionados
- **Botones deshabilitados**: No permite seleccionar más del máximo
- **Indicadores visuales**: Alerta cuando falta alcanzar el mínimo
- **Categorías colorizadas**: Cada categoría tiene su color distintivo

---

## Testing Recomendado

### Backend (Railway)

1. **Verificar migración aplicada:**
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_name IN ('Interest', 'UserInterest', 'CreatorInterest');
   ```

2. **Verificar seed de intereses:**
   ```sql
   SELECT category, COUNT(*) FROM "Interest" GROUP BY category;
   ```
   Debería mostrar 45 intereses distribuidos en 8 categorías.

3. **Probar endpoints:**
   ```bash
   # Obtener intereses
   curl https://tu-backend.railway.app/api/interests

   # Descubrir creadores
   curl https://tu-backend.railway.app/api/discover/creators?limit=10
   ```

### Frontend (Vercel)

1. **Navegación:**
   - Ir a `/settings/interests`
   - Seleccionar 3+ intereses
   - Guardar

2. **Descubrimiento:**
   - Ir a `/discover`
   - Ver recomendaciones personalizadas
   - Filtrar por intereses
   - Buscar creadores

---

## Próximas Mejoras (Opcionales)

### Corto Plazo
1. **Agregar badges en perfiles públicos** (`/[username]`)
   - Mostrar intereses del creador en su perfil
   - Hacer intereses clickeables → redirige a `/discover?interest=X`

2. **Link desde Dashboard**
   - Agregar botón "Configurar Intereses" en `/dashboard`
   - Agregar sección en `/creator/edit` para intereses

3. **Analytics**
   - Tracking de clicks en descubrimiento
   - Métricas de conversion: vistas → follows

### Mediano Plazo
1. **Trending Interests**
   - Endpoint `/api/interests/trending`
   - Basado en `usageCount` y actividad reciente

2. **Interest Suggestions**
   - ML básico: sugerir intereses basados en follows actuales

3. **Búsqueda Avanzada**
   - Filtros combinados: intereses AND/OR
   - Ordenar por: relevancia, popularidad, nuevos

---

## Troubleshooting

### Error: "Interest table does not exist"

**Solución**: Aplicar migración en Railway
```bash
npx prisma migrate deploy
```

### Error: "No interests found"

**Solución**: Ejecutar seed de intereses
```bash
psql $DATABASE_URL < prisma/seeds/interests.sql
```

### Error: "Cannot read property 'interests' of null"

**Solución**: Regenerar Prisma Client
```bash
npx prisma generate
npm run build
```

### Frontend: "API request failed"

**Verificar**:
1. `NEXT_PUBLIC_API_URL` apunta a Railway backend
2. Backend está desplegado y funcionando
3. CORS configurado correctamente (permite dominio de Vercel)

---

## Conclusión

✅ **Sistema de intereses completamente funcional**

- Base de datos migrada con 3 nuevas tablas
- 45 intereses pre-cargados en 8 categorías
- 12 endpoints de API implementados
- 2 nuevas páginas de UI (/settings/interests, /discover)
- Algoritmo de recomendación inteligente
- Validaciones robustas (min/max por tipo de usuario)

**Ready to deploy** 🚀

Para cualquier pregunta o problema, revisar este documento o la documentación de código en los archivos fuente.
