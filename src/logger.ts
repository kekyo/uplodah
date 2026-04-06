// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import dayjs from 'dayjs';
import { Logger, LogLevel } from './types';

const nowDate = () => dayjs().format('YYYY/MM/DD HH:mm:ss.SSS');

const logLevelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  ignore: 4,
};

/**
 * Creates a console logger with log level filtering.
 * @param prefix Prefix label displayed before each log line.
 * @param logLevel Minimum level to emit.
 * @returns Logger instance.
 */
export const createConsoleLogger = (
  prefix: string | undefined,
  logLevel: LogLevel = 'info'
): Logger => {
  const currentLogLevel = logLevelPriority[logLevel];

  const shouldLog = (level: LogLevel): boolean =>
    logLevelPriority[level] >= currentLogLevel;
  const noop = () => {};

  return prefix
    ? {
        debug: shouldLog('debug')
          ? (msg) =>
              console.debug(`[${prefix}]: [${nowDate()}]: [debug]: ${msg}`)
          : noop,
        info: shouldLog('info')
          ? (msg) => console.info(`[${prefix}]: [${nowDate()}]: [info]: ${msg}`)
          : noop,
        warn: shouldLog('warn')
          ? (msg) =>
              console.warn(`[${prefix}]: [${nowDate()}]: [warning]: ${msg}`)
          : noop,
        error: shouldLog('error')
          ? (msg) =>
              console.error(`[${prefix}]: [${nowDate()}]: [error]: ${msg}`)
          : noop,
      }
    : {
        debug: shouldLog('debug')
          ? (msg) => console.debug(`[${nowDate()}]: [debug]: ${msg}`)
          : noop,
        info: shouldLog('info')
          ? (msg) => console.info(`[${nowDate()}]: [info]: ${msg}`)
          : noop,
        warn: shouldLog('warn')
          ? (msg) => console.warn(`[${nowDate()}]: [warning]: ${msg}`)
          : noop,
        error: shouldLog('error')
          ? (msg) => console.error(`[${nowDate()}]: [error]: ${msg}`)
          : noop,
      };
};
