// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { writeFile } from 'fs/promises';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { Logger } from '../../src/types';
import { loadConfigFromPath } from '../../src/utils/configLoader';
import { createTestDirectory } from '../helpers/test-helper';

const createSilentLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

describe('config loader', () => {
  test('validates JSON5 config values and resolves storageDir relative to config file', async () => {
    const configDir = await createTestDirectory('config-loader');
    const configPath = path.join(configDir, 'config.json');
    await writeFile(
      configPath,
      `{
        port: 6123,
        baseUrl: 'https://files.example.com/uplodah/',
        storageDir: './storage',
        realm: 'Configured realm',
        logLevel: 'debug',
        maxUploadSizeMb: 256,
        trustedProxies: ['127.0.0.1', 1234],
        storage: {
          '/tmp/': {
            expire_seconds: 86400,
          },
          '/artifacts': {
            readonly: true,
          },
        },
      }`,
      'utf8'
    );

    const config = await loadConfigFromPath(configPath, createSilentLogger());
    expect(config).toEqual({
      port: 6123,
      baseUrl: 'https://files.example.com/uplodah',
      storageDir: path.join(configDir, 'storage'),
      realm: 'Configured realm',
      logLevel: 'debug',
      maxUploadSizeMb: 256,
      trustedProxies: ['127.0.0.1'],
      storage: {
        '/tmp': {
          expireSeconds: 86400,
        },
        '/artifacts': {
          readonly: true,
        },
      },
    });
  });

  test('returns an empty config for invalid JSON', async () => {
    const configDir = await createTestDirectory('config-loader-invalid');
    const configPath = path.join(configDir, 'config.json');
    await writeFile(configPath, '{invalid json}', 'utf8');

    await expect(
      loadConfigFromPath(configPath, createSilentLogger())
    ).resolves.toEqual({});
  });
});
