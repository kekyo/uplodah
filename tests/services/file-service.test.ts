// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { access, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createConsoleLogger } from '../../src/logger';
import { createFileService } from '../../src/services/fileService';
import { compareUploadIdsDesc } from '../../src/utils/fileId';
import {
  createTestDirectory,
  testGlobalLogLevel,
} from '../helpers/test-helper';

describe('File service', () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await createTestDirectory('file-service');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('stores files under file-name/timestamp/file-name and appends sequential suffix on collision', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T20:30:40.123+09:00'));

    const logger = createConsoleLogger('file-service-test', testGlobalLogLevel);
    const service = createFileService({
      storageDir,
      logger,
      storage: undefined,
    });

    await service.initialize();

    const firstUpload = await service.saveFile({
      fileName: encodeURIComponent('report.txt'),
      content: Buffer.from('first revision', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });

    const secondUpload = await service.saveFile({
      fileName: encodeURIComponent('report.txt'),
      content: Buffer.from('second revision', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });

    expect(firstUpload.groupId).toBe('report.txt');
    expect(firstUpload.uploadId).toBe('20260406_203040_123');
    expect(secondUpload.uploadId).toBe('20260406_203040_123_1');
    expect(firstUpload.downloadPath).toBe(
      '/api/files/report.txt/20260406_203040_123'
    );
    expect(firstUpload.latestDownloadPath).toBe('/api/files/report.txt');
    expect(firstUpload.downloadUrl).toBe(
      'http://localhost:5968/api/files/report.txt/20260406_203040_123'
    );
    expect(firstUpload.latestDownloadUrl).toBe(
      'http://localhost:5968/api/files/report.txt'
    );

    const firstStoredPath = path.join(
      storageDir,
      'report.txt',
      firstUpload.uploadId,
      'report.txt'
    );
    const secondStoredPath = path.join(
      storageDir,
      'report.txt',
      secondUpload.uploadId,
      'report.txt'
    );

    await expect(access(firstStoredPath)).resolves.toBeUndefined();
    await expect(access(secondStoredPath)).resolves.toBeUndefined();
    await expect(readFile(firstStoredPath, 'utf8')).resolves.toBe(
      'first revision'
    );
    await expect(readFile(secondStoredPath, 'utf8')).resolves.toBe(
      'second revision'
    );
    await expect(
      service.resolveFile({
        groupId: 'report.txt',
        uploadId: undefined,
      })
    ).resolves.toMatchObject({
      fileName: 'report.txt',
      size: Buffer.byteLength('second revision', 'utf8'),
    });
  });

  test('rejects directory paths when storage rules are not configured', async () => {
    const logger = createConsoleLogger('file-service-test', testGlobalLogLevel);
    const service = createFileService({
      storageDir,
      logger,
      storage: undefined,
    });

    await service.initialize();

    await expect(
      service.saveFile({
        fileName: encodeURIComponent('folder/report.txt'),
        content: Buffer.from('invalid', 'utf8'),
        baseUrl: 'http://localhost:5968/',
      })
    ).rejects.toThrow(
      'Only plain file names are allowed when storage rules are not configured'
    );

    await expect(
      service.saveFile({
        fileName: encodeURIComponent('/foobar/'),
        content: Buffer.from('invalid', 'utf8'),
        baseUrl: 'http://localhost:5968/',
      })
    ).rejects.toThrow(
      'Only plain file names are allowed when storage rules are not configured'
    );

    await expect(
      service.saveFile({
        fileName: encodeURIComponent('/tmp/nested/report.txt'),
        content: Buffer.from('invalid', 'utf8'),
        baseUrl: 'http://localhost:5968/',
      })
    ).rejects.toThrow(
      'Only plain file names are allowed when storage rules are not configured'
    );
  });

  test('builds the in-memory index at initialize time and only updates it via uploads', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T20:30:40.125+09:00'));

    const existingStoredPath = path.join(
      storageDir,
      'existing.txt',
      '20260406_203040_123',
      'existing.txt'
    );
    await mkdir(path.dirname(existingStoredPath), {
      recursive: true,
    });
    await writeFile(existingStoredPath, 'existing revision', 'utf8');

    const logger = createConsoleLogger('file-service-test', testGlobalLogLevel);
    const service = createFileService({
      storageDir,
      logger,
      storage: undefined,
    });

    await service.initialize();

    const firstList = await service.listFiles('http://localhost:5968/', 0, 20);
    expect(firstList.totalGroups).toBe(1);
    expect(firstList.totalFiles).toBe(1);
    expect(firstList.groups.map((group) => group.fileName)).toEqual([
      'existing.txt',
    ]);

    const externallyAddedPath = path.join(
      storageDir,
      'external.txt',
      '20260406_203040_124',
      'external.txt'
    );
    await mkdir(path.dirname(externallyAddedPath), {
      recursive: true,
    });
    await writeFile(externallyAddedPath, 'external revision', 'utf8');

    const secondList = await service.listFiles('http://localhost:5968/', 0, 20);
    expect(secondList.totalGroups).toBe(1);
    expect(secondList.totalFiles).toBe(1);
    expect(secondList.groups.map((group) => group.fileName)).toEqual([
      'existing.txt',
    ]);

    await service.saveFile({
      fileName: encodeURIComponent('live.txt'),
      content: Buffer.from('live revision', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });

    const thirdList = await service.listFiles('http://localhost:5968/', 0, 20);
    expect(thirdList.totalGroups).toBe(2);
    expect(thirdList.totalFiles).toBe(2);
    expect(thirdList.groups.map((group) => group.fileName)).toEqual([
      'live.txt',
      'existing.txt',
    ]);
  });

  test('shares the in-flight initialize scan across concurrent callers', async () => {
    const logger = createConsoleLogger('file-service-test', testGlobalLogLevel);
    const service = createFileService({
      storageDir,
      logger,
      storage: undefined,
    });
    const firstInitialize = service.initialize();
    const secondInitialize = service.initialize();
    const thirdInitialize = service.initialize();

    expect(secondInitialize).toBe(firstInitialize);
    expect(thirdInitialize).toBe(firstInitialize);
    await Promise.all([firstInitialize, secondInitialize, thirdInitialize]);
  });

  test('keeps grouped revision counts consistent under concurrent uploads', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T20:30:40.128+09:00'));

    const logger = createConsoleLogger('file-service-test', testGlobalLogLevel);
    const service = createFileService({
      storageDir,
      logger,
      storage: undefined,
    });

    await service.initialize();

    const uploads = await Promise.all([
      service.saveFile({
        fileName: encodeURIComponent('report.txt'),
        content: Buffer.from('first revision', 'utf8'),
        baseUrl: 'http://localhost:5968/',
      }),
      service.saveFile({
        fileName: encodeURIComponent('report.txt'),
        content: Buffer.from('second revision', 'utf8'),
        baseUrl: 'http://localhost:5968/',
      }),
      service.saveFile({
        fileName: encodeURIComponent('report.txt'),
        content: Buffer.from('third revision', 'utf8'),
        baseUrl: 'http://localhost:5968/',
      }),
    ]);

    expect(new Set(uploads.map((upload) => upload.uploadId)).size).toBe(3);

    const list = await service.listFiles('http://localhost:5968/', 0, 20);
    expect(list.totalGroups).toBe(1);
    expect(list.totalFiles).toBe(3);
    expect(list.groups[0]?.versionCount).toBe(3);
    expect(list.groups[0]?.versions.map((version) => version.uploadId)).toEqual(
      uploads.map((upload) => upload.uploadId).sort(compareUploadIdsDesc)
    );
  });

  test('stores configured subdirectory uploads under the managed namespace and resolves downloads by basename', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T20:30:40.129+09:00'));

    const logger = createConsoleLogger('file-service-test', testGlobalLogLevel);
    const service = createFileService({
      storageDir,
      logger,
      storage: {
        '/tmp': {
          expireSeconds: 86400,
        },
        '/tmp/foobar': {
          expireSeconds: 60,
        },
      },
    });

    await service.initialize();

    const upload = await service.saveFile({
      fileName: encodeURIComponent('/tmp/foobar/report.txt'),
      content: Buffer.from('managed revision', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });

    expect(upload.groupId).toBe('/tmp/foobar/report.txt');
    expect(upload.fileName).toBe('/tmp/foobar/report.txt');
    expect(upload.downloadPath).toBe(
      `/api/files/tmp/foobar/report.txt/${upload.uploadId}`
    );
    expect(upload.latestDownloadPath).toBe('/api/files/tmp/foobar/report.txt');

    const storedPath = path.join(
      storageDir,
      '.uplodah',
      'groups',
      'tree',
      'tmp',
      'foobar',
      'report.txt',
      upload.uploadId,
      'report.txt'
    );

    await expect(access(storedPath)).resolves.toBeUndefined();
    await expect(readFile(storedPath, 'utf8')).resolves.toBe(
      'managed revision'
    );
    await expect(
      service.resolveFile({
        groupId: upload.groupId,
        uploadId: upload.uploadId,
      })
    ).resolves.toMatchObject({
      fileName: 'report.txt',
      size: Buffer.byteLength('managed revision', 'utf8'),
    });
    await expect(
      service.resolveFile({
        groupId: upload.groupId,
        uploadId: undefined,
      })
    ).resolves.toMatchObject({
      fileName: 'report.txt',
      size: Buffer.byteLength('managed revision', 'utf8'),
    });
  });

  test('uses the most specific configured storage rule and rejects uploads outside configured directories', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T20:30:40.130+09:00'));

    const logger = createConsoleLogger('file-service-test', testGlobalLogLevel);
    const service = createFileService({
      storageDir,
      logger,
      storage: {
        '/tmp': {
          expireSeconds: 60,
        },
        '/tmp/foobar': {
          expireSeconds: 1,
        },
        '/weekly': {},
        '/artifacts': {
          readonly: true,
        },
      },
    });

    await service.initialize();

    const fastUpload = await service.saveFile({
      fileName: encodeURIComponent('/tmp/foobar/fast.txt'),
      content: Buffer.from('fast', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });
    const stableUpload = await service.saveFile({
      fileName: encodeURIComponent('/weekly/stable.txt'),
      content: Buffer.from('stable', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });

    await vi.advanceTimersByTimeAsync(1_200);

    expect(await service.deleteExpiredFiles(new Date())).toBe(1);
    await expect(
      service.resolveFile({
        groupId: fastUpload.groupId,
        uploadId: fastUpload.uploadId,
      })
    ).resolves.toBeUndefined();
    await expect(
      service.resolveFile({
        groupId: stableUpload.groupId,
        uploadId: stableUpload.uploadId,
      })
    ).resolves.toMatchObject({
      fileName: 'stable.txt',
    });

    await expect(
      service.saveFile({
        fileName: encodeURIComponent('report.txt'),
        content: Buffer.from('root', 'utf8'),
        baseUrl: 'http://localhost:5968/',
      })
    ).rejects.toThrow('Uploads to / are not allowed');
    await expect(
      service.saveFile({
        fileName: encodeURIComponent('/artifacts/report.txt'),
        content: Buffer.from('readonly', 'utf8'),
        baseUrl: 'http://localhost:5968/',
      })
    ).rejects.toThrow('Uploads to /artifacts are read-only');
    await expect(
      service.saveFile({
        fileName: encodeURIComponent('/missing/report.txt'),
        content: Buffer.from('missing', 'utf8'),
        baseUrl: 'http://localhost:5968/',
      })
    ).rejects.toThrow('Uploads to /missing are not allowed');
  });

  test('indexes metadata-backed subdirectory uploads safely when storage rules are not configured', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T20:30:40.131+09:00'));

    const uploadDirectoryPath = path.join(
      storageDir,
      'tmp',
      'nested',
      'report.txt',
      '20260406_203040_123'
    );
    await mkdir(uploadDirectoryPath, {
      recursive: true,
    });
    await writeFile(
      path.join(uploadDirectoryPath, 'report.txt'),
      'metadata revision',
      'utf8'
    );
    await writeFile(
      path.join(uploadDirectoryPath, 'metadata.json'),
      '{\n  // metadata placeholder\n}\n',
      'utf8'
    );

    const invalidUploadDirectoryPath = path.join(
      storageDir,
      'unsafe',
      'ignored.txt',
      '20260406_203040_124'
    );
    await mkdir(invalidUploadDirectoryPath, {
      recursive: true,
    });
    await writeFile(
      path.join(invalidUploadDirectoryPath, 'ignored.txt'),
      'ignored revision',
      'utf8'
    );

    const logger = createConsoleLogger('file-service-test', testGlobalLogLevel);
    const service = createFileService({
      storageDir,
      logger,
      storage: undefined,
    });

    await service.initialize();

    const list = await service.listFiles('http://localhost:5968/', 0, 20);
    expect(list.groups.map((group) => group.fileName)).toEqual([
      '/tmp/nested/report.txt',
    ]);
    await expect(
      service.resolveFile({
        groupId: '/tmp/nested/report.txt',
        uploadId: '20260406_203040_123',
      })
    ).resolves.toMatchObject({
      fileName: 'report.txt',
      size: Buffer.byteLength('metadata revision', 'utf8'),
    });
  });

  test('does not index old tmp compatibility layout without metadata', async () => {
    const oldLayoutUploadDirectoryPath = path.join(
      storageDir,
      'tmp',
      'report.txt',
      '20260406_203040_123'
    );
    await mkdir(oldLayoutUploadDirectoryPath, {
      recursive: true,
    });
    await writeFile(
      path.join(oldLayoutUploadDirectoryPath, 'report.txt'),
      'old layout revision',
      'utf8'
    );

    const logger = createConsoleLogger('file-service-test', testGlobalLogLevel);
    const service = createFileService({
      storageDir,
      logger,
      storage: undefined,
    });

    await service.initialize();

    const list = await service.listFiles('http://localhost:5968/', 0, 20);
    expect(list.groups).toEqual([]);
  });
});
