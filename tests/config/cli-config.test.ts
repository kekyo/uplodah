// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import { resolveCliServerConfig } from '../../src/utils/cliConfig';

describe('cli config resolution', () => {
  test('applies CLI, environment, config, and defaults in priority order', () => {
    const resolved = resolveCliServerConfig({
      options: {
        port: '7001',
        storageDir: './cli-storage',
        trustedProxies: '127.0.0.1, 10.0.0.1',
      },
      env: {
        UPLODAH_PORT: '7002',
        UPLODAH_BASE_URL: 'https://env.example.com/uplodah',
        UPLODAH_STORAGE_DIR: './env-storage',
        UPLODAH_REALM: 'Env realm',
        UPLODAH_LOG_LEVEL: 'warn',
        UPLODAH_MAX_UPLOAD_SIZE_MB: '128',
        UPLODAH_TRUSTED_PROXIES: '192.168.0.1',
      },
      fileConfig: {
        port: 7003,
        baseUrl: 'https://config.example.com/uplodah',
        storageDir: './config-storage',
        realm: 'Config realm',
        logLevel: 'error',
        maxUploadSizeMb: 64,
        trustedProxies: ['172.16.0.1'],
        storage: {
          '/tmp': {
            expireSeconds: 60,
          },
        },
      },
      defaultRealm: 'uplodah test',
    });

    expect(resolved.configFilePath).toBe('./config.json');
    expect(resolved.config).toEqual({
      port: 7001,
      baseUrl: 'https://env.example.com/uplodah',
      trustedProxies: ['127.0.0.1', '10.0.0.1'],
      storageDir: './cli-storage',
      configDir: '.',
      realm: 'Env realm',
      logLevel: 'warn',
      maxUploadSizeMb: 128,
      storage: {
        '/tmp': {
          expireSeconds: 60,
        },
      },
    });
  });

  test('throws for invalid resolved values', () => {
    expect(() =>
      resolveCliServerConfig({
        options: {
          maxUploadSizeMb: '0',
        },
        env: {},
        fileConfig: {},
        defaultRealm: 'uplodah test',
      })
    ).toThrow('Invalid max upload size');
  });
});
