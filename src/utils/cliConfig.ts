// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { dirname } from 'path';
import { LogLevel, ServerConfig } from '../types';

/**
 * Commander option values used to resolve runtime configuration.
 */
export interface CliOptionValues {
  /**
   * Port option.
   */
  port?: string;
  /**
   * Base URL option.
   */
  baseUrl?: string;
  /**
   * Storage directory option.
   */
  storageDir?: string;
  /**
   * Config file path option.
   */
  configFile?: string;
  /**
   * Realm option.
   */
  realm?: string;
  /**
   * Log level option.
   */
  logLevel?: LogLevel;
  /**
   * Trusted proxies option.
   */
  trustedProxies?: string;
  /**
   * Maximum upload size option.
   */
  maxUploadSizeMb?: string;
}

/**
 * Runtime configuration resolved from CLI, environment, config file, and defaults.
 */
export interface ResolvedCliConfig {
  /**
   * Selected config file path.
   */
  configFilePath: string;
  /**
   * Final server configuration.
   */
  config: ServerConfig;
}

const validLogLevels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'ignore'];

const parseInteger = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
};

const getPortFromEnv = (env: NodeJS.ProcessEnv): number | undefined => {
  const port = env['UPLODAH_PORT'];
  return port ? parseInteger(port, 'port') : undefined;
};

const getStorageDirFromEnv = (env: NodeJS.ProcessEnv): string | undefined =>
  env['UPLODAH_STORAGE_DIR'];

const getBaseUrlFromEnv = (env: NodeJS.ProcessEnv): string | undefined =>
  env['UPLODAH_BASE_URL'];

const getConfigFileFromEnv = (env: NodeJS.ProcessEnv): string | undefined =>
  env['UPLODAH_CONFIG_FILE'];

const getRealmFromEnv = (env: NodeJS.ProcessEnv): string | undefined =>
  env['UPLODAH_REALM'];

const getTrustedProxiesFromEnv = (
  env: NodeJS.ProcessEnv
): string[] | undefined => {
  const value = env['UPLODAH_TRUSTED_PROXIES'];
  if (!value) {
    return undefined;
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const getLogLevelFromEnv = (env: NodeJS.ProcessEnv): LogLevel | undefined => {
  const value = env['UPLODAH_LOG_LEVEL'];
  return validLogLevels.includes(value as LogLevel)
    ? (value as LogLevel)
    : undefined;
};

const getMaxUploadSizeMbFromEnv = (
  env: NodeJS.ProcessEnv
): number | undefined => {
  const value = env['UPLODAH_MAX_UPLOAD_SIZE_MB'];
  return value ? parseInteger(value, 'max upload size') : undefined;
};

const validateResolvedConfig = (config: ServerConfig): ServerConfig => {
  if (
    config.port === undefined ||
    config.port <= 0 ||
    config.port > 65535 ||
    Number.isNaN(config.port)
  ) {
    throw new Error('Invalid port number');
  }

  if (
    config.maxUploadSizeMb === undefined ||
    config.maxUploadSizeMb < 1 ||
    config.maxUploadSizeMb > 10000 ||
    Number.isNaN(config.maxUploadSizeMb)
  ) {
    throw new Error('Invalid max upload size. Must be between 1 and 10000 MB');
  }

  if (
    config.logLevel === undefined ||
    !validLogLevels.includes(config.logLevel as LogLevel)
  ) {
    throw new Error(
      `Invalid log level: ${String(config.logLevel)}. Valid levels are: ${validLogLevels.join(', ')}`
    );
  }

  return config;
};

/**
 * Resolves the config file path using CLI, environment, and defaults.
 * @param options CLI option values.
 * @param env Environment variables.
 * @returns Config file path.
 */
export const resolveConfigFilePath = (
  options: CliOptionValues,
  env: NodeJS.ProcessEnv
): string => options.configFile || getConfigFileFromEnv(env) || './config.json';

/**
 * Resolves the runtime server configuration with precedence `CLI > ENV > config > default`.
 * @param options CLI option values.
 * @param env Environment variables.
 * @param fileConfig Loaded config file values.
 * @returns Final config file path and server config.
 */
export const resolveCliServerConfig = (input: {
  options: CliOptionValues;
  env: NodeJS.ProcessEnv;
  fileConfig: ServerConfig;
  defaultRealm: string;
}): ResolvedCliConfig => {
  const configFilePath = resolveConfigFilePath(input.options, input.env);

  const resolvedConfig = validateResolvedConfig({
    port:
      input.options.port !== undefined
        ? parseInteger(input.options.port, 'port')
        : (getPortFromEnv(input.env) ?? input.fileConfig.port ?? 5968),
    baseUrl:
      input.options.baseUrl ||
      getBaseUrlFromEnv(input.env) ||
      input.fileConfig.baseUrl,
    trustedProxies: input.options.trustedProxies
      ? input.options.trustedProxies
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : (getTrustedProxiesFromEnv(input.env) ??
        input.fileConfig.trustedProxies),
    storageDir:
      input.options.storageDir ||
      getStorageDirFromEnv(input.env) ||
      input.fileConfig.storageDir ||
      './storage',
    configDir: dirname(configFilePath),
    realm:
      input.options.realm ||
      getRealmFromEnv(input.env) ||
      input.fileConfig.realm ||
      input.defaultRealm,
    logLevel:
      input.options.logLevel ||
      getLogLevelFromEnv(input.env) ||
      input.fileConfig.logLevel ||
      'info',
    maxUploadSizeMb:
      input.options.maxUploadSizeMb !== undefined
        ? parseInteger(input.options.maxUploadSizeMb, 'max upload size')
        : (getMaxUploadSizeMbFromEnv(input.env) ??
          input.fileConfig.maxUploadSizeMb ??
          100),
    storage: input.fileConfig.storage,
  });

  return {
    configFilePath,
    config: resolvedConfig,
  };
};
