// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { beforeEach, describe, expect, test } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { startFastifyServer } from '../src/server';
import { createConsoleLogger } from '../src/logger';
import { ServerConfig } from '../src/types';
import {
  createTestDirectory,
  getTestPort,
  testGlobalLogLevel,
} from './helpers/test-helper.js';

describe('Fastify server basics', () => {
  let testBaseDir: string;
  let testStorageDir: string;
  let testConfigDir: string;
  let serverPort: number;

  beforeEach(async (fn) => {
    testBaseDir = await createTestDirectory('fastify-server', fn.task.name);
    testStorageDir = path.join(testBaseDir, 'storage');
    testConfigDir = testBaseDir;
    await fs.mkdir(testStorageDir, { recursive: true });
    serverPort = await getTestPort(6000);
  });

  const createConfig = (): ServerConfig => ({
    port: serverPort,
    storageDir: testStorageDir,
    configDir: testConfigDir,
    realm: 'Test Fastify Server',
    logLevel: testGlobalLogLevel,
    authMode: 'none',
    passwordStrengthCheck: false,
  });

  test('should start Fastify server successfully', async () => {
    const logger = createConsoleLogger('fastify-server', testGlobalLogLevel);
    const server = await startFastifyServer(createConfig(), logger);

    try {
      expect(server).toBeDefined();
      expect(typeof server.close).toBe('function');
    } finally {
      await server.close();
    }
  }, 30000);

  test('should respond to health check endpoint', async () => {
    const logger = createConsoleLogger('fastify-server', testGlobalLogLevel);
    const server = await startFastifyServer(createConfig(), logger);

    try {
      const response = await fetch(`http://localhost:${serverPort}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: 'ok',
        version: expect.any(String),
      });
    } finally {
      await server.close();
    }
  }, 30000);

  test('should serve HTML UI from the root endpoint', async () => {
    const logger = createConsoleLogger('fastify-server', testGlobalLogLevel);
    const server = await startFastifyServer(createConfig(), logger);

    try {
      const response = await fetch(`http://localhost:${serverPort}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');

      const html = await response.text();
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<title>uplodah</title>');
    } finally {
      await server.close();
    }
  }, 30000);

  test('should expose application config for the UI', async () => {
    const logger = createConsoleLogger('fastify-server', testGlobalLogLevel);
    const server = await startFastifyServer(createConfig(), logger);

    try {
      const response = await fetch(`http://localhost:${serverPort}/api/config`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('name', 'uplodah');
      expect(data).toHaveProperty('authMode', 'none');
      expect(data).toHaveProperty('maxDownloadSizeMb', 100);
      expect(data).toHaveProperty('storageDirectories', ['/']);
      expect(data).toHaveProperty('storageDirectoryDetails', [
        {
          directoryPath: '/',
        },
      ]);
    } finally {
      await server.close();
    }
  }, 30000);

  test('should shut down gracefully', async () => {
    const logger = createConsoleLogger('fastify-server', testGlobalLogLevel);
    const server = await startFastifyServer(createConfig(), logger);

    const response = await fetch(`http://localhost:${serverPort}/health`);
    expect(response.status).toBe(200);

    await server.close();

    await expect(
      fetch(`http://localhost:${serverPort}/health`)
    ).rejects.toBeDefined();
  }, 30000);
});
