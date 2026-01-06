# Integración de Pasarela de Pagos para Suscripciones

## Estado Actual
- ✅ Sistema de suscripciones funcional con aprobación automática
- ✅ Modelos de base de datos completos
- ✅ API endpoints listos
- ⏳ Pendiente: Integración con pasarela de pagos real

## Opciones de Pasarelas de Pago en Chile

### 1. Flow (Recomendado para Chile)
- **Pros**: Popular en Chile, fácil integración, soporta múltiples bancos
- **URL**: https://www.flow.cl/
- **Pricing**: ~2.9% + IVA por transacción
- **SDK**: `flow-cl` (npm)

### 2. Transbank (Webpay Plus)
- **Pros**: Más usado en Chile, confiable
- **URL**: https://www.transbankdevelopers.cl/
- **Pricing**: ~2.95% + IVA por transacción
- **SDK**: `transbank-sdk` (npm)

### 3. MercadoPago
- **Pros**: Internacional, buena documentación
- **URL**: https://www.mercadopago.cl/
- **Pricing**: ~3.49% + IVA por transacción
- **SDK**: `mercadopago` (npm)

## Flujo de Integración Propuesto

### 1. Frontend: Iniciar Pago
```typescript
// src/app/[username]/page.tsx - handleSubscribe()

const handleSubscribe = async (tierId: string) => {
  setSubscribing(true)
  try {
    // Crear orden de pago
    const response = await subscriptionsApi.createPaymentOrder(
      creator.creatorProfile.id, 
      tierId, 
      token
    )
    
    // Redirigir a pasarela
    window.location.href = response.paymentUrl
    
  } catch (error) {
    alert('Error al iniciar pago')
  } finally {
    setSubscribing(false)
  }
}
```

### 2. Backend: Crear Orden de Pago
```typescript
// src/routes/subscriptions.ts

router.post('/create-payment-order', authenticate, async (req, res) => {
  const { creatorId, tierId } = req.body
  const userId = req.user.userId
  
  // 1. Obtener tier y validar
  const tier = await prisma.subscriptionTier.findFirst({
    where: { id: tierId, creatorId, isActive: true }
  })
  
  // 2. Crear orden de pago con Flow/Transbank
  const paymentOrder = await flowAPI.createPayment({
    amount: tier.price,
    currency: 'CLP',
    subject: `Suscripción ${tier.name}`,
    email: user.email,
    urlConfirmation: `${API_URL}/webhooks/flow/confirm`,
    urlReturn: `${FRONTEND_URL}/${creator.username}?payment=success`,
    urlCancel: `${FRONTEND_URL}/${creator.username}?payment=cancelled`
  })
  
  // 3. Guardar orden pendiente en DB
  await prisma.paymentOrder.create({
    data: {
      orderId: paymentOrder.token,
      userId,
      creatorId,
      tierId,
      amount: tier.price,
      status: 'pending'
    }
  })
  
  res.json({
    paymentUrl: paymentOrder.url,
    token: paymentOrder.token
  })
})
```

### 3. Backend: Webhook de Confirmación
```typescript
// src/routes/webhooks.ts

router.post('/flow/confirm', async (req, res) => {
  const { token } = req.body
  
  // 1. Validar pago con Flow
  const payment = await flowAPI.getPaymentStatus(token)
  
  if (payment.status === 2) { // Pago exitoso
    // 2. Buscar orden pendiente
    const order = await prisma.paymentOrder.findUnique({
      where: { orderId: token }
    })
    
    // 3. Crear suscripción
    await prisma.subscription.create({
      data: {
        userId: order.userId,
        creatorId: order.creatorId,
        tierId: order.tierId,
        status: 'active',
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentOrderId: order.id
      }
    })
    
    // 4. Actualizar estado de orden
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'completed' }
    })
    
    // 5. Enviar email de confirmación (opcional)
    await emailService.sendSubscriptionConfirmation(...)
  }
  
  res.status(200).send('OK')
})
```

### 4. Frontend: Página de Retorno
```typescript
// src/app/[username]/page.tsx - useEffect

useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const paymentStatus = params.get('payment')
  
  if (paymentStatus === 'success') {
    // Recargar perfil para actualizar estado de suscripción
    fetchCreator()
    alert('¡Suscripción exitosa! Gracias por tu apoyo.')
  } else if (paymentStatus === 'cancelled') {
    alert('Pago cancelado. Puedes intentarlo nuevamente.')
  }
}, [])
```

## Modelo de Base de Datos Adicional

```prisma
model PaymentOrder {
  id        String   @id @default(uuid())
  orderId   String   @unique // Token de Flow/Transbank
  userId    String
  creatorId String
  tierId    String
  amount    Float
  currency  String   @default("CLP")
  status    String   @default("pending") // pending, completed, failed, cancelled
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  user         User     @relation(fields: [userId], references: [id])
  subscription Subscription?
  
  @@index([userId])
  @@index([status])
  @@index([orderId])
}

model Subscription {
  // ... campos existentes
  paymentOrderId String?  @unique
  paymentOrder   PaymentOrder? @relation(fields: [paymentOrderId], references: [id])
}
```

## Variables de Entorno Requeridas

```env
# Flow
FLOW_API_KEY=your_api_key
FLOW_SECRET_KEY=your_secret_key
FLOW_API_URL=https://www.flow.cl/api

# o Transbank
TRANSBANK_API_KEY=your_api_key
TRANSBANK_SECRET_KEY=your_secret_key
TRANSBANK_ENVIRONMENT=production # o integration

# URLs
API_URL=https://api.apapacho.com
FRONTEND_URL=https://apapacho.com
```

## Pasos para Implementar

1. **Registrarse en la pasarela elegida** (Flow recomendado)
2. **Instalar SDK**: `npm install flow-cl` o `npm install transbank-sdk`
3. **Crear modelo PaymentOrder** en Prisma schema
4. **Implementar endpoint `/create-payment-order`**
5. **Implementar webhook `/webhooks/flow/confirm`**
6. **Actualizar frontend** para redirigir a pasarela
7. **Probar en ambiente de pruebas** de la pasarela
8. **Configurar webhooks** en panel de la pasarela
9. **Pasar a producción**

## Testing

### Ambiente de Pruebas
- Flow: Proporciona tarjetas de prueba
- Transbank: Ambiente de integración con tarjetas de prueba
- Documentación: Revisar docs oficiales de cada pasarela

### Casos de Prueba
- ✓ Pago exitoso
- ✓ Pago rechazado
- ✓ Pago cancelado por usuario
- ✓ Timeout de pago
- ✓ Usuario ya suscrito intenta pagar nuevamente
- ✓ Webhook duplicado (idempotencia)

## Seguridad

- ✅ Validar siempre el webhook con firma/token de la pasarela
- ✅ Verificar que el monto pagado coincide con el tier
- ✅ No confiar solo en parámetros del frontend
- ✅ Implementar idempotencia en webhooks
- ✅ Logs detallados de todas las transacciones
- ✅ Manejo de reintentos de webhook

## Renovación Automática

Para suscripciones recurrentes:

1. **Guardar método de pago** (si la pasarela lo soporta)
2. **Cron job diario** que busque suscripciones próximas a vencer
3. **Cobrar automáticamente** 3 días antes del vencimiento
4. **Notificar al usuario** antes del cobro
5. **Permitir cancelar** la renovación automática

```typescript
// src/jobs/renewSubscriptions.ts
async function renewExpiringSubs() {
  const expiringDate = new Date()
  expiringDate.setDate(expiringDate.getDate() + 3)
  
  const subscriptions = await prisma.subscription.findMany({
    where: {
      endDate: { lte: expiringDate },
      autoRenew: true,
      status: 'active'
    }
  })
  
  for (const sub of subscriptions) {
    // Intentar cobrar nuevamente
    // Si falla, notificar usuario
    // Si exitoso, extender endDate 30 días más
  }
}
```

## Recursos

- Flow Docs: https://www.flow.cl/docs/api.html
- Transbank Docs: https://www.transbankdevelopers.cl/documentacion/
- MercadoPago Docs: https://www.mercadopago.cl/developers/es/docs
