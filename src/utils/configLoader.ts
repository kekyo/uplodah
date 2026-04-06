// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import JSON5 from 'json5';
import { Logger, LogLevel, ServerConfig } from '../types';
import { normalizeVirtualDirectoryPath } from './storagePolicy';

/**
 * Configuration file structure for uplodah.
 */
export type ConfigFile = ServerConfig;

const validateConfig = (
  config: unknown,
  configDir: string,
  logger: Logger | undefined
): ConfigFile => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    logger?.warn('Config file root must be a JSON object');
    return {};
  }

  const rawConfig = config as Record<string, unknown>;
  const validated: ConfigFile = {};

  if (
    typeof rawConfig['port'] === 'number' &&
    rawConfig['port'] > 0 &&
    rawConfig['port'] <= 65535
  ) {
    validated.port = rawConfig['port'];
  } else if (rawConfig['port'] !== undefined) {
    logger?.warn(`Invalid port in config.json: ${String(rawConfig['port'])}`);
  }

  if (typeof rawConfig['baseUrl'] === 'string') {
    validated.baseUrl = rawConfig['baseUrl'].replace(/\/$/, '');
  }

  if (typeof rawConfig['storageDir'] === 'string') {
    validated.storageDir = resolve(configDir, rawConfig['storageDir']);
  }

  if (typeof rawConfig['realm'] === 'string') {
    validated.realm = rawConfig['realm'];
  }

  if (typeof rawConfig['logLevel'] === 'string') {
    const validLogLevels: LogLevel[] = [
      'debug',
      'info',
      'warn',
      'error',
      'ignore',
    ];
    if (validLogLevels.includes(rawConfig['logLevel'] as LogLevel)) {
      validated.logLevel = rawConfig['logLevel'] as LogLevel;
    } else {
      logger?.warn(
        `Invalid logLevel in config.json: ${String(rawConfig['logLevel'])}`
      );
    }
  }

  if (typeof rawConfig['maxUploadSizeMb'] === 'number') {
    if (
      rawConfig['maxUploadSizeMb'] >= 1 &&
      rawConfig['maxUploadSizeMb'] <= 10000
    ) {
      validated.maxUploadSizeMb = rawConfig['maxUploadSizeMb'];
    } else {
      logger?.warn(
        `Invalid maxUploadSizeMb in config.json: ${String(rawConfig['maxUploadSizeMb'])}`
      );
    }
  }

  if (Array.isArray(rawConfig['trustedProxies'])) {
    const validTrustedProxies = rawConfig['trustedProxies'].filter(
      (value): value is string => typeof value === 'string'
    );
    if (validTrustedProxies.length > 0) {
      validated.trustedProxies = validTrustedProxies;
    }
    if (validTrustedProxies.length !== rawConfig['trustedProxies'].length) {
      logger?.warn('Some invalid trusted proxies in config.json were ignored');
    }
  }

  if (
    rawConfig['storage'] !== undefined &&
    rawConfig['storage'] !== null &&
    typeof rawConfig['storage'] === 'object' &&
    !Array.isArray(rawConfig['storage'])
  ) {
    const validatedStorage: NonNullable<ConfigFile['storage']> = {};

    for (const [directoryPath, value] of Object.entries(
      rawConfig['storage'] as Record<string, unknown>
    )) {
      let normalizedDirectoryPath: string;
      try {
        normalizedDirectoryPath = normalizeVirtualDirectoryPath(directoryPath);
      } catch (error) {
        logger?.warn(
          `Invalid storage directory in config.json: ${directoryPath}`
        );
        continue;
      }

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        logger?.warn(
          `Invalid storage entry in config.json: ${normalizedDirectoryPath}`
        );
        continue;
      }

      const rawEntry = value as Record<string, unknown>;
      const validatedEntry: NonNullable<ConfigFile['storage']>[string] = {};

      const rawExpireSeconds =
        rawEntry['expire_seconds'] ?? rawEntry['expireSeconds'];
      if (rawExpireSeconds !== undefined) {
        if (
          typeof rawExpireSeconds === 'number' &&
          Number.isInteger(rawExpireSeconds) &&
          rawExpireSeconds >= 0
        ) {
          validatedEntry.expireSeconds = rawExpireSeconds;
        } else {
          logger?.warn(
            `Invalid expire_seconds in config.json for ${normalizedDirectoryPath}: ${String(rawExpireSeconds)}`
          );
        }
      }

      if (rawEntry['readonly'] !== undefined) {
        if (typeof rawEntry['readonly'] === 'boolean') {
          validatedEntry.readonly = rawEntry['readonly'];
        } else {
          logger?.warn(
            `Invalid readonly in config.json for ${normalizedDirectoryPath}: ${String(rawEntry['readonly'])}`
          );
        }
      }

      validatedStorage[normalizedDirectoryPath] = validatedEntry;
    }

    validated.storage = validatedStorage;
  } else if (rawConfig['storage'] !== undefined) {
    logger?.warn('storage in config.json must be an object');
  }

  return validated;
};

/**
 * Loads server configuration from a JSON5 file.
 * @param configPath Path to the config file.
 * @param logger Logger used for diagnostic output.
 * @returns Parsed, validated, and normalized configuration.
 */
export const loadConfigFromPath = async (
  configPath: string,
  logger: Logger | undefined
): Promise<ConfigFile> => {
  try {
    const content = await readFile(configPath, 'utf8');
    const parsed = JSON5.parse(content) as unknown;
    logger?.debug(`Loaded config file: ${configPath}`);
    return validateConfig(parsed, dirname(resolve(configPath)), logger);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      logger?.debug(`Config file not found: ${configPath}`);
      return {};
    }

    if (error instanceof SyntaxError) {
      logger?.warn(`Failed to parse config file: ${error.message}`);
      return {};
    }

    logger?.warn(
      `Failed to load config file: ${error instanceof Error ? error.message : String(error)}`
    );
    return {};
  }
};
