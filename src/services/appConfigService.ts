// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import * as packageMetadata from '../generated/packageMetadata';
import {
  AppConfigResponse,
  ResolvedServerConfig,
  StorageSection,
  UploadDirectoriesResponse,
} from '../types';

/**
 * Service that builds the public application configuration payload.
 */
export interface AppConfigService {
  /**
   * Gets the current public application configuration.
   * @returns Public config response.
   */
  getConfig: () => Promise<AppConfigResponse>;
  /**
   * Gets the current writable upload directories.
   * @returns Upload directory response.
   */
  getUploadDirectories: () => Promise<UploadDirectoriesResponse>;
}

interface CreateAppConfigServiceInput {
  resolvedConfig: ResolvedServerConfig;
}

/**
 * Creates the public app config service.
 * @param input Service input.
 * @returns App config service.
 */
export const createAppConfigService = (
  input: CreateAppConfigServiceInput
): AppConfigService => {
  const storageSections: StorageSection[] = (() => {
    if (!input.resolvedConfig.storage) {
      return [
        {
          path: '/',
        },
      ];
    }

    return Object.keys(input.resolvedConfig.storage)
      .map((directoryPath) => ({
        path: directoryPath,
      }))
      .sort((left, right) => {
        if (left.path === '/') {
          return -1;
        }
        if (right.path === '/') {
          return 1;
        }
        return left.path.localeCompare(right.path);
      });
  })();

  const uploadDirectories = (() => {
    if (!input.resolvedConfig.storage) {
      return [
        {
          path: '/',
        },
      ];
    }

    return Object.entries(input.resolvedConfig.storage)
      .filter(([, entry]) => !entry.readonly)
      .map(([directoryPath, entry]) => ({
        path: directoryPath,
        ...(entry.expireSeconds !== undefined
          ? {
              expireSeconds: entry.expireSeconds,
            }
          : {}),
      }))
      .sort((left, right) => {
        if (left.path === '/') {
          return -1;
        }
        if (right.path === '/') {
          return 1;
        }
        return left.path.localeCompare(right.path);
      });
  })();

  const serverUrl = {
    ...(input.resolvedConfig.baseUrl
      ? {
          baseUrl: input.resolvedConfig.baseUrl,
        }
      : {}),
    port: input.resolvedConfig.port,
    isHttps: input.resolvedConfig.baseUrl?.startsWith('https://') ?? false,
  };

  return {
    getConfig: async (): Promise<AppConfigResponse> => ({
      realm: input.resolvedConfig.realm,
      serverUrl,
      name: packageMetadata.name || 'uplodah',
      version: packageMetadata.version || '0.0.0',
      authMode: 'none',
      authEnabled: {
        general: false,
        publish: false,
        admin: false,
      },
      currentUser: null,
      maxUploadSizeMb: input.resolvedConfig.maxUploadSizeMb,
      storageConfigured: input.resolvedConfig.storage !== undefined,
      storageSections,
    }),
    getUploadDirectories: async (): Promise<UploadDirectoriesResponse> => ({
      directories: uploadDirectories,
    }),
  };
};
