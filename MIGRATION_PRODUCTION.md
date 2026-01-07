# Migración de Producción: durationDays

## Error en Producción
```
The column `SubscriptionTier.durationDays` does not exist in the current database.
```

## Solución

### Opción 1: Desde Railway Dashboard (RECOMENDADO)

1. Ve a tu proyecto en Railway: https://railway.app
2. Abre el servicio de PostgreSQL
3. Click en "Data" o "Query"
4. Ejecuta este SQL:

```sql
ALTER TABLE "SubscriptionTier" 
ADD COLUMN IF NOT EXISTS "durationDays" INTEGER NOT NULL DEFAULT 30;
```

5. Verifica que se aplicó:
```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'SubscriptionTier' 
AND column_name = 'durationDays';
```

### Opción 2: Desde Railway CLI

1. Instala Railway CLI si no lo tienes:
```bash
npm i -g @railway/cli
```

2. Login:
```bash
railway login
```

3. Conecta al proyecto:
```bash
railway link
```

4. Ejecuta el SQL:
```bash
railway run --service postgresql psql -c "ALTER TABLE \"SubscriptionTier\" ADD COLUMN IF NOT EXISTS \"durationDays\" INTEGER NOT NULL DEFAULT 30;"
```

### Opción 3: Usando Prisma Migrate Deploy

1. Asegúrate de tener las variables de entorno de producción
2. Desde tu local (con DATABASE_URL de producción):

```bash
# CUIDADO: Usa el DATABASE_URL de producción
export DATABASE_URL="postgresql://..."
npx prisma migrate deploy
```

### Opción 4: Script SQL Completo

Ejecuta el archivo `migrations/add_duration_days_production.sql` en Railway.

## Verificación

Después de aplicar la migración, verifica que funcione:

```bash
# En Railway logs deberías ver:
✓ Successfully created subscription tier
```

O prueba creando un tier desde el frontend.

## Rollback (si es necesario)

Si necesitas revertir:

```sql
ALTER TABLE "SubscriptionTier" DROP COLUMN IF EXISTS "durationDays";
```

## Notas

- El campo `durationDays` tiene un valor por defecto de `30` días
- Los tiers existentes automáticamente tendrán `durationDays = 30`
- Los valores válidos son: 30 (mensual), 90 (trimestral), 365 (anual)
