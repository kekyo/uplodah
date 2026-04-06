// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import type { FileGroup } from '../../src/types';
import { buildFileGroupSections } from '../../src/ui/utils/fileGroupSections';

const createFileGroup = (fileName: string): FileGroup => ({
  groupId: fileName,
  fileName,
  latestUploadedAt: '2026-04-06T11:30:40.123Z',
  versionCount: 1,
  totalSize: 123,
  versions: [
    {
      groupId: fileName,
      fileName,
      uploadId: '20260406_203040_123',
      uploadedAt: '2026-04-06T11:30:40.123Z',
      size: 123,
      downloadPath: '/api/files/example/20260406_203040_123',
    },
  ],
});

describe('file group sections', () => {
  test('groups file groups by the most specific configured storage section', () => {
    const sections = buildFileGroupSections({
      groups: [
        createFileGroup('report.txt'),
        createFileGroup('/tmp/notes.txt'),
        createFileGroup('/tmp/foobar/archive.zip'),
      ],
      storageSections: [
        {
          path: '/',
        },
        {
          path: '/tmp',
        },
        {
          path: '/tmp/foobar',
        },
      ],
      storageConfigured: true,
    });

    expect(sections).toEqual([
      {
        id: '/',
        title: 'Root (/)',
        path: '/',
        isFallback: false,
        items: [
          {
            group: expect.objectContaining({
              fileName: 'report.txt',
            }),
            displayFileName: 'report.txt',
          },
        ],
      },
      {
        id: '/tmp',
        title: '/tmp',
        path: '/tmp',
        isFallback: false,
        items: [
          {
            group: expect.objectContaining({
              fileName: '/tmp/notes.txt',
            }),
            displayFileName: 'notes.txt',
          },
        ],
      },
      {
        id: '/tmp/foobar',
        title: '/tmp/foobar',
        path: '/tmp/foobar',
        isFallback: false,
        items: [
          {
            group: expect.objectContaining({
              fileName: '/tmp/foobar/archive.zip',
            }),
            displayFileName: 'archive.zip',
          },
        ],
      },
    ]);
  });

  test('keeps metadata-backed subdirectories outside the implicit root section', () => {
    const sections = buildFileGroupSections({
      groups: [
        createFileGroup('report.txt'),
        createFileGroup('/tmp/nested/report.txt'),
      ],
      storageSections: [
        {
          path: '/',
        },
      ],
      storageConfigured: false,
    });

    expect(sections).toEqual([
      {
        id: '/',
        title: 'Root (/)',
        path: '/',
        isFallback: false,
        items: [
          {
            group: expect.objectContaining({
              fileName: 'report.txt',
            }),
            displayFileName: 'report.txt',
          },
        ],
      },
      {
        id: '__other__',
        title: 'Other',
        path: undefined,
        isFallback: true,
        items: [
          {
            group: expect.objectContaining({
              fileName: '/tmp/nested/report.txt',
            }),
            displayFileName: '/tmp/nested/report.txt',
          },
        ],
      },
    ]);
  });
});
