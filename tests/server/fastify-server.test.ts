// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createConsoleLogger } from '../../src/logger';
import { FastifyServerInstance, startFastifyServer } from '../../src/server';
import { ServerConfig } from '../../src/types';
import {
  createTestDirectory,
  getTestPort,
  testGlobalLogLevel,
} from '../helpers/test-helper';

describe('Fastify server', () => {
  let storageDir: string;
  let serverPort: number;
  let server: FastifyServerInstance | undefined = undefined;

  beforeEach(async () => {
    storageDir = await createTestDirectory('storage');
    serverPort = await getTestPort(7000);
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  test('starts successfully and serves health/config/root endpoints', async () => {
    const logger = createConsoleLogger(
      'fastify-server-test',
      testGlobalLogLevel
    );
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Test uplodah',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    const healthResponse = await fetch(`http://localhost:${serverPort}/health`);
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({
      status: 'ok',
      version: expect.any(String),
    });

    const configResponse = await fetch(
      `http://localhost:${serverPort}/api/config`
    );
    expect(configResponse.status).toBe(200);
    expect(await configResponse.json()).toEqual({
      realm: 'Test uplodah',
      name: expect.any(String),
      version: expect.any(String),
      serverUrl: {
        port: serverPort,
        isHttps: false,
      },
      authMode: 'none',
      authEnabled: {
        general: false,
        publish: false,
        admin: false,
      },
      currentUser: null,
      maxUploadSizeMb: 100,
      storageConfigured: false,
      storageSections: [
        {
          path: '/',
        },
      ],
    });

    const rootResponse = await fetch(`http://localhost:${serverPort}/`);
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.headers.get('content-type')).toContain('text/html');
    const rootHtml = await rootResponse.text();
    expect(rootHtml).toContain('<!doctype html>');
    expect(rootHtml).toContain('<div id="root"></div>');
    expect(rootHtml).toContain('family=Roboto');
  }, 30000);

  test('returns configured baseUrl from config endpoint', async () => {
    const logger = createConsoleLogger(
      'fastify-server-test',
      testGlobalLogLevel
    );
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Test uplodah',
      baseUrl: 'https://files.example.com/uplodah',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    const configResponse = await fetch(
      `http://localhost:${serverPort}/api/config`
    );
    expect(configResponse.status).toBe(200);
    expect(await configResponse.json()).toEqual({
      realm: 'Test uplodah',
      name: expect.any(String),
      version: expect.any(String),
      serverUrl: {
        baseUrl: 'https://files.example.com/uplodah',
        port: serverPort,
        isHttps: true,
      },
      authMode: 'none',
      authEnabled: {
        general: false,
        publish: false,
        admin: false,
      },
      currentUser: null,
      maxUploadSizeMb: 100,
      storageConfigured: false,
      storageSections: [
        {
          path: '/',
        },
      ],
    });
  }, 30000);

  test('serves writable upload directories when storage rules are not configured', async () => {
    const logger = createConsoleLogger(
      'fastify-server-test',
      testGlobalLogLevel
    );
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Test uplodah',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    const response = await fetch(
      `http://localhost:${serverPort}/api/upload/directories`
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      directories: [
        {
          path: '/',
        },
      ],
    });
  }, 30000);

  test('serves writable configured upload directories from both public and ui compatibility endpoints', async () => {
    const logger = createConsoleLogger(
      'fastify-server-test',
      testGlobalLogLevel
    );
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Test uplodah',
      logLevel: testGlobalLogLevel,
      storage: {
        '/': {},
        '/artifacts': {
          readonly: true,
        },
        '/tmp': {
          expireSeconds: 86400,
        },
        '/tmp/foobar': {
          expireSeconds: 60,
        },
      },
    };

    server = await startFastifyServer(config, logger);

    const publicResponse = await fetch(
      `http://localhost:${serverPort}/api/upload/directories`
    );
    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.json()).toEqual({
      directories: [
        {
          path: '/',
        },
        {
          path: '/tmp',
          expireSeconds: 86400,
        },
        {
          path: '/tmp/foobar',
          expireSeconds: 60,
        },
      ],
    });

    const configResponse = await fetch(
      `http://localhost:${serverPort}/api/config`
    );
    expect(configResponse.status).toBe(200);
    expect(await configResponse.json()).toEqual({
      realm: 'Test uplodah',
      name: expect.any(String),
      version: expect.any(String),
      serverUrl: {
        port: serverPort,
        isHttps: false,
      },
      authMode: 'none',
      authEnabled: {
        general: false,
        publish: false,
        admin: false,
      },
      currentUser: null,
      maxUploadSizeMb: 100,
      storageConfigured: true,
      storageSections: [
        {
          path: '/',
        },
        {
          path: '/artifacts',
        },
        {
          path: '/tmp',
        },
        {
          path: '/tmp/foobar',
        },
      ],
    });

    const uiResponse = await fetch(
      `http://localhost:${serverPort}/api/ui/upload/directories`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );
    expect(uiResponse.status).toBe(200);
    expect(await uiResponse.json()).toEqual({
      directories: [
        {
          path: '/',
        },
        {
          path: '/tmp',
          expireSeconds: 86400,
        },
        {
          path: '/tmp/foobar',
          expireSeconds: 60,
        },
      ],
    });
  }, 30000);

  test('accepts prefixed requests and emits prefixed download paths for fixed baseUrl', async () => {
    const logger = createConsoleLogger(
      'fastify-server-test',
      testGlobalLogLevel
    );
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Test uplodah',
      baseUrl: 'https://files.example.com/uplodah',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    const rootResponse = await fetch(`http://localhost:${serverPort}/uplodah/`);
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.headers.get('content-type')).toContain('text/html');

    const uploadResponse = await fetch(
      `http://localhost:${serverPort}/uplodah/api/upload/report.txt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from('prefixed upload', 'utf8'),
      }
    );
    expect(uploadResponse.status).toBe(201);

    const listResponse = await fetch(
      `http://localhost:${serverPort}/uplodah/api/files`
    );
    expect(listResponse.status).toBe(200);

    const listBody = await listResponse.json();
    expect(listBody.groups[0]?.versions[0]?.downloadPath).toContain(
      '/uplodah/api/files/'
    );

    const downloadResponse = await fetch(
      `http://localhost:${serverPort}${listBody.groups[0]?.versions[0]?.downloadPath as string}`
    );
    expect(downloadResponse.status).toBe(200);
    expect(
      Buffer.from(await downloadResponse.arrayBuffer()).toString('utf8')
    ).toBe('prefixed upload');
  }, 30000);

  test('serves the Fastify-compatible ui config endpoint', async () => {
    const logger = createConsoleLogger(
      'fastify-server-test',
      testGlobalLogLevel
    );
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Test uplodah',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    const response = await fetch(
      `http://localhost:${serverPort}/api/ui/config`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      realm: 'Test uplodah',
      name: expect.any(String),
      version: expect.any(String),
      serverUrl: {
        port: serverPort,
        isHttps: false,
      },
      authMode: 'none',
      authEnabled: {
        general: false,
        publish: false,
        admin: false,
      },
      currentUser: null,
      maxUploadSizeMb: 100,
      storageConfigured: false,
      storageSections: [
        {
          path: '/',
        },
      ],
    });
  }, 30000);
});
