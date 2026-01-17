# Plan de Seguridad - Apapacho

## Estado Actual ✅

### Implementado
1. **Autenticación JWT** - Tokens con expiración
2. **Rate Limiting** - Protección contra ataques de fuerza bruta
3. **Sanitización de inputs** - DOMPurify en frontend
4. **CORS configurado** - Solo orígenes permitidos
5. **Bloqueo de usuarios** - Creadores pueden bloquear fans
6. **Verificación de edad** - Antes de ver contenido
7. **Protección de contenido básica** - Bloqueo clic derecho, drag, shortcuts

---

## Plan de Mejoras de Seguridad

### 🔴 Prioridad Alta (Implementar Ya)

#### 1. Headers de Seguridad HTTP
- [ ] Content-Security-Policy (CSP)
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] Strict-Transport-Security (HSTS)
- [ ] Referrer-Policy: strict-origin-when-cross-origin

```typescript
// middleware de Express
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})
```

#### 2. Validación de Uploads
- [ ] Verificar MIME type real (magic bytes)
- [ ] Límite de tamaño por tipo de archivo
- [ ] Escaneo de malware (ClamAV o similar)
- [ ] Renombrar archivos con UUID

#### 3. Protección de Pagos
- [ ] Webhook signature validation (Stripe/etc)
- [ ] Idempotency keys para transacciones
- [ ] Logs de auditoría para pagos
- [ ] Rate limit específico para endpoints de pago

### 🟡 Prioridad Media (Próximas 2 semanas)

#### 4. Autenticación Mejorada
- [ ] Refresh tokens (no solo access tokens)
- [ ] Token revocation list
- [ ] 2FA opcional para creadores
- [ ] Login con OAuth (Google, Apple)
- [ ] Detección de login sospechoso (nueva IP/device)

#### 5. Protección de Contenido Avanzada
- [ ] Watermark dinámico con userId del viewer
- [ ] Tokens de acceso temporales para media
- [ ] CDN con signed URLs (Cloudinary signed delivery)
- [ ] Limite de descargas por usuario
- [ ] Detección de screen recording (difícil, pero posible)

#### 6. Monitoreo y Logging
- [ ] Logs estructurados (JSON)
- [ ] Alertas en actividad sospechosa
- [ ] Dashboard de métricas de seguridad
- [ ] Backup automático de base de datos

### 🟢 Prioridad Baja (Próximo mes)

#### 7. Rate Limiting Avanzado
- [ ] Rate limit por usuario, no solo por IP
- [ ] Sliding window algorithm
- [ ] Captcha después de N intentos fallidos
- [ ] Blacklist de IPs conocidas maliciosas

#### 8. Privacidad y Compliance
- [ ] Exportar datos del usuario (GDPR)
- [ ] Eliminar cuenta completamente
- [ ] Logs de consentimiento
- [ ] Política de retención de datos

#### 9. Infraestructura
- [ ] WAF (Web Application Firewall)
- [ ] DDoS protection (Cloudflare)
- [ ] Secrets management (no .env hardcoded)
- [ ] Penetration testing periódico

---

## Checklist de Seguridad Pre-Launch

- [ ] Todas las rutas sensibles requieren autenticación
- [ ] Passwords hasheados con bcrypt (cost factor >= 10)
- [ ] No secrets en código fuente o logs
- [ ] HTTPS obligatorio en producción
- [ ] Input validation en todos los endpoints
- [ ] Output encoding para prevenir XSS
- [ ] SQL injection prevención (Prisma ORM)
- [ ] CSRF tokens en formularios críticos
- [ ] Session timeout configurado
- [ ] Error messages no revelan info interna

---

## Herramientas Recomendadas

| Herramienta | Uso | Prioridad |
|-------------|-----|-----------|
| Helmet.js | Headers de seguridad | Alta |
| express-validator | Validación de inputs | Alta |
| rate-limiter-flexible | Rate limiting avanzado | Media |
| Sentry | Error tracking | Media |
| Cloudflare | WAF + DDoS | Media |
| OWASP ZAP | Penetration testing | Baja |

---

## Próximos Pasos Inmediatos

1. **Agregar Helmet.js al backend**
2. **Implementar signed URLs para contenido premium**
3. **Agregar refresh tokens**
4. **Configurar CSP headers**
5. **Agregar watermark dinámico con viewer ID**

---

*Última actualización: Enero 2026*
