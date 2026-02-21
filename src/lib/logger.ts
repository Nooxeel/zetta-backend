/**
 * Logger centralizado con niveles y control por entorno
 * En producción, solo muestra warn y error
 * En desarrollo, muestra todos los niveles
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const DEFAULT_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'debug'

class Logger {
  private level: number
  private prefix: string

  constructor(prefix: string = '', level?: LogLevel) {
    this.level = LOG_LEVELS[level || DEFAULT_LEVEL]
    this.prefix = prefix
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.level
  }

  private format(level: LogLevel, message: string): string {
    const ts = new Date().toISOString()
    const tag = this.prefix ? `[${this.prefix}]` : ''
    return `${ts} ${level.toUpperCase()} ${tag} ${message}`
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) console.log(this.format('debug', message), ...args)
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) console.log(this.format('info', message), ...args)
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) console.warn(this.format('warn', message), ...args)
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) console.error(this.format('error', message), ...args)
  }
}

/** Create a namespaced logger */
export function createLogger(prefix: string): Logger {
  return new Logger(prefix)
}

export default Logger
