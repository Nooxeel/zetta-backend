/**
 * Logger centralizado con niveles y control por entorno
 * En producción, solo muestra warn y error
 * En desarrollo, muestra todos los niveles
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  prefix: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// En producción, solo warn y error. En desarrollo, todo.
const DEFAULT_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'debug';

class Logger {
  private level: number;
  private prefix: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.level = LOG_LEVELS[config.level || DEFAULT_LEVEL];
    this.prefix = config.prefix || '';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.level;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}]` : '';
    return `${timestamp} ${level.toUpperCase()} ${prefix} ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }

  /**
   * Crea un logger con un prefijo específico
   */
  child(prefix: string): Logger {
    return new Logger({
      level: Object.keys(LOG_LEVELS).find(
        (key) => LOG_LEVELS[key as LogLevel] === this.level
      ) as LogLevel,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
    });
  }
}

// Logger por defecto
export const logger = new Logger();

// Factory para crear loggers con prefijo
export function createLogger(prefix: string): Logger {
  return new Logger({ prefix });
}

// Export de la clase para casos especiales
export { Logger };

export default logger;
