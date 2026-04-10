// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { createStorageService } from '../src/services/storageService';
import { Logger, ServerConfig } from '../src/types';
import { createTestDirectory } from './helpers/test-helper';

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('storageService', () => {
  let testDir: string;

  beforeEach(async (fn) => {
    testDir = await createTestDirectory('storage-service', fn.task.name);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createService = (config: Partial<ServerConfig> = {}) =>
    createStorageService(
      {
        port: 5968,
        storageDir: testDir,
        ...config,
      },
      logger
    );

  it('should allow root uploads without storage rules and reject subdirectories', async () => {
    const service = createService();
    await service.initialize();

    expect(service.getAvailableUploadDirectories()).toEqual(['/']);

    const stored = await service.storeFile('report.txt', Buffer.from('hello'));
    expect(stored.publicPath).toBe('report.txt');
    expect(
      await fs.readFile(
        path.join(testDir, 'report.txt', stored.uploadId, 'report.txt'),
        'utf-8'
      )
    ).toBe('hello');
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(testDir, 'report.txt', stored.uploadId, 'metadata.json'),
          'utf-8'
        )
      )
    ).toEqual({});

    await expect(
      service.storeFile('nested/report.txt', Buffer.from('nope'))
    ).rejects.toThrow('Subdirectories require storage rules to be configured');
  });

  it('should filter readonly directories from available uploads and enforce rules', async () => {
    const service = createService({
      storage: {
        '/incoming': {
          description: 'Incoming artifacts',
        },
        '/readonly': {
          description: 'Read-only archive',
          readonly: true,
        },
      },
    });
    await service.initialize();

    expect(service.getAvailableUploadDirectories()).toEqual(['/incoming']);
    expect(service.getAvailableUploadDirectoryDetails()).toEqual([
      {
        directoryPath: '/incoming',
        description: 'Incoming artifacts',
      },
    ]);
    expect(await service.listBrowseDirectories()).toEqual([
      {
        directoryPath: '/incoming',
        description: 'Incoming artifacts',
        readonly: false,
        fileGroupCount: 0,
      },
      {
        directoryPath: '/readonly',
        description: 'Read-only archive',
        readonly: true,
        fileGroupCount: 0,
      },
    ]);

    await expect(
      service.storeFile('plain.txt', Buffer.from('blocked'))
    ).rejects.toThrow('Upload directory is not defined in storage rules');
    await expect(
      service.storeFile('readonly/file.txt', Buffer.from('blocked'))
    ).rejects.toThrow('Upload directory is read-only');

    const stored = await service.storeFile(
      'incoming/file.txt',
      Buffer.from('allowed')
    );
    expect(stored.directoryPath).toBe('/incoming');
    expect(stored.fileName).toBe('file.txt');
    expect(
      await fs.readFile(
        path.join(testDir, 'incoming', 'file.txt', stored.uploadId, 'file.txt'),
        'utf-8'
      )
    ).toBe('allowed');
    await expect(fs.stat(path.join(testDir, '.uplodah'))).rejects.toMatchObject(
      {
        code: 'ENOENT',
      }
    );
    expect(await service.listBrowseDirectories()).toEqual([
      {
        directoryPath: '/incoming',
        description: 'Incoming artifacts',
        readonly: false,
        fileGroupCount: 1,
      },
      {
        directoryPath: '/readonly',
        description: 'Read-only archive',
        readonly: true,
        fileGroupCount: 0,
      },
    ]);
    expect(await service.listDirectoryFileGroups('/incoming')).toEqual([
      {
        publicPath: 'incoming/file.txt',
        displayPath: '/incoming/file.txt',
        directoryPath: '/incoming',
        fileName: 'file.txt',
        latestUploadId: stored.uploadId,
        latestUploadedAt: stored.uploadedAt,
        latestDownloadPath: '/api/files/incoming/file.txt',
      },
    ]);
    expect(await service.listFileGroupVersions('incoming/file.txt')).toEqual([
      {
        uploadId: stored.uploadId,
        uploadedAt: stored.uploadedAt,
        size: stored.size,
        versionDownloadPath: `/api/files/incoming/file.txt/${stored.uploadId}`,
      },
    ]);
  });

  it('should allow nested uploads under matching rule prefixes and honor more specific rules', async () => {
    const service = createService({
      storage: {
        '/runs': {},
        '/readonly': {
          readonly: true,
        },
        '/readonly/incoming': {},
      },
    });
    await service.initialize();

    const nestedPath = 'runs/24224477918/attempt-1/foobar.txt';
    const stored = await service.storeFile(nestedPath, Buffer.from('allowed'));

    expect(stored.publicPath).toBe(nestedPath);
    expect(stored.directoryPath).toBe('/runs/24224477918/attempt-1');
    expect(stored.fileName).toBe('foobar.txt');
    expect(
      await fs.readFile(
        path.join(
          testDir,
          'runs',
          '24224477918',
          'attempt-1',
          'foobar.txt',
          stored.uploadId,
          'foobar.txt'
        ),
        'utf-8'
      )
    ).toBe('allowed');

    const latest = await service.getLatestFileVersion(nestedPath);
    expect(latest?.publicPath).toBe(nestedPath);
    expect(latest?.directoryPath).toBe('/runs/24224477918/attempt-1');

    const listResult = await service.listFiles(0, 20);
    expect(listResult.totalCount).toBe(1);
    expect(listResult.items[0].publicPath).toBe(nestedPath);
    expect(listResult.items[0].directoryPath).toBe(
      '/runs/24224477918/attempt-1'
    );
    expect(await service.listBrowseDirectories()).toEqual([
      {
        directoryPath: '/runs',
        readonly: false,
        fileGroupCount: 1,
      },
      {
        directoryPath: '/readonly',
        readonly: true,
        fileGroupCount: 0,
      },
      {
        directoryPath: '/readonly/incoming',
        readonly: false,
        fileGroupCount: 0,
      },
    ]);
    expect(await service.listDirectoryFileGroups('/runs')).toEqual([
      {
        publicPath: nestedPath,
        displayPath: '/runs/24224477918/attempt-1/foobar.txt',
        directoryPath: '/runs/24224477918/attempt-1',
        fileName: 'foobar.txt',
        latestUploadId: stored.uploadId,
        latestUploadedAt: stored.uploadedAt,
        latestDownloadPath: '/api/files/runs/24224477918/attempt-1/foobar.txt',
      },
    ]);

    await expect(
      service.storeFile('readonly/deep/file.txt', Buffer.from('blocked'))
    ).rejects.toThrow('Upload directory is read-only');

    const reopenedPath = 'readonly/incoming/2026/file.txt';
    const reopened = await service.storeFile(
      reopenedPath,
      Buffer.from('reopened')
    );
    expect(reopened.directoryPath).toBe('/readonly/incoming/2026');
    expect(
      await fs.readFile(
        path.join(
          testDir,
          'readonly',
          'incoming',
          '2026',
          'file.txt',
          reopened.uploadId,
          'file.txt'
        ),
        'utf-8'
      )
    ).toBe('reopened');
    expect(await service.listBrowseDirectories()).toEqual([
      {
        directoryPath: '/runs',
        readonly: false,
        fileGroupCount: 1,
      },
      {
        directoryPath: '/readonly',
        readonly: true,
        fileGroupCount: 0,
      },
      {
        directoryPath: '/readonly/incoming',
        readonly: false,
        fileGroupCount: 1,
      },
    ]);
    expect(await service.listDirectoryFileGroups('/readonly/incoming')).toEqual(
      [
        {
          publicPath: reopenedPath,
          displayPath: '/readonly/incoming/2026/file.txt',
          directoryPath: '/readonly/incoming/2026',
          fileName: 'file.txt',
          latestUploadId: reopened.uploadId,
          latestUploadedAt: reopened.uploadedAt,
          latestDownloadPath: '/api/files/readonly/incoming/2026/file.txt',
        },
      ]
    );
  });

  it('should create unique uploadIds when the timestamp collides', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:11:12.345Z'));

    const service = createService();
    await service.initialize();

    const first = await service.storeFile('report.txt', Buffer.from('first'));
    const second = await service.storeFile('report.txt', Buffer.from('second'));

    expect(first.uploadId).toBe('20260408_101112_345');
    expect(second.uploadId).toBe('20260408_101112_345_1');
  });

  it('should generate uploadIds and version URLs from UTC timestamps', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T19:11:12.345+09:00'));

    const service = createService();
    await service.initialize();

    const stored = await service.storeFile('report.txt', Buffer.from('utc'));

    expect(stored.uploadId).toBe('20260408_101112_345');
    expect(stored.uploadedAt).toBe('2026-04-08T10:11:12.345Z');
    expect(stored.versionDownloadPath).toBe(
      '/api/files/report.txt/20260408_101112_345'
    );
    expect(
      (await service.getFileVersion('report.txt', stored.uploadId))?.uploadedAt
    ).toBe('2026-04-08T10:11:12.345Z');
  });

  it('should return the latest version first and resolve specific versions', async () => {
    vi.useFakeTimers();

    const service = createService();
    await service.initialize();

    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));
    const first = await service.storeFile('report.txt', Buffer.from('first'));

    vi.setSystemTime(new Date('2026-04-08T10:00:01.000Z'));
    const second = await service.storeFile('report.txt', Buffer.from('second'));

    const listResult = await service.listFiles(0, 20);
    expect(listResult.totalCount).toBe(1);
    expect(listResult.items[0].latestUploadId).toBe(second.uploadId);
    expect(
      listResult.items[0].versions.map((version) => version.uploadId)
    ).toEqual([second.uploadId, first.uploadId]);

    const latest = await service.getLatestFileVersion('report.txt');
    expect(latest?.uploadId).toBe(second.uploadId);

    const specific = await service.getFileVersion('report.txt', first.uploadId);
    expect(specific?.uploadId).toBe(first.uploadId);
    expect(await fs.readFile(specific!.absoluteFilePath, 'utf-8')).toBe(
      'first'
    );
  });

  it('should remove expired versions when they are scanned', async () => {
    vi.useFakeTimers();

    const service = createService({
      storage: {
        '/incoming': {
          expireSeconds: 1,
        },
      },
    });
    await service.initialize();

    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));
    await service.storeFile('incoming/report.txt', Buffer.from('temp'));

    vi.setSystemTime(new Date('2026-04-08T10:00:02.000Z'));
    const listResult = await service.listFiles(0, 20);

    expect(listResult.totalCount).toBe(0);
    expect(
      await service.getLatestFileVersion('incoming/report.txt')
    ).toBeUndefined();
  });

  it('should ignore version directories with invalid metadata json', async () => {
    const service = createService({
      storage: {
        '/incoming': {},
      },
    });
    await service.initialize();

    const versionDirectoryPath = path.join(
      testDir,
      'incoming',
      'report.txt',
      '20260408_101112_345'
    );
    await fs.mkdir(versionDirectoryPath, { recursive: true });
    await fs.writeFile(path.join(versionDirectoryPath, 'metadata.json'), '{');
    await fs.writeFile(path.join(versionDirectoryPath, 'report.txt'), 'broken');

    const listResult = await service.listFiles(0, 20);
    expect(listResult.totalCount).toBe(0);
    expect(
      await service.getLatestFileVersion('incoming/report.txt')
    ).toBeUndefined();
  });

  it('should ignore version directories with invalid UTC timestamps in uploadIds', async () => {
    const service = createService({
      storage: {
        '/incoming': {},
      },
    });
    await service.initialize();

    const versionDirectoryPath = path.join(
      testDir,
      'incoming',
      'report.txt',
      '20261308_101112_345'
    );
    await fs.mkdir(versionDirectoryPath, { recursive: true });
    await fs.writeFile(path.join(versionDirectoryPath, 'metadata.json'), '{}');
    await fs.writeFile(path.join(versionDirectoryPath, 'report.txt'), 'broken');

    const listResult = await service.listFiles(0, 20);
    expect(listResult.totalCount).toBe(0);
    expect(
      await service.getLatestFileVersion('incoming/report.txt')
    ).toBeUndefined();
  });

  it('should ignore version directories whose payload file name does not match the group directory name', async () => {
    const service = createService({
      storage: {
        '/incoming': {},
      },
    });
    await service.initialize();

    const versionDirectoryPath = path.join(
      testDir,
      'incoming',
      'report.txt',
      '20260408_101112_345'
    );
    await fs.mkdir(versionDirectoryPath, { recursive: true });
    await fs.writeFile(path.join(versionDirectoryPath, 'metadata.json'), '{}');
    await fs.writeFile(
      path.join(versionDirectoryPath, 'different.txt'),
      'nope'
    );

    const listResult = await service.listFiles(0, 20);
    expect(listResult.totalCount).toBe(0);
    expect(
      await service.getLatestFileVersion('incoming/report.txt')
    ).toBeUndefined();
  });

  it('should search file groups by display path and uploadId', async () => {
    vi.useFakeTimers();

    const service = createService({
      storage: {
        '/': {},
        '/tmp': {},
      },
    });
    await service.initialize();

    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));
    const rootStored = await service.storeFile(
      'report.txt',
      Buffer.from('root')
    );

    vi.setSystemTime(new Date('2026-04-08T10:00:01.000Z'));
    const nestedStored = await service.storeFile(
      'tmp/flashcap.nupkg',
      Buffer.from('nested')
    );

    expect(await service.searchFileGroups('flashcap')).toEqual([
      {
        publicPath: 'tmp/flashcap.nupkg',
        displayPath: '/tmp/flashcap.nupkg',
        directoryPath: '/tmp',
        fileName: 'flashcap.nupkg',
        latestUploadId: nestedStored.uploadId,
        latestUploadedAt: nestedStored.uploadedAt,
        latestDownloadPath: '/api/files/tmp/flashcap.nupkg',
      },
    ]);
    expect(await service.searchFileGroups(rootStored.uploadId)).toEqual([
      {
        publicPath: 'report.txt',
        displayPath: 'report.txt',
        directoryPath: '/',
        fileName: 'report.txt',
        latestUploadId: rootStored.uploadId,
        latestUploadedAt: rootStored.uploadedAt,
        latestDownloadPath: '/api/files/report.txt',
      },
    ]);
  });
});
