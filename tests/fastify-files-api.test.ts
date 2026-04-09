// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { beforeEach, describe, expect, test } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { startFastifyServer } from '../src/server';
import { createConsoleLogger } from '../src/logger';
import { ServerConfig } from '../src/types';
import {
  createTestDirectory,
  getTestPort,
  testGlobalLogLevel,
} from './helpers/test-helper.js';
import { createUsersJsonFile } from './helpers/jsonAuth';

describe('Fastify files and upload API', () => {
  let testBaseDir: string;
  let testConfigDir: string;
  let testStorageDir: string;
  let serverPort: number;
  const logger = createConsoleLogger('fastify-files-api', testGlobalLogLevel);

  beforeEach(async (fn) => {
    testBaseDir = await createTestDirectory('fastify-files-api', fn.task.name);
    testConfigDir = testBaseDir;
    testStorageDir = path.join(testBaseDir, 'storage');
    await fs.mkdir(testStorageDir, { recursive: true });
    await createUsersJsonFile(testConfigDir, [
      { username: 'adminuser', password: 'adminpass', role: 'admin' },
      { username: 'publishuser', password: 'publishpass', role: 'publish' },
      { username: 'readuser', password: 'readpass', role: 'read' },
    ]);
    serverPort = await getTestPort(7200);
  });

  const startServer = async (
    authMode: 'none' | 'publish' | 'full',
    overrides: Partial<ServerConfig> = {}
  ) =>
    await startFastifyServer(
      {
        port: serverPort,
        storageDir: testStorageDir,
        configDir: testConfigDir,
        realm: `Test Files API - ${authMode}`,
        logLevel: testGlobalLogLevel,
        authMode,
        passwordStrengthCheck: false,
        ...overrides,
      },
      logger
    );

  const login = async (username: string, password: string): Promise<string> => {
    const response = await fetch(
      `http://localhost:${serverPort}/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      }
    );

    expect(response.status).toBe(200);
    const sessionCookie = response.headers.get('set-cookie')?.split(';')[0];
    expect(sessionCookie).toBeDefined();
    return sessionCookie!;
  };

  const uploadFile = async (
    publicPath: string,
    content: string,
    headers: Record<string, string> = {}
  ) =>
    await fetch(
      `http://localhost:${serverPort}/api/upload/${publicPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...headers,
        },
        body: Buffer.from(content),
      }
    );

  test('should upload, list, and download files without authentication', async () => {
    const server = await startServer('none');

    try {
      const uploadResponse = await uploadFile('report.txt', 'hello uplodah');
      expect(uploadResponse.status).toBe(201);
      const uploadData = await uploadResponse.json();
      expect(uploadData.path).toBe('report.txt');
      expect(uploadData.uploadId).toEqual(expect.any(String));
      expect(uploadData.uploadedAt).toMatch(/Z$/);
      expect(uploadData.downloadUrl).toContain(`/${uploadData.uploadId}`);

      const listResponse = await fetch(
        `http://localhost:${serverPort}/api/files?skip=0&take=20`
      );
      expect(listResponse.status).toBe(200);
      const listData = await listResponse.json();
      expect(listData.totalCount).toBe(1);
      expect(listData.items[0].publicPath).toBe('report.txt');
      expect(listData.items[0].versions[0].uploadId).toBe(uploadData.uploadId);

      const latestResponse = await fetch(
        `http://localhost:${serverPort}/api/files/report.txt`
      );
      expect(latestResponse.status).toBe(200);
      expect(await latestResponse.text()).toBe('hello uplodah');

      const specificResponse = await fetch(
        `http://localhost:${serverPort}/api/files/report.txt/${uploadData.uploadId}`
      );
      expect(specificResponse.status).toBe(200);
      expect(await specificResponse.text()).toBe('hello uplodah');
    } finally {
      await server.close();
    }
  }, 30000);

  test('should enforce upload authentication in publish mode', async () => {
    const server = await startServer('publish');

    try {
      const anonymousList = await fetch(
        `http://localhost:${serverPort}/api/files?skip=0&take=20`
      );
      expect(anonymousList.status).toBe(200);

      const anonymousUpload = await uploadFile('restricted.txt', 'blocked');
      expect(anonymousUpload.status).toBe(401);

      const readCookie = await login('readuser', 'readpass');
      const readUpload = await uploadFile('restricted.txt', 'blocked', {
        Cookie: readCookie,
      });
      expect(readUpload.status).toBe(403);

      const publishCookie = await login('publishuser', 'publishpass');
      const publishUpload = await uploadFile('restricted.txt', 'allowed', {
        Cookie: publishCookie,
      });
      expect(publishUpload.status).toBe(201);
    } finally {
      await server.close();
    }
  }, 30000);

  test('should require authentication for listing and upload in full mode', async () => {
    const server = await startServer('full');

    try {
      const anonymousList = await fetch(
        `http://localhost:${serverPort}/api/files?skip=0&take=20`
      );
      expect(anonymousList.status).toBe(401);

      const readCookie = await login('readuser', 'readpass');
      const readList = await fetch(
        `http://localhost:${serverPort}/api/files?skip=0&take=20`,
        {
          headers: {
            Cookie: readCookie,
          },
        }
      );
      expect(readList.status).toBe(200);

      const readUpload = await uploadFile('full-mode.txt', 'blocked', {
        Cookie: readCookie,
      });
      expect(readUpload.status).toBe(403);

      const publishCookie = await login('publishuser', 'publishpass');
      const publishUpload = await uploadFile('full-mode.txt', 'allowed', {
        Cookie: publishCookie,
      });
      expect(publishUpload.status).toBe(201);

      const readDownload = await fetch(
        `http://localhost:${serverPort}/api/files/full-mode.txt`,
        {
          headers: {
            Cookie: readCookie,
          },
        }
      );
      expect(readDownload.status).toBe(200);
      expect(await readDownload.text()).toBe('allowed');
    } finally {
      await server.close();
    }
  }, 30000);

  test('should enforce storage rules and expose writable directories', async () => {
    const server = await startServer('none', {
      storage: {
        '/incoming': {},
        '/readonly': {
          readonly: true,
        },
      },
    });

    try {
      const configResponse = await fetch(
        `http://localhost:${serverPort}/api/config`
      );
      expect(configResponse.status).toBe(200);
      const configData = await configResponse.json();
      expect(configData.storageDirectories).toEqual(['/incoming']);

      const rootUpload = await uploadFile('root.txt', 'blocked');
      expect(rootUpload.status).toBe(400);

      const readonlyUpload = await uploadFile('readonly/file.txt', 'blocked');
      expect(readonlyUpload.status).toBe(403);

      const allowedUpload = await uploadFile('incoming/file.txt', 'allowed');
      expect(allowedUpload.status).toBe(201);

      const listResponse = await fetch(
        `http://localhost:${serverPort}/api/files?skip=0&take=20`
      );
      expect(listResponse.status).toBe(200);
      const listData = await listResponse.json();
      expect(listData.items[0].publicPath).toBe('incoming/file.txt');
      expect(listData.items[0].directoryPath).toBe('/incoming');
    } finally {
      await server.close();
    }
  }, 30000);
});
