// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { access } from 'fs/promises';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createConsoleLogger } from '../../src/logger';
import { createFileService } from '../../src/services/fileService';
import { createTemporaryFileCleanupService } from '../../src/services/temporaryFileCleanupService';
import {
  createTestDirectory,
  testGlobalLogLevel,
} from '../helpers/test-helper';

describe('Temporary file cleanup service', () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await createTestDirectory('temporary-cleanup');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('deletes expiring uploads that already exist when the cleanup worker starts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T20:30:40.000+09:00'));

    const logger = createConsoleLogger(
      'temporary-cleanup-test',
      testGlobalLogLevel
    );
    const fileService = createFileService({
      storageDir,
      logger,
      storage: {
        '/tmp': {
          expireSeconds: 60,
        },
      },
    });
    await fileService.initialize();

    const upload = await fileService.saveFile({
      fileName: encodeURIComponent('/tmp/report.txt'),
      content: Buffer.from('temporary revision', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });

    const cleanupService = createTemporaryFileCleanupService({
      fileService,
      logger,
    });
    await cleanupService.start();

    const storedPath = path.join(
      storageDir,
      '.uplodah',
      'groups',
      'tree',
      'tmp',
      'report.txt',
      upload.uploadId,
      'report.txt'
    );
    await expect(access(storedPath)).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(59_000);
    await expect(access(storedPath)).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(1_000);
    await cleanupService.close();
    await expect(access(storedPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      fileService.resolveFile({
        groupId: upload.groupId,
        uploadId: upload.uploadId,
      })
    ).resolves.toBeUndefined();
  });

  test('reschedules cleanup when an expiring upload is added after the worker becomes idle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T20:30:40.000+09:00'));

    const logger = createConsoleLogger(
      'temporary-cleanup-test',
      testGlobalLogLevel
    );
    const fileService = createFileService({
      storageDir,
      logger,
      storage: {
        '/tmp': {
          expireSeconds: 30,
        },
      },
    });
    await fileService.initialize();

    const cleanupService = createTemporaryFileCleanupService({
      fileService,
      logger,
    });
    await cleanupService.start();

    const upload = await fileService.saveFile({
      fileName: encodeURIComponent('/tmp/later.txt'),
      content: Buffer.from('later revision', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });
    await cleanupService.notifyFileStored();

    const storedPath = path.join(
      storageDir,
      '.uplodah',
      'groups',
      'tree',
      'tmp',
      'later.txt',
      upload.uploadId,
      'later.txt'
    );

    await vi.advanceTimersByTimeAsync(29_000);
    await expect(access(storedPath)).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(1_000);
    await cleanupService.close();
    await expect(access(storedPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('applies the most specific configured expiration and keeps non-expiring directories intact', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T20:30:40.000+09:00'));

    const logger = createConsoleLogger(
      'temporary-cleanup-test',
      testGlobalLogLevel
    );
    const fileService = createFileService({
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
      },
    });
    await fileService.initialize();

    const fastUpload = await fileService.saveFile({
      fileName: encodeURIComponent('/tmp/foobar/fast.txt'),
      content: Buffer.from('fast revision', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });
    const slowUpload = await fileService.saveFile({
      fileName: encodeURIComponent('/tmp/slow.txt'),
      content: Buffer.from('slow revision', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });
    const weeklyUpload = await fileService.saveFile({
      fileName: encodeURIComponent('/weekly/report.txt'),
      content: Buffer.from('weekly revision', 'utf8'),
      baseUrl: 'http://localhost:5968/',
    });

    const cleanupService = createTemporaryFileCleanupService({
      fileService,
      logger,
    });
    await cleanupService.start();
    await cleanupService.notifyFileStored();

    const fastPath = path.join(
      storageDir,
      '.uplodah',
      'groups',
      'tree',
      'tmp',
      'foobar',
      'fast.txt',
      fastUpload.uploadId,
      'fast.txt'
    );
    const slowPath = path.join(
      storageDir,
      '.uplodah',
      'groups',
      'tree',
      'tmp',
      'slow.txt',
      slowUpload.uploadId,
      'slow.txt'
    );
    const weeklyPath = path.join(
      storageDir,
      '.uplodah',
      'groups',
      'tree',
      'weekly',
      'report.txt',
      weeklyUpload.uploadId,
      'report.txt'
    );

    await vi.advanceTimersByTimeAsync(1_200);
    await cleanupService.close();
    await expect(access(fastPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(slowPath)).resolves.toBeUndefined();
    await expect(access(weeklyPath)).resolves.toBeUndefined();
  });
});
