// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { access } from 'fs/promises';
import path from 'path';
import { createConsoleLogger } from '../../src/logger';
import { FastifyServerInstance, startFastifyServer } from '../../src/server';
import {
  FileListResponse,
  ServerConfig,
  UploadResponse,
} from '../../src/types';
import {
  createTestDirectory,
  getTestPort,
  testGlobalLogLevel,
} from '../helpers/test-helper';

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

describe('Upload API', () => {
  let storageDir: string;
  let serverPort: number;
  let server: FastifyServerInstance | undefined = undefined;

  beforeEach(async () => {
    storageDir = await createTestDirectory('upload');
    serverPort = await getTestPort(8000);
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  test('stores uploads as same-name grouped revisions and serves latest and versioned downloads', async () => {
    const logger = createConsoleLogger('upload-api-test', testGlobalLogLevel);
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Upload API test',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    const firstUploadResponse = await fetch(
      `http://localhost:${serverPort}/api/upload/report.txt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from('first revision', 'utf8'),
      }
    );
    expect(firstUploadResponse.status).toBe(201);
    const firstUpload = (await firstUploadResponse.json()) as UploadResponse;

    await sleep(10);

    const secondUploadResponse = await fetch(
      `http://localhost:${serverPort}/api/upload/report.txt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from('second revision', 'utf8'),
      }
    );
    expect(secondUploadResponse.status).toBe(201);
    const secondUpload = (await secondUploadResponse.json()) as UploadResponse;

    expect(firstUpload.file.groupId).toBe(secondUpload.file.groupId);
    expect(firstUpload.file.uploadId).not.toBe(secondUpload.file.uploadId);
    expect(firstUpload.file.groupId).toBe('report.txt');
    expect(secondUpload.file.downloadPath).toBe(
      `/api/files/report.txt/${secondUpload.file.uploadId}`
    );
    expect(secondUpload.file.latestDownloadPath).toBe('/api/files/report.txt');
    expect(secondUpload.file.downloadUrl).toBe(
      `http://localhost:${serverPort}/api/files/report.txt/${secondUpload.file.uploadId}`
    );
    expect(secondUpload.file.latestDownloadUrl).toBe(
      `http://localhost:${serverPort}/api/files/report.txt`
    );
    expect(secondUploadResponse.headers.get('location')).toBe(
      secondUpload.file.downloadUrl
    );

    await expect(
      access(
        path.join(
          storageDir,
          'report.txt',
          firstUpload.file.uploadId,
          'report.txt'
        )
      )
    ).resolves.toBeUndefined();

    await expect(
      access(
        path.join(
          storageDir,
          'report.txt',
          secondUpload.file.uploadId,
          'report.txt'
        )
      )
    ).resolves.toBeUndefined();

    const listResponse = await fetch(
      `http://localhost:${serverPort}/api/files`
    );
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as FileListResponse;

    expect(listBody.totalGroups).toBe(1);
    expect(listBody.totalFiles).toBe(2);
    expect(listBody.skip).toBe(0);
    expect(listBody.take).toBe(20);
    expect(listBody.groups).toHaveLength(1);
    expect(listBody.groups[0]?.fileName).toBe('report.txt');
    expect(listBody.groups[0]?.versionCount).toBe(2);
    expect(listBody.groups[0]?.versions[0]?.uploadId).toBe(
      secondUpload.file.uploadId
    );
    expect(listBody.groups[0]?.versions[1]?.uploadId).toBe(
      firstUpload.file.uploadId
    );

    const latestDownloadResponse = await fetch(
      `http://localhost:${serverPort}${secondUpload.file.latestDownloadPath as string}`
    );
    expect(latestDownloadResponse.status).toBe(200);
    expect(latestDownloadResponse.headers.get('content-disposition')).toContain(
      'report.txt'
    );
    expect(
      Buffer.from(await latestDownloadResponse.arrayBuffer()).toString('utf8')
    ).toBe('second revision');

    const latestAliasDownloadResponse = await fetch(
      `http://localhost:${serverPort}${secondUpload.file.latestDownloadPath as string}/latest`
    );
    expect(latestAliasDownloadResponse.status).toBe(200);
    expect(
      Buffer.from(await latestAliasDownloadResponse.arrayBuffer()).toString(
        'utf8'
      )
    ).toBe('second revision');

    const versionDownloadResponse = await fetch(
      `http://localhost:${serverPort}${firstUpload.file.downloadPath}`
    );
    expect(versionDownloadResponse.status).toBe(200);
    expect(
      versionDownloadResponse.headers.get('content-disposition')
    ).toContain('report.txt');
    expect(
      Buffer.from(await versionDownloadResponse.arrayBuffer()).toString('utf8')
    ).toBe('first revision');
  }, 30000);

  test('rejects uploads without the file path in the URL', async () => {
    const logger = createConsoleLogger('upload-api-test', testGlobalLogLevel);
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Upload API test',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    for (const method of ['POST', 'PUT']) {
      const response = await fetch(
        `http://localhost:${serverPort}/api/upload`,
        {
          method,
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: Buffer.from('missing path', 'utf8'),
        }
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'Missing file path in request URL',
      });
    }
  }, 30000);

  test('accepts PUT uploads using the request path and returns machine-readable download locations', async () => {
    const logger = createConsoleLogger('upload-api-test', testGlobalLogLevel);
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Upload API test',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    const uploadResponse = await fetch(
      `http://localhost:${serverPort}/api/upload/report.txt`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from('put revision', 'utf8'),
      }
    );
    expect(uploadResponse.status).toBe(201);

    const uploadBody = (await uploadResponse.json()) as UploadResponse;
    expect(uploadBody.file.fileName).toBe('report.txt');
    expect(uploadBody.file.groupId).toBe('report.txt');
    expect(uploadBody.file.downloadPath).toBe(
      `/api/files/report.txt/${uploadBody.file.uploadId}`
    );
    expect(uploadBody.file.latestDownloadPath).toBe('/api/files/report.txt');
    expect(uploadBody.file.downloadUrl).toBe(
      `http://localhost:${serverPort}/api/files/report.txt/${uploadBody.file.uploadId}`
    );
    expect(uploadBody.file.latestDownloadUrl).toBe(
      `http://localhost:${serverPort}/api/files/report.txt`
    );
    expect(uploadResponse.headers.get('location')).toBe(
      uploadBody.file.downloadUrl
    );

    const latestDownloadResponse = await fetch(
      `http://localhost:${serverPort}${uploadBody.file.latestDownloadPath as string}`
    );
    expect(latestDownloadResponse.status).toBe(200);
    expect(
      Buffer.from(await latestDownloadResponse.arrayBuffer()).toString('utf8')
    ).toBe('put revision');
  }, 30000);

  test('stores configured subdirectory uploads, supports nested downloads, and applies the most specific expiration', async () => {
    const logger = createConsoleLogger('upload-api-test', testGlobalLogLevel);
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Upload API test',
      logLevel: testGlobalLogLevel,
      storage: {
        '/tmp': {
          expireSeconds: 60,
        },
        '/tmp/foobar': {
          expireSeconds: 1,
        },
      },
    };

    server = await startFastifyServer(config, logger);

    const uploadResponse = await fetch(
      `http://localhost:${serverPort}/api/upload/tmp/foobar/report.txt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from('managed revision', 'utf8'),
      }
    );
    expect(uploadResponse.status).toBe(201);

    const uploadBody = (await uploadResponse.json()) as UploadResponse;
    expect(uploadBody.file.groupId).toBe('/tmp/foobar/report.txt');
    expect(uploadBody.file.fileName).toBe('/tmp/foobar/report.txt');

    const storedPath = path.join(
      storageDir,
      '.uplodah',
      'groups',
      'tree',
      'tmp',
      'foobar',
      'report.txt',
      uploadBody.file.uploadId,
      'report.txt'
    );
    await expect(access(storedPath)).resolves.toBeUndefined();

    const listResponse = await fetch(
      `http://localhost:${serverPort}/api/files`
    );
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as FileListResponse;
    expect(listBody.groups[0]?.fileName).toBe('/tmp/foobar/report.txt');
    expect(listBody.groups[0]?.versions[0]?.downloadPath).toContain(
      '/api/files/tmp/foobar/report.txt/'
    );
    expect(listBody.groups[0]?.versions[0]?.latestDownloadPath).toBe(
      '/api/files/tmp/foobar/report.txt'
    );

    const downloadResponse = await fetch(
      `http://localhost:${serverPort}${uploadBody.file.downloadPath}`
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get('content-disposition')).toContain(
      'report.txt'
    );
    expect(downloadResponse.headers.get('content-disposition')).not.toContain(
      '/tmp/foobar/report.txt'
    );

    await sleep(1_200);

    await expect(access(storedPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const deletedDownloadResponse = await fetch(
      `http://localhost:${serverPort}${uploadBody.file.downloadPath}`
    );
    expect(deletedDownloadResponse.status).toBe(404);
  }, 30000);

  test('rejects root, readonly, and undefined directory uploads when storage rules are configured', async () => {
    const logger = createConsoleLogger('upload-api-test', testGlobalLogLevel);
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Upload API test',
      logLevel: testGlobalLogLevel,
      storage: {
        '/tmp': {
          expireSeconds: 60,
        },
        '/artifacts': {
          readonly: true,
        },
      },
    };

    server = await startFastifyServer(config, logger);

    const rootResponse = await fetch(
      `http://localhost:${serverPort}/api/upload/report.txt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from('root upload', 'utf8'),
      }
    );
    expect(rootResponse.status).toBe(400);
    expect((await rootResponse.json()).error).toBe(
      'Uploads to / are not allowed'
    );

    const readonlyResponse = await fetch(
      `http://localhost:${serverPort}/api/upload/artifacts/report.txt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from('readonly upload', 'utf8'),
      }
    );
    expect(readonlyResponse.status).toBe(400);
    expect((await readonlyResponse.json()).error).toBe(
      'Uploads to /artifacts are read-only'
    );

    const missingResponse = await fetch(
      `http://localhost:${serverPort}/api/upload/missing/report.txt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from('missing upload', 'utf8'),
      }
    );
    expect(missingResponse.status).toBe(400);
    expect((await missingResponse.json()).error).toBe(
      'Uploads to /missing are not allowed'
    );
  }, 30000);

  test('rejects directory-style uploads when storage rules are not configured', async () => {
    const logger = createConsoleLogger('upload-api-test', testGlobalLogLevel);
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Upload API test',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    for (const fileName of ['folder/report.txt', '/tmp/nested/report.txt']) {
      const uploadPath = fileName.replace(/^\/+/, '');
      const response = await fetch(
        `http://localhost:${serverPort}/api/upload/${uploadPath}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: Buffer.from('invalid upload', 'utf8'),
        }
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(
        'Only plain file names are allowed when storage rules are not configured'
      );
    }
  }, 30000);

  test('supports skip/take pagination for grouped file listing', async () => {
    const logger = createConsoleLogger('upload-api-test', testGlobalLogLevel);
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Upload API test',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    for (const fileName of ['alpha.txt', 'bravo.txt', 'charlie.txt']) {
      const response = await fetch(
        `http://localhost:${serverPort}/api/upload/${fileName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: Buffer.from(`content:${fileName}`, 'utf8'),
        }
      );
      expect(response.status).toBe(201);
      await sleep(10);
    }

    const response = await fetch(
      `http://localhost:${serverPort}/api/files?skip=1&take=1`
    );
    expect(response.status).toBe(200);

    const responseBody = (await response.json()) as FileListResponse;
    expect(responseBody.totalGroups).toBe(3);
    expect(responseBody.totalFiles).toBe(3);
    expect(responseBody.skip).toBe(1);
    expect(responseBody.take).toBe(1);
    expect(responseBody.groups).toHaveLength(1);
    expect(responseBody.groups[0]?.fileName).toBe('bravo.txt');
  }, 30000);

  test('emits prefixed download paths behind x-forwarded-path', async () => {
    const logger = createConsoleLogger('upload-api-test', testGlobalLogLevel);
    const config: ServerConfig = {
      port: serverPort,
      storageDir,
      realm: 'Upload API test',
      logLevel: testGlobalLogLevel,
    };

    server = await startFastifyServer(config, logger);

    const uploadResponse = await fetch(
      `http://localhost:${serverPort}/proxy/api/upload/report.txt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-forwarded-path': '/proxy',
        },
        body: Buffer.from('proxied revision', 'utf8'),
      }
    );
    expect(uploadResponse.status).toBe(201);

    const listResponse = await fetch(
      `http://localhost:${serverPort}/proxy/api/files`,
      {
        headers: {
          'x-forwarded-path': '/proxy',
        },
      }
    );
    expect(listResponse.status).toBe(200);

    const listBody = (await listResponse.json()) as FileListResponse;
    expect(listBody.groups[0]?.versions[0]?.downloadPath).toContain(
      '/proxy/api/files/'
    );

    const downloadResponse = await fetch(
      `http://localhost:${serverPort}${listBody.groups[0]?.versions[0]?.downloadPath as string}`,
      {
        headers: {
          'x-forwarded-path': '/proxy',
        },
      }
    );
    expect(downloadResponse.status).toBe(200);
    expect(
      Buffer.from(await downloadResponse.arrayBuffer()).toString('utf8')
    ).toBe('proxied revision');
  }, 30000);
});
