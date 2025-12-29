# 🚀 Deployment Checklist - Apapacho

## ✅ Backend (Railway) - Listo para deployment

### Archivos configurados:
- ✅ `railway.json` - Configuración de Railway
- ✅ `package.json` - Scripts de build y dependencias
- ✅ `.env.example` - Template de variables
- ✅ `schema.prisma` - PostgreSQL configurado
- ✅ `.railwayignore` - Archivos excluidos

### Pasos para desplegar:

1. **Crear cuenta en Railway**
   - Ve a https://railway.app
   - Sign up con GitHub

2. **Crear nuevo proyecto**
   - Click "New Project"
   - "Deploy from GitHub repo"
   - Selecciona `apapacho-backend`

3. **Agregar PostgreSQL**
   - En tu proyecto: "+ New"
   - "Database" → "PostgreSQL"
   - Railway conecta automáticamente `DATABASE_URL`

4. **Configurar variables de entorno**
   ```
   JWT_SECRET=<generar-uno-seguro>
   FRONTEND_URL=https://tu-app.vercel.app
   NODE_ENV=production
   ```

5. **Deploy automático**
   - Railway construye y despliega automáticamente
   - Obtienes URL: `https://apapacho-backend.up.railway.app`

6. **Verificar**
   ```bash
   curl https://tu-backend.up.railway.app/api/health
   ```

---

## 📝 Próximos pasos después del deployment:

1. ✅ **Backend en Railway** ← ESTAMOS AQUÍ
2. ⏳ **Configurar Cloudinary** (para archivos)
3. ⏳ **Actualizar variables de entorno** (frontend)
4. ⏳ **Deploy frontend en Vercel**

---

## 🔑 Generar JWT_SECRET seguro

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copia el resultado y úsalo como `JWT_SECRET` en Railway.

---

## 🆘 Solución de problemas

### Error: "Cannot find module '@prisma/client'"
- Verifica que `@prisma/client` y `prisma` estén en `dependencies` ✅ (ya arreglado)

### Error de base de datos
- Verifica que PostgreSQL esté agregado al proyecto
- La variable `DATABASE_URL` debe estar presente automáticamente

### CORS errors
- Actualiza `FRONTEND_URL` con tu dominio de Vercel
- No uses `/` al final de la URL

---

## 📞 Contacto

Ver `DEPLOYMENT.md` para guía detallada.
