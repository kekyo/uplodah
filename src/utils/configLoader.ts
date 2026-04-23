// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import JSON5 from 'json5';
import {
  LogLevel,
  AuthMode,
  Logger,
  StorageConfig,
  StoragePermission,
} from '../types';

/**
 * Configuration file structure for uplodah
 */
export interface ConfigFile {
  port?: number;
  baseUrl?: string;
  storageDir?: string;
  storage?: StorageConfig;
  usersFile?: string;
  realm?: string;
  logLevel?: LogLevel;
  trustedProxies?: string[];
  authMode?: AuthMode;
  sessionSecret?: string;
  passwordMinScore?: number;
  passwordStrengthCheck?: boolean;
  maxUploadSizeMb?: number;
  maxDownloadSizeMb?: number;
}

/**
 * Validates and sanitizes a config file object
 */
const validateConfig = (
  config: any,
  configDir: string,
  logger?: Logger
): ConfigFile => {
  const validated: ConfigFile = {};
  const validStoragePermissions: readonly StoragePermission[] = [
    'store',
    'delete',
  ];

  const validateStorage = (storage: any): StorageConfig | undefined => {
    if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
      logger?.warn('Invalid storage in config.json: expected an object');
      return undefined;
    }

    const validatedStorage: StorageConfig = {};

    for (const [directoryPath, rawRule] of Object.entries(storage)) {
      if (typeof directoryPath !== 'string') {
        logger?.warn('Invalid storage rule key in config.json');
        continue;
      }

      if (!directoryPath.startsWith('/')) {
        logger?.warn(
          `Invalid storage directory "${directoryPath}" in config.json: must start with /`
        );
        continue;
      }

      if (directoryPath.includes('\\')) {
        logger?.warn(
          `Invalid storage directory "${directoryPath}" in config.json: backslashes are not allowed`
        );
        continue;
      }

      const segments = directoryPath.split('/').filter((segment) => segment);
      if (segments.some((segment) => segment === '.' || segment === '..')) {
        logger?.warn(
          `Invalid storage directory "${directoryPath}" in config.json: . and .. are not allowed`
        );
        continue;
      }

      if (
        rawRule === null ||
        typeof rawRule !== 'object' ||
        Array.isArray(rawRule)
      ) {
        logger?.warn(
          `Invalid storage rule for "${directoryPath}" in config.json: expected an object`
        );
        continue;
      }

      const validatedRule: StorageConfig[string] = {};

      if ('description' in rawRule) {
        if (typeof rawRule.description === 'string') {
          validatedRule.description = rawRule.description;
        } else {
          logger?.warn(
            `Invalid description for "${directoryPath}" in config.json: expected string`
          );
        }
      }

      if ('accept' in rawRule) {
        if (Array.isArray(rawRule.accept)) {
          const acceptedPermissions = Array.from(
            new Set(
              rawRule.accept.filter((value): value is StoragePermission =>
                validStoragePermissions.includes(value as StoragePermission)
              )
            )
          );
          if (acceptedPermissions.length !== rawRule.accept.length) {
            logger?.warn(
              `Invalid accept for "${directoryPath}" in config.json: expected "store" and/or "delete"`
            );
          }
          validatedRule.accept = acceptedPermissions;
        } else {
          logger?.warn(
            `Invalid accept for "${directoryPath}" in config.json: expected an array`
          );
        }
      }

      if ('expireSeconds' in rawRule) {
        if (
          typeof rawRule.expireSeconds === 'number' &&
          Number.isFinite(rawRule.expireSeconds) &&
          rawRule.expireSeconds >= 1
        ) {
          validatedRule.expireSeconds = rawRule.expireSeconds;
        } else {
          logger?.warn(
            `Invalid expireSeconds for "${directoryPath}" in config.json: expected a positive number`
          );
        }
      }

      validatedStorage[directoryPath] = validatedRule;
    }

    return Object.keys(validatedStorage).length > 0 ? validatedStorage : {};
  };

  // Validate port
  if (
    typeof config.port === 'number' &&
    config.port > 0 &&
    config.port <= 65535
  ) {
    validated.port = config.port;
  } else if (config.port !== undefined) {
    logger?.warn(`Invalid port in config.json: ${config.port}`);
  }

  // Validate baseUrl
  if (typeof config.baseUrl === 'string') {
    validated.baseUrl = config.baseUrl;
  }

  // Validate storageDir and resolve relative paths from config directory
  if (typeof config.storageDir === 'string') {
    validated.storageDir = resolve(configDir, config.storageDir);
  }

  // Validate storage rules
  if (config.storage !== undefined) {
    const validatedStorage = validateStorage(config.storage);
    if (validatedStorage !== undefined) {
      validated.storage = validatedStorage;
    }
  }

  // Validate usersFile and resolve relative paths from config directory
  if (typeof config.usersFile === 'string') {
    // path.resolve handles both absolute and relative paths correctly
    // If absolute: returns as-is, if relative: resolves from configDir
    validated.usersFile = resolve(configDir, config.usersFile);
  }

  // Validate realm
  if (typeof config.realm === 'string') {
    validated.realm = config.realm;
  }

  // Validate logLevel
  if (typeof config.logLevel === 'string') {
    const validLevels: LogLevel[] = [
      'debug',
      'info',
      'warn',
      'error',
      'ignore',
    ];
    if (validLevels.includes(config.logLevel as LogLevel)) {
      validated.logLevel = config.logLevel as LogLevel;
    } else {
      logger?.warn(`Invalid logLevel in config.json: ${config.logLevel}`);
    }
  }

  // Validate trustedProxies
  if (Array.isArray(config.trustedProxies)) {
    const validProxies = config.trustedProxies.filter(
      (ip: any) => typeof ip === 'string'
    );
    if (validProxies.length > 0) {
      validated.trustedProxies = validProxies;
    }
    if (validProxies.length !== config.trustedProxies.length) {
      logger?.warn(
        'Some invalid trusted proxy IPs in config.json were ignored'
      );
    }
  }

  // Validate authMode
  if (typeof config.authMode === 'string') {
    const validModes: AuthMode[] = ['none', 'publish', 'full'];
    if (validModes.includes(config.authMode as AuthMode)) {
      validated.authMode = config.authMode as AuthMode;
    } else {
      logger?.warn(`Invalid authMode in config.json: ${config.authMode}`);
    }
  }

  // Validate sessionSecret
  if (typeof config.sessionSecret === 'string') {
    validated.sessionSecret = config.sessionSecret;
    if (logger) {
      logger.warn(
        'Session secret found in config.json. Consider using environment variable UPLODAH_SESSION_SECRET instead for better security.'
      );
    }
  }

  // Validate passwordMinScore
  if (
    typeof config.passwordMinScore === 'number' &&
    config.passwordMinScore >= 0 &&
    config.passwordMinScore <= 4
  ) {
    validated.passwordMinScore = config.passwordMinScore;
  } else if (config.passwordMinScore !== undefined) {
    logger?.warn(
      `Invalid passwordMinScore in config.json: ${config.passwordMinScore}. Must be 0-4.`
    );
  }

  // Validate passwordStrengthCheck
  if (typeof config.passwordStrengthCheck === 'boolean') {
    validated.passwordStrengthCheck = config.passwordStrengthCheck;
  }

  // Validate maxUploadSizeMb
  if (
    typeof config.maxUploadSizeMb === 'number' &&
    config.maxUploadSizeMb >= 1 &&
    config.maxUploadSizeMb <= 10000
  ) {
    validated.maxUploadSizeMb = config.maxUploadSizeMb;
  } else if (config.maxUploadSizeMb !== undefined) {
    logger?.warn(
      `Invalid maxUploadSizeMb in config.json: ${config.maxUploadSizeMb}. Must be between 1 and 10000 MB.`
    );
  }

  // Validate maxDownloadSizeMb
  if (
    typeof config.maxDownloadSizeMb === 'number' &&
    config.maxDownloadSizeMb >= 1 &&
    config.maxDownloadSizeMb <= 10000
  ) {
    validated.maxDownloadSizeMb = config.maxDownloadSizeMb;
  } else if (config.maxDownloadSizeMb !== undefined) {
    logger?.warn(
      `Invalid maxDownloadSizeMb in config.json: ${config.maxDownloadSizeMb}. Must be between 1 and 10000 MB.`
    );
  }

  return validated;
};

/**
 * Loads configuration from a config.json file at the specified path
 * @param configPath Path to the config.json file
 * @param logger Optional logger for warnings
 * @returns Parsed and validated configuration object, or empty object if file doesn't exist or is invalid
 */
export const loadConfigFromPath = async (
  configPath: string,
  logger?: Logger
): Promise<ConfigFile> => {
  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON5.parse(content);

    logger?.debug(`Loaded configuration from ${configPath}`);

    // Extract directory from config file path for relative path resolution
    const configDir =
      configPath.substring(0, configPath.lastIndexOf('/')) ||
      configPath.substring(0, configPath.lastIndexOf('\\')) ||
      '.';

    return validateConfig(config, configDir, logger);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist - this is normal, return empty config
      logger?.debug(`No config file found at ${configPath}`);
      return {};
    } else if (error instanceof SyntaxError) {
      // JSON5 parse error
      logger?.warn(`Failed to parse config file: ${error.message}`);
      return {};
    } else {
      // Other errors (permissions, etc.)
      logger?.warn(`Failed to load config file: ${error.message}`);
      return {};
    }
  }
};

/**
 * Loads configuration from a config.json file in the specified directory
 * @param configDir Directory containing config.json
 * @param logger Optional logger for warnings
 * @returns Parsed and validated configuration object, or empty object if file doesn't exist or is invalid
 * @deprecated Use loadConfigFromPath instead
 */
export const loadConfigFromFile = async (
  configDir: string,
  logger?: Logger
): Promise<ConfigFile> => {
  const configPath = join(configDir, 'config.json');
  return loadConfigFromPath(configPath, logger);
};
