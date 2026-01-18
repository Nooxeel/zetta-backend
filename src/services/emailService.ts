/**
 * Email Service using Resend
 * 
 * Handles all transactional emails:
 * - Password reset
 * - Email verification
 * - Payment notifications
 * - Subscription notifications
 */

import { Resend } from 'resend'
import { createLogger } from '../lib/logger'

const logger = createLogger('EmailService')

// Lazy initialization to avoid errors if RESEND_API_KEY not set
let resend: Resend | null = null

function getResend(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured')
    }
    resend = new Resend(apiKey)
  }
  return resend
}

// Email configuration
const FROM_EMAIL = process.env.EMAIL_FROM || 'Apapacho <noreply@apapacho.com>'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  username: string
): Promise<EmailResult> {
  try {
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`
    
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Restablecer tu contraseña - Apapacho',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 40px 20px; margin: 0;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #ec4899; margin: 0; font-size: 28px;">💜 Apapacho</h1>
            </div>
            
            <h2 style="color: #ffffff; margin-bottom: 20px; font-size: 20px;">Hola ${username},</h2>
            
            <p style="color: #a0a0a0; line-height: 1.6; margin-bottom: 20px;">
              Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para crear una nueva:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: linear-gradient(135deg, #ec4899, #8b5cf6); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Restablecer Contraseña
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Este enlace expirará en <strong>1 hora</strong>. Si no solicitaste este cambio, puedes ignorar este correo.
            </p>
            
            <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;">
            
            <p style="color: #666; font-size: 12px; text-align: center;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <a href="${resetUrl}" style="color: #ec4899; word-break: break-all;">${resetUrl}</a>
            </p>
          </div>
        </body>
        </html>
      `,
    })

    if (error) {
      logger.error('Failed to send password reset email:', error)
      return { success: false, error: error.message }
    }

    logger.info(`Password reset email sent to ${email}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    logger.error('Error sending password reset email:', error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  username: string
): Promise<EmailResult> {
  try {
    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`
    
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: '¡Verifica tu email! - Apapacho',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 40px 20px; margin: 0;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #ec4899; margin: 0; font-size: 28px;">💜 Apapacho</h1>
            </div>
            
            <h2 style="color: #ffffff; margin-bottom: 20px; font-size: 20px;">¡Bienvenido/a ${username}! 🎉</h2>
            
            <p style="color: #a0a0a0; line-height: 1.6; margin-bottom: 20px;">
              Gracias por registrarte en Apapacho. Solo necesitas verificar tu correo electrónico para completar tu registro:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="background: linear-gradient(135deg, #ec4899, #8b5cf6); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Verificar Email
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Este enlace expirará en <strong>24 horas</strong>.
            </p>
            
            <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;">
            
            <p style="color: #666; font-size: 12px; text-align: center;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <a href="${verifyUrl}" style="color: #ec4899; word-break: break-all;">${verifyUrl}</a>
            </p>
          </div>
        </body>
        </html>
      `,
    })

    if (error) {
      logger.error('Failed to send verification email:', error)
      return { success: false, error: error.message }
    }

    logger.info(`Verification email sent to ${email}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    logger.error('Error sending verification email:', error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Send welcome email after verification
 */
export async function sendWelcomeEmail(
  email: string,
  username: string,
  isCreator: boolean
): Promise<EmailResult> {
  try {
    const dashboardUrl = isCreator 
      ? `${FRONTEND_URL}/creator/edit`
      : `${FRONTEND_URL}/dashboard`
    
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: '¡Tu cuenta está lista! - Apapacho',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 40px 20px; margin: 0;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #ec4899; margin: 0; font-size: 28px;">💜 Apapacho</h1>
            </div>
            
            <h2 style="color: #ffffff; margin-bottom: 20px; font-size: 20px;">¡Estás listo/a, ${username}! 🚀</h2>
            
            <p style="color: #a0a0a0; line-height: 1.6; margin-bottom: 20px;">
              Tu email ha sido verificado exitosamente. ${isCreator 
                ? 'Ya puedes comenzar a personalizar tu perfil y conectar con tus fans.'
                : 'Ya puedes explorar y apoyar a tus creadores favoritos.'}
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}" style="background: linear-gradient(135deg, #ec4899, #8b5cf6); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                ${isCreator ? 'Ir a mi Perfil' : 'Explorar Creadores'}
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;">
            
            <p style="color: #666; font-size: 12px; text-align: center;">
              ¿Tienes preguntas? Responde a este correo y te ayudaremos.
            </p>
          </div>
        </body>
        </html>
      `,
    })

    if (error) {
      logger.error('Failed to send welcome email:', error)
      return { success: false, error: error.message }
    }

    logger.info(`Welcome email sent to ${email}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    logger.error('Error sending welcome email:', error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

/**
 * Send subscription renewal confirmation email
 */
export async function sendSubscriptionRenewalEmail(
  email: string,
  username: string,
  creatorName: string,
  tierName: string,
  price: number,
  newEndDate: Date
): Promise<EmailResult> {
  try {
    const formattedDate = newEndDate.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Tu suscripción a ${creatorName} fue renovada - Apapacho`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 40px 20px; margin: 0;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #ec4899; margin: 0; font-size: 28px;">💜 Apapacho</h1>
            </div>
            
            <h2 style="color: #ffffff; margin-bottom: 20px; font-size: 20px;">¡Suscripción renovada! 🎉</h2>
            
            <p style="color: #a0a0a0; line-height: 1.6; margin-bottom: 20px;">
              Hola ${username}, tu suscripción a <strong style="color: #ffffff;">${creatorName}</strong> ha sido renovada exitosamente.
            </p>
            
            <div style="background: #0f0f0f; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #a0a0a0;">📦 Plan: <strong style="color: #ffffff;">${tierName}</strong></p>
              <p style="margin: 0 0 10px 0; color: #a0a0a0;">💰 Monto: <strong style="color: #22c55e;">$${price.toLocaleString('es-CL')} CLP</strong></p>
              <p style="margin: 0; color: #a0a0a0;">📅 Válido hasta: <strong style="color: #ffffff;">${formattedDate}</strong></p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;">
            
            <p style="color: #666; font-size: 12px; text-align: center;">
              Si no reconoces este cargo, contacta a soporte inmediatamente.
            </p>
          </div>
        </body>
        </html>
      `,
    })

    if (error) {
      logger.error('Failed to send renewal email:', error)
      return { success: false, error: error.message }
    }

    logger.info(`Renewal email sent to ${email}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    logger.error('Error sending renewal email:', error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Send subscription expired notification email
 */
export async function sendSubscriptionExpiredEmail(
  email: string,
  username: string,
  creatorName: string,
  tierName: string
): Promise<EmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Tu suscripción a ${creatorName} ha expirado - Apapacho`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 40px 20px; margin: 0;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #ec4899; margin: 0; font-size: 28px;">💜 Apapacho</h1>
            </div>
            
            <h2 style="color: #ffffff; margin-bottom: 20px; font-size: 20px;">Tu suscripción ha expirado 😢</h2>
            
            <p style="color: #a0a0a0; line-height: 1.6; margin-bottom: 20px;">
              Hola ${username}, tu suscripción al plan <strong style="color: #ffffff;">${tierName}</strong> de <strong style="color: #ffffff;">${creatorName}</strong> ha expirado.
            </p>
            
            <p style="color: #a0a0a0; line-height: 1.6; margin-bottom: 20px;">
              Ya no tendrás acceso al contenido exclusivo de este creador. ¡Pero puedes renovar en cualquier momento!
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${FRONTEND_URL}" style="background: linear-gradient(135deg, #ec4899, #8b5cf6); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Renovar Suscripción
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;">
            
            <p style="color: #666; font-size: 12px; text-align: center;">
              Gracias por ser parte de Apapacho. ¡Esperamos verte pronto!
            </p>
          </div>
        </body>
        </html>
      `,
    })

    if (error) {
      logger.error('Failed to send expiration email:', error)
      return { success: false, error: error.message }
    }

    logger.info(`Expiration email sent to ${email}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    logger.error('Error sending expiration email:', error)
    return { success: false, error: (error as Error).message }
  }
}
