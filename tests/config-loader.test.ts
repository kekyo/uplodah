// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { beforeEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import {
  loadConfigFromFile,
  loadConfigFromPath,
} from '../src/utils/configLoader';
import { createTestDirectory } from './helpers/test-helper';

describe('config-loader', () => {
  let testDir: string;

  beforeEach(async (fn) => {
    testDir = await createTestDirectory('config-loader', fn.task.name);
  });

  it('should return empty object when config.json does not exist', async () => {
    const config = await loadConfigFromFile(testDir);
    expect(config).toEqual({});
  });

  it('should parse JSON5 and resolve storage-related paths', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      `{
        // JSON5 comment support
        port: 8080,
        storageDir: './storage',
        usersFile: './auth/users.json',
        authMode: 'publish',
        maxUploadSizeMb: 250,
        storage: {
          '/incoming': {
            description: 'Incoming artifacts',
            accept: ['store'],
            expireSeconds: 60,
          },
          '/archive': {
            description: 'Delete-only archive',
            accept: ['delete'],
          },
        },
      }`
    );

    const config = await loadConfigFromPath(configPath);

    expect(config).toEqual({
      port: 8080,
      storageDir: resolve(testDir, 'storage'),
      usersFile: resolve(testDir, 'auth/users.json'),
      authMode: 'publish',
      maxUploadSizeMb: 250,
      storage: {
        '/incoming': {
          description: 'Incoming artifacts',
          accept: ['store'],
          expireSeconds: 60,
        },
        '/archive': {
          description: 'Delete-only archive',
          accept: ['delete'],
        },
      },
    });
  });

  it('should filter invalid primitive values', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        port: 'invalid-port',
        baseUrl: 'http://example.com',
        logLevel: 'verbose',
        authMode: 'custom',
        trustedProxies: ['192.168.1.1', 123, '10.0.0.1'],
        maxUploadSizeMb: 0,
      })
    );

    const config = await loadConfigFromPath(configPath);

    expect(config).toEqual({
      baseUrl: 'http://example.com',
      trustedProxies: ['192.168.1.1', '10.0.0.1'],
    });
  });

  it('should keep valid storage rules and drop invalid ones', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        storage: {
          '/incoming': {
            description: 'Incoming artifacts',
            accept: ['store'],
            expireSeconds: 30,
          },
          '/archive': {
            accept: ['delete'],
          },
          incoming: {},
          '/bad/../path': {},
          '/invalid-fields': {
            description: 123,
            accept: ['store', 'broken', 1],
            expireSeconds: 0,
          },
        },
      })
    );

    const config = await loadConfigFromPath(configPath);

    expect(config.storage).toEqual({
      '/incoming': {
        description: 'Incoming artifacts',
        accept: ['store'],
        expireSeconds: 30,
      },
      '/archive': {
        accept: ['delete'],
      },
      '/invalid-fields': {
        accept: ['store'],
      },
    });
  });

  it('should resolve usersFile relative to config directory', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        usersFile: '../data/users.json',
      })
    );

    const config = await loadConfigFromPath(configPath);
    expect(config.usersFile).toBe(resolve(testDir, '../data/users.json'));
  });

  it('should validate maxUploadSizeMb bounds', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        maxUploadSizeMb: 10000,
      })
    );
    expect((await loadConfigFromPath(configPath)).maxUploadSizeMb).toBe(10000);

    await writeFile(
      configPath,
      JSON.stringify({
        maxUploadSizeMb: 10001,
      })
    );
    expect(
      (await loadConfigFromPath(configPath)).maxUploadSizeMb
    ).toBeUndefined();
  });

  it('should handle invalid JSON5 gracefully', async () => {
    await writeFile(join(testDir, 'config.json'), '{ invalid json');

    const config = await loadConfigFromFile(testDir);
    expect(config).toEqual({});
  });

  it('should handle config.json path collisions gracefully', async () => {
    const subDir = join(testDir, 'subdir');
    await mkdir(subDir, { recursive: true });
    await mkdir(join(subDir, 'config.json'), { recursive: true });

    const config = await loadConfigFromFile(subDir);
    expect(config).toEqual({});
  });
});
