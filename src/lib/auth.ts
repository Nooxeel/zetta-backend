import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import { createLogger } from './logger'

const logger = createLogger('Auth')

// ─── Configuration ───────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const JWT_EXPIRES_IN = '7d'

if (!JWT_SECRET) {
  logger.error('JWT_SECRET env var is required')
  process.exit(1)
}

if (!GOOGLE_CLIENT_ID) {
  logger.error('GOOGLE_CLIENT_ID env var is required')
  process.exit(1)
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)

// ─── Types ───────────────────────────────────────────
export interface JwtPayload {
  userId: string
  email: string
  role: string
}

export interface GoogleUserInfo {
  googleId: string
  email: string
  name: string | undefined
  image: string | undefined
}

// ─── JWT Functions ───────────────────────────────────
export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET!) as JwtPayload
}

// ─── Google Token Verification ───────────────────────
export async function verifyGoogleToken(credential: string): Promise<GoogleUserInfo> {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  })

  const payload = ticket.getPayload()
  if (!payload || !payload.email) {
    throw new Error('Invalid Google token: no email in payload')
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    image: payload.picture,
  }
}
