# 🚀 Deployment Guide - Apapacho Backend

## 📦 Paso 1: Desplegar Backend en Railway

### 1.1 Crear cuenta en Railway
1. Ve a https://railway.app
2. Regístrate con GitHub
3. Crea un nuevo proyecto: **New Project** → **Deploy from GitHub repo**

### 1.2 Conectar repositorio
1. Conecta tu cuenta de GitHub
2. Selecciona el repositorio `apapacho-backend`
3. Railway detectará automáticamente el `railway.json`

### 1.3 Configurar PostgreSQL
1. En tu proyecto de Railway, haz clic en **+ New**
2. Selecciona **Database** → **Add PostgreSQL**
3. Railway creará automáticamente la base de datos
4. La variable `DATABASE_URL` se agregará automáticamente

### 1.4 Configurar variables de entorno
En Railway, ve a tu servicio → **Variables** y agrega:

```env
JWT_SECRET=tu-secreto-super-seguro-cambiar-esto
FRONTEND_URL=https://tu-app.vercel.app
NODE_ENV=production
```

**⚠️ IMPORTANTE:** Cambia `JWT_SECRET` por un valor aleatorio seguro:
```bash
# Genera uno con:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 1.5 Deployment automático
- Railway desplegará automáticamente
- Ejecutará: `npm install && npx prisma generate && npm run build`
- Luego: `npx prisma db push && npm start`
- Obtendrás una URL tipo: `https://apapacho-backend.up.railway.app`

### 1.6 Verificar deployment
```bash
curl https://tu-backend.up.railway.app/api/health
# Debe responder: {"status":"ok","timestamp":"..."}
```

---

## 🗄️ Paso 2: Verificar Migración a PostgreSQL

El `schema.prisma` ya está configurado para PostgreSQL:
```prisma
datasource db {
  provider = "postgresql"  // ✅ Ya configurado
  url      = env("DATABASE_URL")
}
```

Railway sincronizará el schema automáticamente con `prisma db push`.

---

## ☁️ Paso 3: Configurar Cloudinary (próximo paso)

Una vez que el backend esté desplegado, configuraremos Cloudinary para los archivos.

---

## 📝 Notas importantes

- **Railway.json** ya está configurado ✅
- **PostgreSQL** reemplazará a SQLite automáticamente
- **Scripts de build** están listos
- **CORS** está configurado para aceptar el frontend

## 🔗 URLs después del deployment

- Backend: `https://tu-app.up.railway.app`
- Health check: `https://tu-app.up.railway.app/api/health`
- API docs: Ver `DEVELOPMENT.md`

---

## ⚡ Comandos útiles Railway CLI

```bash
# Instalar Railway CLI
npm i -g @railway/cli

# Login
railway login

# Ver logs
railway logs

# Conectar a la base de datos
railway connect postgres
```
