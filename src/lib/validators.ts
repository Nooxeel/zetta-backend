/**
 * Validación de entrada con Zod
 * Esquemas para validar datos de usuario antes de procesarlos
 */
import { z } from 'zod'

// ============================================
// Validadores de Auth
// ============================================

/**
 * Requisitos de contraseña:
 * - Mínimo 8 caracteres
 * - Máximo 128 caracteres (prevenir DoS con contraseñas muy largas)
 * - Al menos una mayúscula
 * - Al menos una minúscula
 * - Al menos un número
 * - Opcionalmente un carácter especial
 */
const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no puede exceder 128 caracteres')
  .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
  .regex(/[a-z]/, 'La contraseña debe contener al menos una minúscula')
  .regex(/[0-9]/, 'La contraseña debe contener al menos un número')

const usernameSchema = z
  .string()
  .min(3, 'El username debe tener al menos 3 caracteres')
  .max(30, 'El username no puede exceder 30 caracteres')
  .regex(/^[a-zA-Z0-9_]+$/, 'El username solo puede contener letras, números y guiones bajos')

const emailSchema = z
  .string()
  .email('Email inválido')
  .max(255, 'El email no puede exceder 255 caracteres')

const displayNameSchema = z
  .string()
  .min(1, 'El nombre es requerido')
  .max(100, 'El nombre no puede exceder 100 caracteres')

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  isCreator: z.boolean().optional().default(false),
  referralCode: z.string().max(20).optional() // Optional referral code from ?ref= URL
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'La contraseña es requerida')
})

// ============================================
// Validadores de Perfil
// ============================================

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  bio: z.string().max(500, 'La bio no puede exceder 500 caracteres').optional(),
  avatar: z.string().url('URL de avatar inválida').optional().nullable()
})

// ============================================
// Validadores de Creador
// ============================================

const colorSchema = z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Color inválido').optional()

const urlSchema = z.string().url('URL inválida').optional().nullable()

export const updateCreatorProfileSchema = z.object({
  bio: z.string().max(5000, 'La bio no puede exceder 5000 caracteres').optional(),
  bioTitle: z.string().max(100, 'El título no puede exceder 100 caracteres').optional(),
  extendedInfo: z.string().max(5000, 'La información extendida no puede exceder 5000 caracteres').optional(),
  extendedInfoTitle: z.string().max(100, 'El título no puede exceder 100 caracteres').optional(),
  backgroundColor: colorSchema,
  backgroundGradient: z.string().max(500).optional().nullable(),
  backgroundImage: urlSchema,
  accentColor: colorSchema,
  textColor: colorSchema,
  fontFamily: z.string().max(100).optional(),
  coverImage: urlSchema,
  visibilitySettings: z.record(z.string(), z.boolean()).optional()
})

// ============================================
// Validadores de Posts
// ============================================

const contentItemSchema = z.object({
  type: z.enum(['image', 'video', 'audio']),
  url: z.string().url('URL de contenido inválida'),
  thumbnail: z.string().url('URL de thumbnail inválida').optional().nullable(),
  caption: z.string().max(500, 'El caption no puede exceder 500 caracteres').optional(),
  isBlurred: z.boolean().optional()
})

export const createPostSchema = z.object({
  title: z.string().max(200, 'El título no puede exceder 200 caracteres').optional().nullable(),
  description: z.string().max(1000, 'La descripción no puede exceder 1000 caracteres').optional().nullable(),
  content: z.array(contentItemSchema).min(1, 'Se requiere al menos un elemento de contenido'),
  visibility: z.enum(['public', 'authenticated', 'subscribers']).default('public'),
  isPinned: z.boolean().optional().default(false)
})

// ============================================
// Validadores de Comentarios
// ============================================

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'El comentario no puede estar vacío')
    .max(2000, 'El comentario no puede exceder 2000 caracteres')
})

// ============================================
// Validadores de Suscripción
// ============================================

export const createSubscriptionTierSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder 100 caracteres'),
  description: z.string().max(500, 'La descripción no puede exceder 500 caracteres').optional(),
  price: z.number().min(0, 'El precio no puede ser negativo').max(1000000, 'El precio es demasiado alto'),
  benefits: z.array(z.string().max(200)).max(20).optional(),
  isActive: z.boolean().optional().default(true)
})

// ============================================
// Validadores de Donación
// ============================================

export const createDonationSchema = z.object({
  amount: z.number().min(100, 'La donación mínima es $100').max(10000000, 'La donación excede el límite'),
  message: z.string().max(500, 'El mensaje no puede exceder 500 caracteres').optional()
})

// ============================================
// Validadores de Mensajes
// ============================================

export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'El mensaje no puede estar vacío')
    .max(5000, 'El mensaje no puede exceder 5000 caracteres')
})

// ============================================
// Utilidad de validación
// ============================================

export type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; errors: string[] }

/**
 * Valida datos contra un esquema Zod
 * Retorna los datos parseados o un array de errores
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data)
  
  if (result.success) {
    return { success: true, data: result.data }
  }
  
  // Zod v4 usa .issues en lugar de .errors
  const errors = result.error.issues.map((issue: z.ZodIssue) => 
    issue.path.length > 0 
      ? `${issue.path.join('.')}: ${issue.message}`
      : issue.message
  )
  
  return { success: false, errors }
}
