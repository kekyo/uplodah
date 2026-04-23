// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { beforeEach, describe, expect, test } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { startFastifyServer } from '../src/server';
import {
  formatArchiveTimestamp,
  sanitizeArchiveRequestFileName,
  sanitizeArchiveRealmFileName,
} from '../src/routes/api/files/index';
import { createConsoleLogger } from '../src/logger';
import { ServerConfig } from '../src/types';
import {
  createTestDirectory,
  getTestPort,
  testGlobalLogLevel,
} from './helpers/test-helper.js';
import { createUsersJsonFile } from './helpers/jsonAuth';

dayjs.extend(utc);

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

  const deleteFileVersion = async (
    publicPath: string,
    headers: Record<string, string> = {}
  ) =>
    await fetch(
      `http://localhost:${serverPort}/api/files/${publicPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')}`,
      {
        method: 'DELETE',
        headers,
      }
    );

  test('should sanitize archive realm file names', () => {
    expect(sanitizeArchiveRealmFileName('Test Files API / full:*?"<>|')).toBe(
      'Test-Files-API-full'
    );
    expect(sanitizeArchiveRealmFileName('...')).toBe('uplodah');
    expect(sanitizeArchiveRealmFileName('CON')).toBe('_CON');
    expect(sanitizeArchiveRequestFileName('../2026/04/20 12:34:56')).toBe(
      '2026-04-20-12-34-56'
    );
  });

  test('should format archive timestamps', () => {
    expect(formatArchiveTimestamp(dayjs.utc('2026-04-23T01:02:03.000Z'))).toBe(
      '20260423_010203'
    );
  });

  test('should upload, list, and download files without authentication', async () => {
    const server = await startServer('none');

    try {
      const uploadResponse = await uploadFile('report.txt', 'hello uplodah', {
        'X-UPLODAH-TAGS': 'public, latest',
      });
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
      expect(listData.items[0].versions[0].uploadedBy).toBe('anonymous');
      expect(listData.items[0].versions[0].tags).toEqual(['public', 'latest']);

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

  test('should create ZIP archives for selected file versions', async () => {
    const server = await startServer('none', {
      storage: {
        '/incoming': {},
      },
    });

    try {
      const firstUpload = await uploadFile('incoming/report.txt', 'first');
      expect(firstUpload.status).toBe(201);
      const firstUploadData = await firstUpload.json();

      const secondUpload = await uploadFile('incoming/report.txt', 'second');
      expect(secondUpload.status).toBe(201);
      const secondUploadData = await secondUpload.json();

      const archiveRequestResponse = await fetch(
        `http://localhost:${serverPort}/api/files/archive-requests`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            archiveFileName: '20260420_123456',
            items: [
              {
                publicPath: 'incoming/report.txt',
                uploadId: firstUploadData.uploadId,
              },
              {
                publicPath: 'incoming/report.txt',
                uploadId: secondUploadData.uploadId,
              },
            ],
          }),
        }
      );
      expect(archiveRequestResponse.status).toBe(200);
      const archiveRequestData = await archiveRequestResponse.json();
      expect(archiveRequestData.downloadPath).toMatch(
        /^\/api\/files\/archive-requests\/.+/
      );
      expect(archiveRequestData.downloadPath).not.toContain('20260420_123456');

      const archiveResponse = await fetch(
        `http://localhost:${serverPort}${archiveRequestData.downloadPath}`
      );
      expect(archiveResponse.status).toBe(200);
      expect(archiveResponse.headers.get('content-type')).toContain(
        'application/zip'
      );
      expect(archiveResponse.headers.get('content-disposition')).toContain(
        'attachment;'
      );
      expect(archiveResponse.headers.get('content-disposition')).toMatch(
        /filename\*=UTF-8''Test-Files-API-none_20260420_123456\.zip/
      );

      const zip = new AdmZip(Buffer.from(await archiveResponse.arrayBuffer()));
      expect(
        zip
          .getEntry(
            `incoming/report.txt/${firstUploadData.uploadId}/report.txt`
          )
          ?.getData()
          .toString('utf-8')
      ).toBe('first');
      expect(
        zip
          .getEntry(
            `incoming/report.txt/${secondUploadData.uploadId}/report.txt`
          )
          ?.getData()
          .toString('utf-8')
      ).toBe('second');

      const repeatedArchiveResponse = await fetch(
        `http://localhost:${serverPort}${archiveRequestData.downloadPath}`
      );
      expect(repeatedArchiveResponse.status).toBe(404);
    } finally {
      await server.close();
    }
  }, 30000);

  test('should reject ZIP archive requests over the download size limit', async () => {
    const server = await startServer('none', {
      maxDownloadSizeMb: 0.000001,
    });

    try {
      const uploadResponse = await uploadFile('report.txt', 'too large');
      expect(uploadResponse.status).toBe(201);
      const uploadData = await uploadResponse.json();

      const archiveRequestResponse = await fetch(
        `http://localhost:${serverPort}/api/files/archive-requests`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [
              {
                publicPath: 'report.txt',
                uploadId: uploadData.uploadId,
              },
            ],
          }),
        }
      );

      expect(archiveRequestResponse.status).toBe(413);
      expect(await archiveRequestResponse.json()).toEqual({
        error: 'Selected files exceed maximum download size',
      });
    } finally {
      await server.close();
    }
  }, 30000);

  test('should delete only specific file versions and reject latest deletion', async () => {
    const server = await startServer('none', {
      storage: {
        '/incoming': {},
      },
    });

    try {
      const firstUpload = await uploadFile('incoming/report.txt', 'first');
      expect(firstUpload.status).toBe(201);
      const firstUploadData = await firstUpload.json();

      const secondUpload = await uploadFile('incoming/report.txt', 'second');
      expect(secondUpload.status).toBe(201);
      const secondUploadData = await secondUpload.json();

      const deleteLatestResponse = await deleteFileVersion(
        'incoming/report.txt'
      );
      expect(deleteLatestResponse.status).toBe(400);
      expect(await deleteLatestResponse.json()).toEqual({
        error: 'Deleting the latest file version requires an upload ID',
      });

      const deleteSpecificResponse = await deleteFileVersion(
        `incoming/report.txt/${secondUploadData.uploadId}`
      );
      expect(deleteSpecificResponse.status).toBe(200);
      expect(await deleteSpecificResponse.json()).toEqual({
        message: 'File deleted successfully',
      });

      const latestResponse = await fetch(
        `http://localhost:${serverPort}/api/files/incoming/report.txt`
      );
      expect(latestResponse.status).toBe(200);
      expect(await latestResponse.text()).toBe('first');

      const deletedResponse = await fetch(
        `http://localhost:${serverPort}/api/files/incoming/report.txt/${secondUploadData.uploadId}`
      );
      expect(deletedResponse.status).toBe(404);

      const deleteLastResponse = await deleteFileVersion(
        `incoming/report.txt/${firstUploadData.uploadId}`
      );
      expect(deleteLastResponse.status).toBe(200);

      const listResponse = await fetch(
        `http://localhost:${serverPort}/api/files?skip=0&take=20`
      );
      expect(listResponse.status).toBe(200);
      const listData = await listResponse.json();
      expect(listData.totalCount).toBe(0);
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
        'X-UPLODAH-TAGS': 'release, signed',
      });
      expect(publishUpload.status).toBe(201);

      const listResponse = await fetch(
        `http://localhost:${serverPort}/api/files?skip=0&take=20`
      );
      expect(listResponse.status).toBe(200);
      const listData = await listResponse.json();
      expect(listData.items[0].versions[0].uploadedBy).toBe('publishuser');
      expect(listData.items[0].versions[0].tags).toEqual(['release', 'signed']);
    } finally {
      await server.close();
    }
  }, 30000);

  test('should enforce delete authentication in publish mode', async () => {
    const server = await startServer('publish');

    try {
      const publishCookie = await login('publishuser', 'publishpass');
      const uploadResponse = await uploadFile('restricted.txt', 'allowed', {
        Cookie: publishCookie,
      });
      expect(uploadResponse.status).toBe(201);
      const uploadData = await uploadResponse.json();

      const anonymousDelete = await deleteFileVersion(
        `restricted.txt/${uploadData.uploadId}`
      );
      expect(anonymousDelete.status).toBe(401);

      const readCookie = await login('readuser', 'readpass');
      const readDelete = await deleteFileVersion(
        `restricted.txt/${uploadData.uploadId}`,
        {
          Cookie: readCookie,
        }
      );
      expect(readDelete.status).toBe(403);

      const publishDelete = await deleteFileVersion(
        `restricted.txt/${uploadData.uploadId}`,
        {
          Cookie: publishCookie,
        }
      );
      expect(publishDelete.status).toBe(200);
    } finally {
      await server.close();
    }
  }, 30000);

  test('should allow deletion only for the uploader or an admin in publish mode', async () => {
    const server = await startServer('publish');

    try {
      const publishCookie = await login('publishuser', 'publishpass');
      const uploadResponse = await uploadFile('owned-by-other.txt', 'payload', {
        Cookie: publishCookie,
      });
      expect(uploadResponse.status).toBe(201);
      const uploadData = await uploadResponse.json();

      const versionDirectoryPath = path.join(
        testStorageDir,
        'owned-by-other.txt',
        uploadData.uploadId
      );
      await fs.writeFile(
        path.join(versionDirectoryPath, 'metadata.json'),
        JSON.stringify({ uploadedBy: 'other-user' })
      );

      const uploaderMismatchDelete = await deleteFileVersion(
        `owned-by-other.txt/${uploadData.uploadId}`,
        {
          Cookie: publishCookie,
        }
      );
      expect(uploaderMismatchDelete.status).toBe(403);
      expect(await uploaderMismatchDelete.json()).toEqual({
        error: 'Delete permission required',
      });

      const adminCookie = await login('adminuser', 'adminpass');
      const adminDelete = await deleteFileVersion(
        `owned-by-other.txt/${uploadData.uploadId}`,
        {
          Cookie: adminCookie,
        }
      );
      expect(adminDelete.status).toBe(200);
    } finally {
      await server.close();
    }
  }, 30000);

  test('should allow a read-only user to delete their own uploaded version', async () => {
    const server = await startServer('publish');

    try {
      const uploadId = '20260408_101112_345';
      const versionDirectoryPath = path.join(
        testStorageDir,
        'owned-by-reader.txt',
        uploadId
      );
      await fs.mkdir(versionDirectoryPath, { recursive: true });
      await fs.writeFile(
        path.join(versionDirectoryPath, 'metadata.json'),
        JSON.stringify({ uploadedBy: 'readuser' })
      );
      await fs.writeFile(
        path.join(versionDirectoryPath, 'owned-by-reader.txt'),
        'reader-owned'
      );

      const readCookie = await login('readuser', 'readpass');
      const deleteResponse = await deleteFileVersion(
        `owned-by-reader.txt/${uploadId}`,
        {
          Cookie: readCookie,
        }
      );
      expect(deleteResponse.status).toBe(200);
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

  test('should reject delete requests for directories without delete accept', async () => {
    const server = await startServer('none', {
      storage: {
        '/store-only': {
          accept: ['store'],
        },
      },
    });

    try {
      const uploadResponse = await uploadFile(
        'store-only/report.txt',
        'locked'
      );
      expect(uploadResponse.status).toBe(201);
      const uploadData = await uploadResponse.json();

      const deleteResponse = await deleteFileVersion(
        `store-only/report.txt/${uploadData.uploadId}`
      );
      expect(deleteResponse.status).toBe(403);
      expect(await deleteResponse.json()).toEqual({
        error: 'Upload directory does not allow deletions',
      });
    } finally {
      await server.close();
    }
  }, 30000);

  test('should enforce storage rules and expose writable directories', async () => {
    const server = await startServer('none', {
      storage: {
        '/incoming': {
          description: 'Incoming artifacts',
          accept: ['store'],
        },
        '/delete-only': {
          accept: ['delete'],
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
      expect(configData.storageDirectoryDetails).toEqual([
        {
          directoryPath: '/incoming',
          description: 'Incoming artifacts',
        },
      ]);

      const rootUpload = await uploadFile('root.txt', 'blocked');
      expect(rootUpload.status).toBe(400);

      const deleteOnlyUpload = await uploadFile(
        'delete-only/file.txt',
        'blocked'
      );
      expect(deleteOnlyUpload.status).toBe(403);

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

  test('should upload, list, and download nested files under matching storage rules', async () => {
    const server = await startServer('none', {
      storage: {
        '/runs': {},
      },
    });

    try {
      const nestedPath = 'runs/24224477918/attempt-1/foobar.txt';
      const uploadResponse = await uploadFile(nestedPath, 'nested payload');
      expect(uploadResponse.status).toBe(201);
      const uploadData = await uploadResponse.json();
      expect(uploadData.path).toBe(nestedPath);
      expect(uploadData.directoryPath).toBe('/runs/24224477918/attempt-1');
      expect(uploadData.fileName).toBe('foobar.txt');

      expect(
        await fs.readFile(
          path.join(
            testStorageDir,
            'runs',
            '24224477918',
            'attempt-1',
            'foobar.txt',
            uploadData.uploadId,
            'foobar.txt'
          ),
          'utf-8'
        )
      ).toBe('nested payload');

      const listResponse = await fetch(
        `http://localhost:${serverPort}/api/files?skip=0&take=20`
      );
      expect(listResponse.status).toBe(200);
      const listData = await listResponse.json();
      expect(listData.totalCount).toBe(1);
      expect(listData.items[0].publicPath).toBe(nestedPath);
      expect(listData.items[0].directoryPath).toBe(
        '/runs/24224477918/attempt-1'
      );
      expect(listData.items[0].fileName).toBe('foobar.txt');
      expect(listData.items[0].versions[0].uploadId).toBe(uploadData.uploadId);

      const latestResponse = await fetch(
        `http://localhost:${serverPort}/api/files/runs/24224477918/attempt-1/foobar.txt`
      );
      expect(latestResponse.status).toBe(200);
      expect(await latestResponse.text()).toBe('nested payload');

      const specificResponse = await fetch(
        `http://localhost:${serverPort}/api/files/runs/24224477918/attempt-1/foobar.txt/${uploadData.uploadId}`
      );
      expect(specificResponse.status).toBe(200);
      expect(await specificResponse.text()).toBe('nested payload');
    } finally {
      await server.close();
    }
  }, 30000);
});
