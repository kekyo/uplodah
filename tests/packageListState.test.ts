// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import {
  buildDirectorySections,
  buildBrowseDirectorySections,
  calculateSelectedArchiveSizeBytes,
  canDeleteFileGroupVersion,
  clearDirectoryPanelState,
  clearFileGroupPanelState,
  collectLoadedFileVersionSelectionItems,
  createFileVersionSelectionKey,
  filterFileVersionsForSearch,
  filterSelectedArchiveItemsForVisibleFiles,
  formatArchiveRequestFileName,
  isArchiveDownloadSizeExceeded,
  parseFileVersionSelectionKey,
  resolveBrowseDirectoryPathForPublicPath,
  resolveDirectorySelectionFiles,
  summarizeFileVersionSelectionScope,
  updateDirectorySummaryFileGroupCount,
} from '../src/ui/PackageList';
import dayjs from 'dayjs';

describe('package list panel state helpers', () => {
  test('builds browse sections from directory summaries even before file groups are loaded', () => {
    const loadedFiles = [
      {
        publicPath: 'dockit-0.5.0.zip',
        displayPath: 'dockit-0.5.0.zip',
        directoryPath: '/',
        browseDirectoryPath: '/',
        browseRelativePath: 'dockit-0.5.0.zip',
        fileName: 'dockit-0.5.0.zip',
        latestUploadId: '20260407_145659_216',
        latestUploadedAt: '2026-04-07T14:56:59.000Z',
        latestDownloadPath: '/api/files/dockit-0.5.0.zip',
      },
    ];

    expect(
      buildBrowseDirectorySections(
        [
          {
            directoryPath: '/',
            description: 'Shared packages',
            accept: ['store', 'delete'],
            fileGroupCount: 1,
          },
          {
            directoryPath: '/runs',
            description: 'Nightly builds',
            accept: ['store', 'delete'],
            fileGroupCount: 2,
          },
          {
            directoryPath: '/empty',
            description: 'Unused',
            accept: ['store', 'delete'],
            fileGroupCount: 0,
          },
        ],
        {
          '/': loadedFiles,
        }
      )
    ).toEqual([
      {
        directoryPath: '/',
        description: 'Shared packages',
        fileGroupCount: 1,
        files: loadedFiles,
      },
      {
        directoryPath: '/runs',
        description: 'Nightly builds',
        fileGroupCount: 2,
        files: [],
      },
      {
        directoryPath: '/empty',
        description: 'Unused',
        fileGroupCount: 0,
        files: [],
      },
    ]);
  });

  test('uses the loaded file-group count after a directory accordion fetch completes', () => {
    const loadedFiles = [
      {
        publicPath: 'runs/a.zip',
        displayPath: '/runs/a.zip',
        directoryPath: '/runs',
        browseDirectoryPath: '/runs',
        browseRelativePath: 'a.zip',
        fileName: 'a.zip',
        latestUploadId: '20260410_080527_291',
        latestUploadedAt: '2026-04-10T08:05:27.000Z',
        latestDownloadPath: '/api/files/runs/a.zip',
      },
    ];

    expect(
      buildBrowseDirectorySections(
        [
          {
            directoryPath: '/runs',
            description: 'Nightly builds',
            accept: ['store', 'delete'],
            fileGroupCount: 2,
          },
        ],
        {
          '/runs': loadedFiles,
        }
      )
    ).toEqual([
      {
        directoryPath: '/runs',
        description: 'Nightly builds',
        fileGroupCount: 1,
        files: loadedFiles,
      },
    ]);
  });

  test('persists the loaded file-group count in directory summaries after closing the accordion', () => {
    expect(
      updateDirectorySummaryFileGroupCount({
        directories: [
          {
            directoryPath: '/runs',
            description: 'Nightly builds',
            accept: ['store', 'delete'],
            fileGroupCount: 2,
          },
          {
            directoryPath: '/empty',
            description: 'Unused',
            accept: ['store', 'delete'],
            fileGroupCount: 0,
          },
        ],
        directoryPath: '/runs',
        fileGroupCount: 1,
      })
    ).toEqual([
      {
        directoryPath: '/runs',
        description: 'Nightly builds',
        accept: ['store', 'delete'],
        fileGroupCount: 1,
      },
      {
        directoryPath: '/empty',
        description: 'Unused',
        accept: ['store', 'delete'],
        fileGroupCount: 0,
      },
    ]);
  });

  test('groups search results under the resolved virtual directory', () => {
    const nestedFile = {
      publicPath:
        'runs/24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
      displayPath:
        '/runs/24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
      directoryPath: '/runs/24224477918/attempt-2/polyfit-manuals',
      browseDirectoryPath: '/runs',
      browseRelativePath:
        '24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
      fileName: 'RJK.PolyFit.Manuals.zip',
      latestUploadId: '20260410_080527_291',
      latestUploadedAt: '2026-04-10T08:05:27.000Z',
      latestDownloadPath:
        '/api/files/runs/24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip',
    };

    expect(
      buildDirectorySections(
        [nestedFile],
        ['/', '/runs'],
        new Map([
          ['/', 0],
          ['/runs', 1],
        ]),
        new Map([
          ['/', undefined],
          ['/runs', 'Workflow artifacts'],
        ])
      )
    ).toEqual([
      {
        directoryPath: '/runs',
        description: 'Workflow artifacts',
        fileGroupCount: 1,
        files: [nestedFile],
      },
    ]);
  });

  test('uses visible search result counts when explicit directory counts are omitted', () => {
    const visibleFile = {
      publicPath: 'tmp/icon.ico',
      displayPath: '/tmp/icon.ico',
      directoryPath: '/tmp',
      browseDirectoryPath: '/tmp',
      browseRelativePath: 'icon.ico',
      fileName: 'icon.ico',
      latestUploadId: '20260410_080527_291',
      latestUploadedAt: '2026-04-10T08:05:27.000Z',
      latestDownloadPath: '/api/files/tmp/icon.ico',
    };

    expect(
      buildDirectorySections(
        [visibleFile],
        ['/', '/tmp'],
        undefined,
        new Map([
          ['/', undefined],
          ['/tmp', 'Temporary storage'],
        ])
      )
    ).toEqual([
      {
        directoryPath: '/tmp',
        description: 'Temporary storage',
        fileGroupCount: 1,
        files: [visibleFile],
      },
    ]);
  });

  test('shows delete actions only for versions marked deletable by the API', () => {
    expect(
      canDeleteFileGroupVersion({
        version: {
          canDelete: true,
        },
      })
    ).toBe(true);
    expect(
      canDeleteFileGroupVersion({
        version: {
          canDelete: false,
        },
      })
    ).toBe(false);
  });

  test('builds stable file-version selection keys', () => {
    const key = createFileVersionSelectionKey({
      publicPath: 'runs/report.txt',
      uploadId: '20260410_080527_291',
    });

    expect(parseFileVersionSelectionKey(key)).toEqual({
      publicPath: 'runs/report.txt',
      uploadId: '20260410_080527_291',
    });
    expect(parseFileVersionSelectionKey('not-json')).toBeUndefined();
  });

  test('summarizes selected versions for a filtered visible scope only', () => {
    const files = [
      {
        publicPath: 'runs/a.zip',
      },
    ];
    const selectedA = createFileVersionSelectionKey({
      publicPath: 'runs/a.zip',
      uploadId: '20260410_080527_291',
    });
    const selectedFilteredOut = createFileVersionSelectionKey({
      publicPath: 'runs/b.zip',
      uploadId: '20260410_080528_292',
    });

    expect(
      collectLoadedFileVersionSelectionItems({
        files,
        versionsByPublicPath: {
          'runs/a.zip': [
            {
              uploadId: '20260410_080527_291',
            },
            {
              uploadId: '20260410_080529_293',
            },
          ],
          'runs/b.zip': [
            {
              uploadId: '20260410_080528_292',
            },
          ],
        },
      })
    ).toEqual([
      {
        publicPath: 'runs/a.zip',
        uploadId: '20260410_080527_291',
      },
      {
        publicPath: 'runs/a.zip',
        uploadId: '20260410_080529_293',
      },
    ]);

    expect(
      summarizeFileVersionSelectionScope({
        files,
        versionsByPublicPath: {
          'runs/a.zip': [
            {
              uploadId: '20260410_080527_291',
            },
            {
              uploadId: '20260410_080529_293',
            },
          ],
          'runs/b.zip': [
            {
              uploadId: '20260410_080528_292',
            },
          ],
        },
        selectedVersionKeys: new Set([selectedA, selectedFilteredOut]),
      })
    ).toEqual({
      totalCount: 2,
      selectedCount: 1,
      allSelected: false,
      partiallySelected: true,
    });
  });

  test('keeps directory selection visible after loaded file groups are cleared', () => {
    const selectedRoot = createFileVersionSelectionKey({
      publicPath: 'root.png',
      uploadId: '20260410_080527_291',
    });
    const selectedTmp = createFileVersionSelectionKey({
      publicPath: 'tmp/cache.png',
      uploadId: '20260410_080528_292',
    });

    expect(resolveBrowseDirectoryPathForPublicPath('root.png', ['/'])).toBe(
      '/'
    );
    expect(
      resolveBrowseDirectoryPathForPublicPath('tmp/cache.png', ['/', '/tmp'])
    ).toBe('/tmp');
    expect(
      summarizeFileVersionSelectionScope({
        files: [],
        directoryPath: '/',
        directoryPaths: ['/', '/tmp'],
        versionsByPublicPath: {},
        selectedVersionKeys: new Set([selectedRoot, selectedTmp]),
      })
    ).toEqual({
      totalCount: 0,
      selectedCount: 1,
      allSelected: false,
      partiallySelected: true,
    });
  });

  test('filters archive download selections to visible files', () => {
    const selectedItems = [
      {
        publicPath: 'runs/a.zip',
        uploadId: '20260410_080527_291',
      },
      {
        publicPath: 'runs/b.zip',
        uploadId: '20260410_080528_292',
      },
      {
        publicPath: 'runs/b.zip',
        uploadId: '20260410_080529_293',
      },
    ];

    expect(
      filterSelectedArchiveItemsForVisibleFiles({
        selectedItems,
        visibleFiles: [
          {
            publicPath: 'runs/b.zip',
          },
        ],
        versionsByPublicPath: {
          'runs/b.zip': [
            {
              uploadId: '20260410_080528_292',
            },
          ],
        },
      })
    ).toEqual([
      {
        publicPath: 'runs/b.zip',
        uploadId: '20260410_080528_292',
      },
    ]);
  });

  test('filters visible versions by version-level search matches', () => {
    const file = {
      publicPath: 'artifacts/RJK.PolyFit.McrBundle.latest.zip',
      displayPath: '/artifacts/RJK.PolyFit.McrBundle.latest.zip',
      directoryPath: '/artifacts',
      browseDirectoryPath: '/artifacts',
      browseRelativePath: 'RJK.PolyFit.McrBundle.latest.zip',
      fileName: 'RJK.PolyFit.McrBundle.latest.zip',
      latestUploadId: '20260423_013146_810',
    };
    const versions = [
      {
        uploadId: '20260423_013146_810',
        uploadedAt: '2026-04-23T01:31:46.000Z',
        size: 22_800_000,
        versionDownloadPath:
          '/api/files/artifacts/RJK.PolyFit.McrBundle.latest.zip/20260423_013146_810',
        canDelete: false,
        uploadedBy: 'polyfit-gh-temp',
        tags: ['polyfit', '#3013', 'artifact'],
      },
      {
        uploadId: '20260422_121112_555',
        uploadedAt: '2026-04-22T12:11:12.000Z',
        size: 22_800_000,
        versionDownloadPath:
          '/api/files/artifacts/RJK.PolyFit.McrBundle.latest.zip/20260422_121112_555',
        canDelete: false,
        uploadedBy: 'polyfit-gh-temp',
        tags: ['polyfit', '#3012', 'artifact'],
      },
    ];

    expect(
      filterFileVersionsForSearch({
        file,
        versions,
        searchQuery: '#3013',
      })
    ).toEqual([versions[0]]);
    expect(
      filterFileVersionsForSearch({
        file,
        versions,
        searchQuery: 'artifacts',
      })
    ).toEqual(versions);
    expect(
      filterFileVersionsForSearch({
        file,
        versions,
        searchQuery: 'McrBundle #3013',
      })
    ).toEqual([versions[0]]);
  });

  test('calculates selected archive sizes and limit state', () => {
    const selectedItems = [
      {
        publicPath: 'runs/a.zip',
        uploadId: '20260410_080527_291',
      },
      {
        publicPath: 'runs/b.zip',
        uploadId: '20260410_080528_292',
      },
    ];

    const selectedSizeBytes = calculateSelectedArchiveSizeBytes({
      selectedItems,
      versionsByPublicPath: {
        'runs/a.zip': [
          {
            uploadId: '20260410_080527_291',
            size: 700_000,
          },
        ],
        'runs/b.zip': [
          {
            uploadId: '20260410_080528_292',
            size: 500_000,
          },
        ],
      },
    });

    expect(selectedSizeBytes).toBe(1_200_000);
    expect(
      isArchiveDownloadSizeExceeded({
        selectedSizeBytes,
        maxDownloadSizeMb: 1,
      })
    ).toBe(true);
    expect(
      isArchiveDownloadSizeExceeded({
        selectedSizeBytes,
        maxDownloadSizeMb: 2,
      })
    ).toBe(false);
  });

  test('formats batch archive request names in local time form', () => {
    expect(formatArchiveRequestFileName(dayjs('2026-04-20T12:34:56'))).toBe(
      '20260420_123456'
    );
  });

  test('uses loaded directory file groups for unfiltered directory selection only', () => {
    const filteredFile = {
      publicPath: 'runs/filtered.zip',
      displayPath: '/runs/filtered.zip',
      directoryPath: '/runs',
      browseDirectoryPath: '/runs',
      browseRelativePath: 'filtered.zip',
      fileName: 'filtered.zip',
      latestUploadId: '20260410_080527_291',
      latestUploadedAt: '2026-04-10T08:05:27.000Z',
      latestDownloadPath: '/api/files/runs/filtered.zip',
    };
    const loadedFile = {
      ...filteredFile,
      publicPath: 'runs/loaded.zip',
      displayPath: '/runs/loaded.zip',
      browseRelativePath: 'loaded.zip',
      fileName: 'loaded.zip',
      latestDownloadPath: '/api/files/runs/loaded.zip',
    };

    expect(
      resolveDirectorySelectionFiles({
        section: {
          files: [],
        },
        isSearchMode: false,
        loadedFiles: [loadedFile],
      })
    ).toEqual([loadedFile]);
    expect(
      resolveDirectorySelectionFiles({
        section: {
          files: [filteredFile],
        },
        isSearchMode: true,
        loadedFiles: [loadedFile],
      })
    ).toEqual([filteredFile]);
  });

  test('clears cached file-group state when a file-group accordion closes', () => {
    const nextState = clearFileGroupPanelState({
      publicPath: 'dockit-0.5.0.zip',
      versionsByPublicPath: {
        'dockit-0.5.0.zip': [
          {
            uploadId: '20260407_145659_216',
            uploadedAt: '2026-04-07T14:56:59.000Z',
            size: 42086,
            canDelete: false,
            versionDownloadPath:
              '/api/files/dockit-0.5.0.zip/20260407_145659_216',
          },
        ],
        'other.zip': [],
      },
      versionErrorsByPublicPath: {
        'dockit-0.5.0.zip': 'HTTP error! status: 500',
        'other.zip': undefined,
      },
      versionLoadingPanels: new Set(['dockit-0.5.0.zip', 'other.zip']),
    });

    expect(nextState.versionsByPublicPath).toEqual({
      'other.zip': [],
    });
    expect(nextState.versionErrorsByPublicPath).toEqual({
      'other.zip': undefined,
    });
    expect(nextState.versionLoadingPanels).toEqual(new Set(['other.zip']));
  });

  test('preserves selected file-group versions when its accordion closes', () => {
    const nextState = clearFileGroupPanelState({
      publicPath: 'dockit-0.5.0.zip',
      versionsByPublicPath: {
        'dockit-0.5.0.zip': [
          {
            uploadId: '20260407_145659_216',
            uploadedAt: '2026-04-07T14:56:59.000Z',
            size: 42086,
            canDelete: false,
            versionDownloadPath:
              '/api/files/dockit-0.5.0.zip/20260407_145659_216',
          },
        ],
      },
      versionErrorsByPublicPath: {
        'dockit-0.5.0.zip': undefined,
      },
      versionLoadingPanels: new Set(['dockit-0.5.0.zip']),
      preserveVersions: true,
    });

    expect(nextState.versionsByPublicPath).toEqual({
      'dockit-0.5.0.zip': [
        {
          uploadId: '20260407_145659_216',
          uploadedAt: '2026-04-07T14:56:59.000Z',
          size: 42086,
          canDelete: false,
          versionDownloadPath:
            '/api/files/dockit-0.5.0.zip/20260407_145659_216',
        },
      ],
    });
    expect(nextState.versionErrorsByPublicPath).toEqual({
      'dockit-0.5.0.zip': undefined,
    });
    expect(nextState.versionLoadingPanels).toEqual(new Set());
  });

  test('clears directory and nested file-group state when a directory accordion closes', () => {
    const nextState = clearDirectoryPanelState({
      directoryPath: '/',
      publicPaths: ['dockit-0.5.0.zip', 'flashcap-1.2.3.nupkg'],
      browseFileGroupsByDirectory: {
        '/': [
          {
            publicPath: 'dockit-0.5.0.zip',
            displayPath: 'dockit-0.5.0.zip',
            directoryPath: '/',
            browseDirectoryPath: '/',
            browseRelativePath: 'dockit-0.5.0.zip',
            fileName: 'dockit-0.5.0.zip',
            latestUploadId: '20260407_145659_216',
            latestUploadedAt: '2026-04-07T14:56:59.000Z',
            latestDownloadPath: '/api/files/dockit-0.5.0.zip',
          },
        ],
        '/keep': [
          {
            publicPath: 'keep.zip',
            displayPath: 'keep.zip',
            directoryPath: '/keep',
            browseDirectoryPath: '/keep',
            browseRelativePath: 'keep.zip',
            fileName: 'keep.zip',
            latestUploadId: '20260408_101010_001',
            latestUploadedAt: '2026-04-08T10:10:10.000Z',
            latestDownloadPath: '/api/files/keep.zip',
          },
        ],
      },
      directoryErrorsByPath: {
        '/': 'HTTP error! status: 500',
        '/keep': undefined,
      },
      directoryLoadingPanels: new Set(['/', '/keep']),
      expandedPanels: new Set([
        'dockit-0.5.0.zip',
        'flashcap-1.2.3.nupkg',
        'keep.zip',
      ]),
      versionsByPublicPath: {
        'dockit-0.5.0.zip': [],
        'flashcap-1.2.3.nupkg': [],
        'keep.zip': [],
      },
      versionErrorsByPublicPath: {
        'dockit-0.5.0.zip': 'HTTP error! status: 500',
        'flashcap-1.2.3.nupkg': undefined,
        'keep.zip': undefined,
      },
      versionLoadingPanels: new Set([
        'dockit-0.5.0.zip',
        'flashcap-1.2.3.nupkg',
        'keep.zip',
      ]),
    });

    expect(nextState.browseFileGroupsByDirectory).toEqual({
      '/keep': [
        {
          publicPath: 'keep.zip',
          displayPath: 'keep.zip',
          directoryPath: '/keep',
          browseDirectoryPath: '/keep',
          browseRelativePath: 'keep.zip',
          fileName: 'keep.zip',
          latestUploadId: '20260408_101010_001',
          latestUploadedAt: '2026-04-08T10:10:10.000Z',
          latestDownloadPath: '/api/files/keep.zip',
        },
      ],
    });
    expect(nextState.directoryErrorsByPath).toEqual({
      '/keep': undefined,
    });
    expect(nextState.directoryLoadingPanels).toEqual(new Set(['/keep']));
    expect(nextState.expandedPanels).toEqual(new Set(['keep.zip']));
    expect(nextState.versionsByPublicPath).toEqual({
      'keep.zip': [],
    });
    expect(nextState.versionErrorsByPublicPath).toEqual({
      'keep.zip': undefined,
    });
    expect(nextState.versionLoadingPanels).toEqual(new Set(['keep.zip']));
  });

  test('preserves selected directory file groups and versions when the directory closes', () => {
    const selectedKey = createFileVersionSelectionKey({
      publicPath: 'dockit-0.5.0.zip',
      uploadId: '20260407_145659_216',
    });
    const nextState = clearDirectoryPanelState({
      directoryPath: '/',
      publicPaths: ['dockit-0.5.0.zip', 'flashcap-1.2.3.nupkg'],
      browseFileGroupsByDirectory: {
        '/': [
          {
            publicPath: 'dockit-0.5.0.zip',
            displayPath: 'dockit-0.5.0.zip',
            directoryPath: '/',
            browseDirectoryPath: '/',
            browseRelativePath: 'dockit-0.5.0.zip',
            fileName: 'dockit-0.5.0.zip',
            latestUploadId: '20260407_145659_216',
            latestUploadedAt: '2026-04-07T14:56:59.000Z',
            latestDownloadPath: '/api/files/dockit-0.5.0.zip',
          },
        ],
      },
      directoryErrorsByPath: {
        '/': undefined,
      },
      directoryLoadingPanels: new Set(['/']),
      expandedPanels: new Set(['dockit-0.5.0.zip']),
      versionsByPublicPath: {
        'dockit-0.5.0.zip': [
          {
            uploadId: '20260407_145659_216',
            uploadedAt: '2026-04-07T14:56:59.000Z',
            size: 42086,
            canDelete: false,
            versionDownloadPath:
              '/api/files/dockit-0.5.0.zip/20260407_145659_216',
          },
        ],
      },
      versionErrorsByPublicPath: {
        'dockit-0.5.0.zip': undefined,
      },
      versionLoadingPanels: new Set(['dockit-0.5.0.zip']),
      selectedVersionKeys: new Set([selectedKey]),
    });

    expect(nextState.browseFileGroupsByDirectory).toEqual({
      '/': [
        {
          publicPath: 'dockit-0.5.0.zip',
          displayPath: 'dockit-0.5.0.zip',
          directoryPath: '/',
          browseDirectoryPath: '/',
          browseRelativePath: 'dockit-0.5.0.zip',
          fileName: 'dockit-0.5.0.zip',
          latestUploadId: '20260407_145659_216',
          latestUploadedAt: '2026-04-07T14:56:59.000Z',
          latestDownloadPath: '/api/files/dockit-0.5.0.zip',
        },
      ],
    });
    expect(nextState.expandedPanels).toEqual(new Set());
    expect(nextState.versionsByPublicPath).toEqual({
      'dockit-0.5.0.zip': [
        {
          uploadId: '20260407_145659_216',
          uploadedAt: '2026-04-07T14:56:59.000Z',
          size: 42086,
          canDelete: false,
          versionDownloadPath:
            '/api/files/dockit-0.5.0.zip/20260407_145659_216',
        },
      ],
    });
    expect(nextState.versionLoadingPanels).toEqual(new Set());
  });
});
