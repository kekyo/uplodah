// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import { rmSync } from 'node:fs';
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

  it('keeps versions with linked payloads out of downloads and archives', async () => {
    const service = createService();
    await service.initialize();
    const version = await service.storeFile('notes.txt', Buffer.from('notes'));
    const stored = (await service.getFileVersion(
      'notes.txt',
      version.uploadId
    ))!;
    await fs.rename(stored.absoluteFilePath, stored.absoluteFilePath + '.copy');
    await fs.symlink('notes.txt.copy', stored.absoluteFilePath);
    expect(await service.getLatestFileVersion('notes.txt')).toBeUndefined();
    expect(
      await service.getFileVersion('notes.txt', version.uploadId)
    ).toBeUndefined();
  });

  it('refuses uploads through directory aliases within storage', async () => {
    const service = createService();
    await service.initialize();
    await service.storeFile('notes.txt', Buffer.from('notes'));
    await fs.symlink('notes.txt', path.join(testDir, 'alias.txt'), 'dir');
    await expect(
      service.storeFile('alias.txt', Buffer.from('alias'))
    ).rejects.toThrow();
  });

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

  it('should store upload metadata, expose it in version listings, and search by uploader and tags', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));

    const service = createService();
    await service.initialize();

    const stored = await service.storeFile('report.txt', Buffer.from('hello'), {
      uploadedBy: 'alice',
      tags: ['nightly', 'release'],
    });

    expect(
      JSON.parse(
        await fs.readFile(
          path.join(testDir, 'report.txt', stored.uploadId, 'metadata.json'),
          'utf-8'
        )
      )
    ).toEqual({
      uploadedBy: 'alice',
      tags: ['nightly', 'release'],
    });

    expect(await service.listFileGroupVersions('report.txt')).toEqual([
      {
        uploadId: stored.uploadId,
        uploadedAt: stored.uploadedAt,
        size: stored.size,
        versionDownloadPath: `/api/files/report.txt/${stored.uploadId}`,
        uploadedBy: 'alice',
        tags: ['nightly', 'release'],
      },
    ]);

    expect(await service.searchFileGroups('alice')).toEqual([
      {
        publicPath: 'report.txt',
        displayPath: 'report.txt',
        directoryPath: '/',
        browseDirectoryPath: '/',
        browseRelativePath: 'report.txt',
        fileName: 'report.txt',
        latestUploadId: stored.uploadId,
        latestUploadedAt: stored.uploadedAt,
        latestDownloadPath: '/api/files/report.txt',
      },
    ]);
    expect(await service.searchFileGroups('release')).toEqual([
      {
        publicPath: 'report.txt',
        displayPath: 'report.txt',
        directoryPath: '/',
        browseDirectoryPath: '/',
        browseRelativePath: 'report.txt',
        fileName: 'report.txt',
        latestUploadId: stored.uploadId,
        latestUploadedAt: stored.uploadedAt,
        latestDownloadPath: '/api/files/report.txt',
      },
    ]);
  });

  it('should filter uploadable directories by accept and enforce store rules', async () => {
    const service = createService({
      storage: {
        '/incoming': {
          description: 'Incoming artifacts',
          accept: ['store', 'delete'],
        },
        '/delete-only': {
          description: 'Delete-only archive',
          accept: ['delete'],
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
        accept: ['store', 'delete'],
        fileGroupCount: 0,
      },
      {
        directoryPath: '/delete-only',
        description: 'Delete-only archive',
        accept: ['delete'],
        fileGroupCount: 0,
      },
    ]);

    await expect(
      service.storeFile('plain.txt', Buffer.from('blocked'))
    ).rejects.toThrow('Upload directory is not defined in storage rules');
    await expect(
      service.storeFile('delete-only/file.txt', Buffer.from('blocked'))
    ).rejects.toThrow('Upload directory does not allow uploads');

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
        accept: ['store', 'delete'],
        fileGroupCount: 1,
      },
      {
        directoryPath: '/delete-only',
        description: 'Delete-only archive',
        accept: ['delete'],
        fileGroupCount: 0,
      },
    ]);
    expect(await service.listDirectoryFileGroups('/incoming')).toEqual([
      {
        publicPath: 'incoming/file.txt',
        displayPath: '/incoming/file.txt',
        directoryPath: '/incoming',
        browseDirectoryPath: '/incoming',
        browseRelativePath: 'file.txt',
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

  it('should resolve nested uploads under the configured virtual directory once', async () => {
    const service = createService({
      storage: {
        '/runs': {},
        '/archive': {
          accept: ['delete'],
        },
        '/archive/incoming': {},
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
        accept: ['store', 'delete'],
        fileGroupCount: 1,
      },
      {
        directoryPath: '/archive',
        accept: ['delete'],
        fileGroupCount: 0,
      },
      {
        directoryPath: '/archive/incoming',
        accept: ['store', 'delete'],
        fileGroupCount: 0,
      },
    ]);
    expect(await service.listDirectoryFileGroups('/runs')).toEqual([
      {
        publicPath: nestedPath,
        displayPath: '/runs/24224477918/attempt-1/foobar.txt',
        directoryPath: '/runs/24224477918/attempt-1',
        browseDirectoryPath: '/runs',
        browseRelativePath: '24224477918/attempt-1/foobar.txt',
        fileName: 'foobar.txt',
        latestUploadId: stored.uploadId,
        latestUploadedAt: stored.uploadedAt,
        latestDownloadPath: '/api/files/runs/24224477918/attempt-1/foobar.txt',
      },
    ]);

    await expect(
      service.storeFile('archive/deep/file.txt', Buffer.from('blocked'))
    ).rejects.toThrow('Upload directory does not allow uploads');

    const reopenedPath = 'archive/incoming/2026/file.txt';
    const reopened = await service.storeFile(
      reopenedPath,
      Buffer.from('reopened')
    );
    expect(reopened.directoryPath).toBe('/archive/incoming/2026');
    expect(
      await fs.readFile(
        path.join(
          testDir,
          'archive',
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
        accept: ['store', 'delete'],
        fileGroupCount: 1,
      },
      {
        directoryPath: '/archive',
        accept: ['delete'],
        fileGroupCount: 0,
      },
      {
        directoryPath: '/archive/incoming',
        accept: ['store', 'delete'],
        fileGroupCount: 1,
      },
    ]);
    expect(await service.listDirectoryFileGroups('/archive/incoming')).toEqual([
      {
        publicPath: reopenedPath,
        displayPath: '/archive/incoming/2026/file.txt',
        directoryPath: '/archive/incoming/2026',
        browseDirectoryPath: '/archive/incoming',
        browseRelativePath: '2026/file.txt',
        fileName: 'file.txt',
        latestUploadId: reopened.uploadId,
        latestUploadedAt: reopened.uploadedAt,
        latestDownloadPath: '/api/files/archive/incoming/2026/file.txt',
      },
    ]);
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

  it('should keep concurrent uploads in the same millisecond as separate versions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:11:12.345Z'));
    const service = createService();
    await service.initialize();

    const uploads = [
      {
        content: 'first report',
        metadata: { uploadedBy: 'alice', tags: ['daily'] },
      },
      {
        content: 'second report',
        metadata: { uploadedBy: 'bob', tags: ['weekly'] },
      },
    ];
    const versions = await Promise.all(
      uploads.map(
        async ({ content, metadata }) =>
          await createService().storeFile(
            'report.txt',
            Buffer.from(content),
            metadata
          )
      )
    );

    expect(versions.map((version) => version.uploadId).sort()).toEqual([
      '20260408_101112_345',
      '20260408_101112_345_1',
    ]);
    for (const [index, upload] of uploads.entries()) {
      const stored = await service.getFileVersion(
        'report.txt',
        versions[index]!.uploadId
      );
      expect(stored).toMatchObject(upload.metadata);
      expect(await fs.readFile(stored!.absoluteFilePath, 'utf8')).toBe(
        upload.content
      );
    }
  });

  it('should release the upload ID after an incomplete write so the upload can be retried', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:11:12.345Z'));
    const service = createService();
    await service.initialize();

    const writeFile = fs.writeFile;
    const writes = vi
      .spyOn(fs, 'writeFile')
      .mockImplementationOnce(writeFile)
      .mockRejectedValueOnce(new Error('Disk full'));
    try {
      await expect(
        service.storeFile('report.txt', Buffer.from('incomplete'))
      ).rejects.toThrow('Disk full');
    } finally {
      writes.mockRestore();
    }

    expect(await service.getLatestFileVersion('report.txt')).toBeUndefined();
    const retried = await service.storeFile(
      'report.txt',
      Buffer.from('complete')
    );
    expect(retried.uploadId).toBe('20260408_101112_345');
    const stored = await service.getFileVersion('report.txt', retried.uploadId);
    expect(await fs.readFile(stored!.absoluteFilePath, 'utf8')).toBe(
      'complete'
    );
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

  it('should delete a specific version and promote the previous version to latest', async () => {
    vi.useFakeTimers();

    const service = createService({
      storage: {
        '/incoming': {},
      },
    });
    await service.initialize();

    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));
    const first = await service.storeFile(
      'incoming/report.txt',
      Buffer.from('first')
    );

    vi.setSystemTime(new Date('2026-04-08T10:00:01.000Z'));
    const second = await service.storeFile(
      'incoming/report.txt',
      Buffer.from('second')
    );

    expect(
      await service.deleteFileVersion('incoming/report.txt', second.uploadId)
    ).toBe(true);
    expect(
      await service.getLatestFileVersion('incoming/report.txt')
    ).toMatchObject({
      uploadId: first.uploadId,
    });
    expect(await service.listFileGroupVersions('incoming/report.txt')).toEqual([
      {
        uploadId: first.uploadId,
        uploadedAt: first.uploadedAt,
        size: first.size,
        versionDownloadPath: `/api/files/incoming/report.txt/${first.uploadId}`,
      },
    ]);
    await expect(
      fs.stat(path.join(testDir, 'incoming', 'report.txt', second.uploadId))
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('should remove empty group directories when deleting the last version', async () => {
    const service = createService({
      storage: {
        '/incoming': {},
        '/delete-only': {
          accept: ['delete'],
        },
      },
    });
    await service.initialize();

    const stored = await service.storeFile(
      'incoming/report.txt',
      Buffer.from('single')
    );

    expect(
      await service.deleteFileVersion('incoming/report.txt', stored.uploadId)
    ).toBe(true);
    expect(
      await service.getLatestFileVersion('incoming/report.txt')
    ).toBeUndefined();
    expect(await service.listDirectoryFileGroups('/incoming')).toEqual([]);
    await expect(
      fs.stat(path.join(testDir, 'incoming', 'report.txt'))
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const deleteOnlyVersionDirectoryPath = path.join(
      testDir,
      'delete-only',
      'report.txt',
      stored.uploadId
    );
    await fs.mkdir(deleteOnlyVersionDirectoryPath, { recursive: true });
    await fs.writeFile(
      path.join(deleteOnlyVersionDirectoryPath, 'metadata.json'),
      '{}'
    );
    await fs.writeFile(
      path.join(deleteOnlyVersionDirectoryPath, 'report.txt'),
      'delete-only'
    );

    expect(
      await service.deleteFileVersion('delete-only/report.txt', stored.uploadId)
    ).toBe(true);
    await expect(
      fs.stat(path.join(testDir, 'delete-only', 'report.txt'))
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
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

  it('ignores an expired version already removed by another scan', async () => {
    vi.useFakeTimers();
    const service = createService({
      storage: { '/incoming': { expireSeconds: 1 } },
    });
    await service.initialize();
    const version = await service.storeFile(
      'incoming/report.txt',
      Buffer.from('temporary')
    );
    vi.setSystemTime(Date.now() + 2000);
    const info = vi.spyOn(logger, 'info').mockImplementation((message) => {
      if (message.startsWith('Removing expired upload:')) {
        rmSync(path.join(testDir, 'incoming/report.txt', version.uploadId), {
          recursive: true,
        });
      }
    });
    try {
      expect(
        await service.getLatestFileVersion('incoming/report.txt')
      ).toBeUndefined();
    } finally {
      info.mockRestore();
    }
  });

  it('should keep a nested file when the parent version expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));
    const service = createService({
      storage: { '/incoming': { expireSeconds: 10 } },
    });
    await service.initialize();
    const parent = await service.storeFile(
      'incoming/report.txt',
      Buffer.from('report')
    );

    vi.setSystemTime(new Date('2026-04-08T10:00:05.000Z'));
    const nestedPath = `${parent.publicPath}/${parent.uploadId}`;
    const nested = await service.storeFile(nestedPath, Buffer.from('nested'));
    vi.setSystemTime(new Date('2026-04-08T10:00:10.000Z'));

    expect(
      await service.getFileVersion(parent.publicPath, parent.uploadId)
    ).toBeUndefined();
    const directories = await service.listDirectoryFileGroups('/incoming');
    expect(directories.map((file) => file.publicPath)).toEqual([nestedPath]);
    const remaining = await service.getFileVersion(nestedPath, nested.uploadId);
    expect(await fs.readFile(remaining!.absoluteFilePath, 'utf8')).toBe(
      'nested'
    );
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
        browseDirectoryPath: '/tmp',
        browseRelativePath: 'flashcap.nupkg',
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
        browseDirectoryPath: '/',
        browseRelativePath: 'report.txt',
        fileName: 'report.txt',
        latestUploadId: rootStored.uploadId,
        latestUploadedAt: rootStored.uploadedAt,
        latestDownloadPath: '/api/files/report.txt',
      },
    ]);
  });

  it('should ignore stored file groups outside configured virtual directories', async () => {
    const service = createService({
      storage: {
        '/incoming': {},
      },
    });
    await service.initialize();

    const strayVersionDirectoryPath = path.join(
      testDir,
      'other',
      'ghost.txt',
      '20260408_101112_345'
    );
    await fs.mkdir(strayVersionDirectoryPath, { recursive: true });
    await fs.writeFile(
      path.join(strayVersionDirectoryPath, 'metadata.json'),
      '{}'
    );
    await fs.writeFile(path.join(strayVersionDirectoryPath, 'ghost.txt'), 'x');

    const kept = await service.storeFile(
      'incoming/kept.txt',
      Buffer.from('kept')
    );

    const listResult = await service.listFiles(0, 20);
    expect(listResult.totalCount).toBe(1);
    expect(listResult.items.map((item) => item.publicPath)).toEqual([
      kept.publicPath,
    ]);
    expect(await service.searchFileGroups('other')).toEqual([]);
    expect(
      await service.getLatestFileVersion('other/ghost.txt')
    ).toBeUndefined();
    expect(await service.listFileGroupVersions('other/ghost.txt')).toEqual([]);
  });

  it('should resolve virtual directories by path segments instead of string prefixes', async () => {
    const service = createService({
      storage: {
        '/runs': {},
        '/runs2': {},
      },
    });
    await service.initialize();

    const stored = await service.storeFile(
      'runs2/24224477918/attempt-1/foobar.txt',
      Buffer.from('segmented')
    );

    expect(await service.listBrowseDirectories()).toEqual([
      {
        directoryPath: '/runs',
        accept: ['store', 'delete'],
        fileGroupCount: 0,
      },
      {
        directoryPath: '/runs2',
        accept: ['store', 'delete'],
        fileGroupCount: 1,
      },
    ]);
    expect(await service.listDirectoryFileGroups('/runs')).toEqual([]);
    expect(await service.listDirectoryFileGroups('/runs2')).toEqual([
      {
        publicPath: 'runs2/24224477918/attempt-1/foobar.txt',
        displayPath: '/runs2/24224477918/attempt-1/foobar.txt',
        directoryPath: '/runs2/24224477918/attempt-1',
        browseDirectoryPath: '/runs2',
        browseRelativePath: '24224477918/attempt-1/foobar.txt',
        fileName: 'foobar.txt',
        latestUploadId: stored.uploadId,
        latestUploadedAt: stored.uploadedAt,
        latestDownloadPath: '/api/files/runs2/24224477918/attempt-1/foobar.txt',
      },
    ]);
  });
});
