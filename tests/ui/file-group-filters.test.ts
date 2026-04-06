// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import { FileGroup } from '../../src/types';
import {
  filterFileGroups,
  hasFileGroupFilterTerms,
  shouldAutoLoadMore,
  sortFileGroups,
} from '../../src/ui/utils/fileGroupFilters';

const sampleGroups: FileGroup[] = [
  {
    groupId: 'alpha.txt',
    fileName: 'alpha.txt',
    latestUploadedAt: '2026-04-06T12:00:00.000Z',
    versionCount: 1,
    totalSize: 123,
    versions: [
      {
        groupId: 'alpha.txt',
        fileName: 'alpha.txt',
        uploadId: '20260406_210000_111',
        uploadedAt: '2026-04-06T12:00:00.000Z',
        size: 123,
        downloadPath: '/api/files/alpha.txt/20260406_210000_111',
      },
    ],
  },
  {
    groupId: 'Report.ZIP',
    fileName: 'Report.ZIP',
    latestUploadedAt: '2026-04-06T13:27:14.528Z',
    versionCount: 2,
    totalSize: 456,
    versions: [
      {
        groupId: 'Report.ZIP',
        fileName: 'Report.ZIP',
        uploadId: '20260406_222714_528',
        uploadedAt: '2026-04-06T13:27:14.528Z',
        size: 200,
        downloadPath: '/api/files/Report.ZIP/20260406_222714_528',
      },
      {
        groupId: 'Report.ZIP',
        fileName: 'Report.ZIP',
        uploadId: '20260406_220100_000',
        uploadedAt: '2026-04-06T13:01:00.000Z',
        size: 256,
        downloadPath: '/api/files/Report.ZIP/20260406_220100_000',
      },
    ],
  },
];

describe('file group filters', () => {
  test('filters groups by case-insensitive file name', () => {
    expect(filterFileGroups(sampleGroups, 'report')).toEqual([sampleGroups[1]]);
  });

  test('filters groups by upload identifier', () => {
    expect(filterFileGroups(sampleGroups, '20260406_222714_528')).toEqual([
      {
        ...sampleGroups[1]!,
        latestUploadedAt: '2026-04-06T13:27:14.528Z',
        versionCount: 1,
        totalSize: 200,
        versions: [sampleGroups[1]!.versions[0]!],
      },
    ]);
  });

  test('filters groups by formatted upload timestamp', () => {
    expect(filterFileGroups(sampleGroups, '2026/04/06 22:27:14')).toEqual([
      {
        ...sampleGroups[1]!,
        latestUploadedAt: '2026-04-06T13:27:14.528Z',
        versionCount: 1,
        totalSize: 200,
        versions: [sampleGroups[1]!.versions[0]!],
      },
    ]);
  });

  test('recomputes the visible latest upload when only an older version matches', () => {
    expect(filterFileGroups(sampleGroups, '20260406_220100_000')).toEqual([
      {
        ...sampleGroups[1]!,
        latestUploadedAt: '2026-04-06T13:01:00.000Z',
        versionCount: 1,
        totalSize: 256,
        versions: [sampleGroups[1]!.versions[1]!],
      },
    ]);
  });

  test('keeps all versions visible when the file name itself matches', () => {
    const filteredGroups = filterFileGroups(sampleGroups, 'report.zip');

    expect(filteredGroups).toEqual([sampleGroups[1]]);
    expect(filteredGroups[0]?.versions).toHaveLength(2);
  });

  test('treats comma, semicolon, and space-separated terms as AND conditions', () => {
    expect(
      filterFileGroups(sampleGroups, 'report, 20260406_220100_000;22:01:00')
    ).toEqual([
      {
        ...sampleGroups[1]!,
        latestUploadedAt: '2026-04-06T13:01:00.000Z',
        versionCount: 1,
        totalSize: 256,
        versions: [sampleGroups[1]!.versions[1]!],
      },
    ]);
  });

  test('returns original groups when filter text is blank', () => {
    expect(filterFileGroups(sampleGroups, '   ')).toBe(sampleGroups);
  });

  test('treats separator-only filter text as blank', () => {
    expect(filterFileGroups(sampleGroups, ', ;   ;')).toBe(sampleGroups);
    expect(hasFileGroupFilterTerms(', ;   ;')).toBe(false);
  });

  test('sorts groups by file name with numeric-aware ordering', () => {
    expect(
      sortFileGroups([
        {
          groupId: 'manual-10',
          fileName: 'manual(10).zip',
          latestUploadedAt: '2026-04-06T12:00:00.000Z',
          versionCount: 1,
          totalSize: 100,
          versions: [],
        },
        sampleGroups[1],
        {
          groupId: 'manual-2',
          fileName: 'manual(2).zip',
          latestUploadedAt: '2026-04-06T12:00:00.000Z',
          versionCount: 1,
          totalSize: 100,
          versions: [],
        },
        sampleGroups[0],
      ]).map((group) => group.fileName)
    ).toEqual(['alpha.txt', 'manual(2).zip', 'manual(10).zip', 'Report.ZIP']);
  });

  test('requests auto-loading only while an active filter has few visible items', () => {
    expect(
      shouldAutoLoadMore({
        filterText: 'report',
        filteredGroupCount: 2,
        pageSize: 20,
        loading: false,
        loadingMore: false,
        hasMore: true,
      })
    ).toBe(true);

    expect(
      shouldAutoLoadMore({
        filterText: 'report',
        filteredGroupCount: 12,
        pageSize: 20,
        loading: false,
        loadingMore: false,
        hasMore: true,
      })
    ).toBe(false);
  });
});
