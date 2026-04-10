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

describe('Fastify UI backend API', () => {
  let testBaseDir: string;
  let testConfigDir: string;
  let testStorageDir: string;
  let serverPort: number;
  const logger = createConsoleLogger('fastify-ui-api', testGlobalLogLevel);

  beforeEach(async (fn) => {
    testBaseDir = await createTestDirectory('fastify-ui-api', fn.task.name);
    testConfigDir = testBaseDir;
    testStorageDir = path.join(testBaseDir, 'storage');
    await fs.mkdir(testStorageDir, { recursive: true });
    await createUsersJsonFile(testConfigDir, [
      { username: 'adminuser', password: 'adminpass', role: 'admin' },
      { username: 'publishuser', password: 'publishpass', role: 'publish' },
      { username: 'readuser', password: 'readpass', role: 'read' },
    ]);
    serverPort = await getTestPort(7000);
  });

  const startServer = async (authMode: 'none' | 'publish' | 'full') =>
    await startFastifyServer(
      {
        port: serverPort,
        storageDir: testStorageDir,
        configDir: testConfigDir,
        realm: `Test UI API - ${authMode}`,
        logLevel: testGlobalLogLevel,
        authMode,
        passwordStrengthCheck: false,
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

  const postJson = async (
    pathName: string,
    body: unknown,
    headers: Record<string, string> = {}
  ) =>
    await fetch(`http://localhost:${serverPort}${pathName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });

  test('should return UI config without authentication in authMode none', async () => {
    const server = await startServer('none');

    try {
      const response = await postJson('/api/ui/config', {});
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('name', 'uplodah');
      expect(data).toHaveProperty('authMode', 'none');
      expect(data).toHaveProperty('currentUser', null);
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

  test('should reflect session authentication in UI config', async () => {
    const server = await startServer('full');

    try {
      const sessionCookie = await login('adminuser', 'adminpass');
      const response = await postJson(
        '/api/ui/config',
        {},
        {
          Cookie: sessionCookie,
        }
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.currentUser).toEqual({
        username: 'adminuser',
        role: 'admin',
        authenticated: true,
      });
      expect(data.authEnabled).toEqual({
        general: true,
        publish: true,
        admin: true,
      });
    } finally {
      await server.close();
    }
  }, 30000);

  test('should expose browse directory, file-group, version, and search APIs', async () => {
    const server = await startFastifyServer(
      {
        port: serverPort,
        storageDir: testStorageDir,
        configDir: testConfigDir,
        realm: 'Test UI API - storage browse',
        logLevel: testGlobalLogLevel,
        authMode: 'none',
        passwordStrengthCheck: false,
        storage: {
          '/': {},
          '/tmp': {
            description: 'Temporary artifacts',
          },
        },
      },
      logger
    );

    try {
      const uploadResponse = await fetch(
        `http://localhost:${serverPort}/api/upload/tmp/flashcap.nupkg`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: Buffer.from('flashcap'),
        }
      );
      expect(uploadResponse.status).toBe(201);
      const uploadData = await uploadResponse.json();

      const directoriesResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/directories`
      );
      expect(directoriesResponse.status).toBe(200);
      expect(await directoriesResponse.json()).toEqual({
        items: [
          {
            directoryPath: '/',
            readonly: false,
            fileGroupCount: 0,
          },
          {
            directoryPath: '/tmp',
            description: 'Temporary artifacts',
            readonly: false,
            fileGroupCount: 1,
          },
        ],
      });

      const fileGroupsResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/file-groups?directory=${encodeURIComponent('/tmp')}`
      );
      expect(fileGroupsResponse.status).toBe(200);
      expect(await fileGroupsResponse.json()).toEqual({
        directoryPath: '/tmp',
        items: [
          {
            publicPath: 'tmp/flashcap.nupkg',
            displayPath: '/tmp/flashcap.nupkg',
            directoryPath: '/tmp',
            browseDirectoryPath: '/tmp',
            browseRelativePath: 'flashcap.nupkg',
            fileName: 'flashcap.nupkg',
            latestUploadId: uploadData.uploadId,
            latestUploadedAt: uploadData.uploadedAt,
            latestDownloadPath: '/api/files/tmp/flashcap.nupkg',
          },
        ],
      });

      const versionsResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/versions?publicPath=${encodeURIComponent('tmp/flashcap.nupkg')}`
      );
      expect(versionsResponse.status).toBe(200);
      const versionsData = await versionsResponse.json();
      expect(versionsData.publicPath).toBe('tmp/flashcap.nupkg');
      expect(versionsData.items[0].uploadId).toBe(uploadData.uploadId);

      const searchResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/search?q=flashcap`
      );
      expect(searchResponse.status).toBe(200);
      expect(await searchResponse.json()).toEqual({
        query: 'flashcap',
        items: [
          {
            publicPath: 'tmp/flashcap.nupkg',
            displayPath: '/tmp/flashcap.nupkg',
            directoryPath: '/tmp',
            browseDirectoryPath: '/tmp',
            browseRelativePath: 'flashcap.nupkg',
            fileName: 'flashcap.nupkg',
            latestUploadId: uploadData.uploadId,
            latestUploadedAt: uploadData.uploadedAt,
            latestDownloadPath: '/api/files/tmp/flashcap.nupkg',
          },
        ],
      });
    } finally {
      await server.close();
    }
  }, 30000);

  test('should aggregate nested file groups under the matching virtual directory in browse APIs', async () => {
    const server = await startFastifyServer(
      {
        port: serverPort,
        storageDir: testStorageDir,
        configDir: testConfigDir,
        realm: 'Test UI API - nested storage browse',
        logLevel: testGlobalLogLevel,
        authMode: 'none',
        passwordStrengthCheck: false,
        storage: {
          '/runs': {
            description: 'Workflow artifacts',
          },
        },
      },
      logger
    );

    try {
      const nestedPath =
        'runs/24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip';
      const uploadResponse = await fetch(
        `http://localhost:${serverPort}/api/upload/${nestedPath
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/')}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: Buffer.from('manual bundle'),
        }
      );
      expect(uploadResponse.status).toBe(201);
      const uploadData = await uploadResponse.json();

      const directoriesResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/directories`
      );
      expect(directoriesResponse.status).toBe(200);
      expect(await directoriesResponse.json()).toEqual({
        items: [
          {
            directoryPath: '/runs',
            description: 'Workflow artifacts',
            readonly: false,
            fileGroupCount: 1,
          },
        ],
      });

      const fileGroupsResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/file-groups?directory=${encodeURIComponent('/runs')}`
      );
      expect(fileGroupsResponse.status).toBe(200);
      expect(await fileGroupsResponse.json()).toEqual({
        directoryPath: '/runs',
        items: [
          {
            publicPath: nestedPath,
            displayPath:
              '/runs/24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
            directoryPath: '/runs/24224477918/attempt-2/polyfit-manuals',
            browseDirectoryPath: '/runs',
            browseRelativePath:
              '24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
            fileName: 'RJK.PolyFit.Manuals.zip',
            latestUploadId: uploadData.uploadId,
            latestUploadedAt: uploadData.uploadedAt,
            latestDownloadPath:
              '/api/files/runs/24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
          },
        ],
      });

      const versionsResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/versions?publicPath=${encodeURIComponent(nestedPath)}`
      );
      expect(versionsResponse.status).toBe(200);
      const versionsData = await versionsResponse.json();
      expect(versionsData.publicPath).toBe(nestedPath);
      expect(versionsData.items[0].uploadId).toBe(uploadData.uploadId);

      const searchResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/search?q=manuals`
      );
      expect(searchResponse.status).toBe(200);
      expect(await searchResponse.json()).toEqual({
        query: 'manuals',
        items: [
          {
            publicPath: nestedPath,
            displayPath:
              '/runs/24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
            directoryPath: '/runs/24224477918/attempt-2/polyfit-manuals',
            browseDirectoryPath: '/runs',
            browseRelativePath:
              '24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
            fileName: 'RJK.PolyFit.Manuals.zip',
            latestUploadId: uploadData.uploadId,
            latestUploadedAt: uploadData.uploadedAt,
            latestDownloadPath:
              '/api/files/runs/24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
          },
        ],
      });
    } finally {
      await server.close();
    }
  }, 30000);

  test('should protect browse APIs in full auth mode', async () => {
    const server = await startServer('full');

    try {
      const anonymousResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/directories`
      );
      expect(anonymousResponse.status).toBe(401);

      const sessionCookie = await login('readuser', 'readpass');
      const authenticatedResponse = await fetch(
        `http://localhost:${serverPort}/api/ui/browse/directories`,
        {
          headers: {
            Cookie: sessionCookie,
          },
        }
      );
      expect(authenticatedResponse.status).toBe(200);
    } finally {
      await server.close();
    }
  }, 30000);

  test('should require admin session for user management', async () => {
    const server = await startServer('full');

    try {
      const publishCookie = await login('publishuser', 'publishpass');
      const forbidden = await postJson(
        '/api/ui/users',
        {
          action: 'list',
        },
        {
          Cookie: publishCookie,
        }
      );
      expect(forbidden.status).toBe(403);

      const adminCookie = await login('adminuser', 'adminpass');
      const created = await postJson(
        '/api/ui/users',
        {
          action: 'create',
          username: 'createduser',
          password: 'createdpass',
          role: 'read',
        },
        {
          Cookie: adminCookie,
        }
      );
      expect(created.status).toBe(201);

      const listed = await postJson(
        '/api/ui/users',
        {
          action: 'list',
        },
        {
          Cookie: adminCookie,
        }
      );
      expect(listed.status).toBe(200);
      const listData = await listed.json();
      expect(
        listData.users.some((user: { username: string }) => {
          return user.username === 'createduser';
        })
      ).toBe(true);

      const deleted = await postJson(
        '/api/ui/users',
        {
          action: 'delete',
          username: 'createduser',
        },
        {
          Cookie: adminCookie,
        }
      );
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({
        success: true,
        message: 'User deleted successfully',
      });
    } finally {
      await server.close();
    }
  }, 30000);

  test('should manage API passwords for the current user', async () => {
    const server = await startServer('full');

    try {
      const sessionCookie = await login('publishuser', 'publishpass');

      const added = await postJson(
        '/api/ui/apipasswords',
        {
          action: 'add',
          label: 'ci',
        },
        {
          Cookie: sessionCookie,
        }
      );
      expect(added.status).toBe(200);
      const addData = await added.json();
      expect(addData.label).toBe('ci');
      expect(addData.apiPassword).toEqual(expect.any(String));

      const listed = await postJson(
        '/api/ui/apipasswords',
        {
          action: 'list',
        },
        {
          Cookie: sessionCookie,
        }
      );
      expect(listed.status).toBe(200);
      const listData = await listed.json();
      expect(
        listData.apiPasswords.some((entry: { label: string }) => {
          return entry.label === 'ci';
        })
      ).toBe(true);

      const deleted = await postJson(
        '/api/ui/apipasswords',
        {
          action: 'delete',
          label: 'ci',
        },
        {
          Cookie: sessionCookie,
        }
      );
      expect(deleted.status).toBe(200);
      expect((await deleted.json()).success).toBe(true);
    } finally {
      await server.close();
    }
  }, 30000);

  test('should allow self password changes and admin password resets', async () => {
    const server = await startServer('full');

    try {
      const publishCookie = await login('publishuser', 'publishpass');
      const changed = await postJson(
        '/api/ui/password',
        {
          currentPassword: 'publishpass',
          newPassword: 'publishpass2',
        },
        {
          Cookie: publishCookie,
        }
      );
      expect(changed.status).toBe(200);
      expect(await changed.json()).toEqual({
        success: true,
        message: 'Password updated successfully',
      });

      const relogin = await fetch(
        `http://localhost:${serverPort}/api/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: 'publishuser',
            password: 'publishpass2',
          }),
        }
      );
      expect(relogin.status).toBe(200);

      const adminCookie = await login('adminuser', 'adminpass');
      const reset = await postJson(
        '/api/ui/password',
        {
          username: 'readuser',
          newPassword: 'readpass2',
        },
        {
          Cookie: adminCookie,
        }
      );
      expect(reset.status).toBe(200);

      const readLogin = await fetch(
        `http://localhost:${serverPort}/api/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: 'readuser',
            password: 'readpass2',
          }),
        }
      );
      expect(readLogin.status).toBe(200);
    } finally {
      await server.close();
    }
  }, 30000);
});
