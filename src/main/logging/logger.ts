import { app } from 'electron';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const resolveConfiguredLevel = (): LogLevel => {
  const raw =
    process.env.PRIVATE_VAULT_LOG_LEVEL ??
    process.env.LOG_LEVEL ??
    '';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized;
  }
  return app.isPackaged ? 'warn' : 'info';
};

const configuredLevel = resolveConfiguredLevel();

const formatTimestamp = (date: Date): string => {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const millis = pad(date.getMilliseconds(), 3);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
};

const formatMeta = (meta?: Record<string, unknown>): string => {
  if (!meta) {
    return '';
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
};

type LogMethod = (message: string, meta?: Record<string, unknown>) => void;

export const getLogger = (scope: string): Record<LogLevel, LogMethod> => {
  const shouldLog = (level: LogLevel): boolean => LEVELS[level] >= LEVELS[configuredLevel];
  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (!shouldLog(level)) {
      return;
    }
    const prefix = `[${formatTimestamp(new Date())}][${level.toUpperCase()}][${scope}]`;
    const line = `${prefix} ${message}${formatMeta(meta)}`;
    switch (level) {
      case 'debug':
        console.log(line);
        break;
      case 'info':
        console.info(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'error':
        console.error(line);
        break;
      default:
        console.log(line);
    }
  };

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
};
