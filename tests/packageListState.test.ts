// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import {
  buildDirectorySections,
  buildBrowseDirectorySections,
  clearDirectoryPanelState,
  clearFileGroupPanelState,
  updateDirectorySummaryFileGroupCount,
} from '../src/ui/PackageList';

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
            readonly: true,
            fileGroupCount: 1,
          },
          {
            directoryPath: '/runs',
            description: 'Nightly builds',
            readonly: true,
            fileGroupCount: 2,
          },
          {
            directoryPath: '/empty',
            description: 'Unused',
            readonly: true,
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
            readonly: true,
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
            readonly: true,
            fileGroupCount: 2,
          },
          {
            directoryPath: '/empty',
            description: 'Unused',
            readonly: true,
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
        readonly: true,
        fileGroupCount: 1,
      },
      {
        directoryPath: '/empty',
        description: 'Unused',
        readonly: true,
        fileGroupCount: 0,
      },
    ]);
  });

  test('groups search results under the most specific matching virtual directory', () => {
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

  test('clears cached file-group state when a file-group accordion closes', () => {
    const nextState = clearFileGroupPanelState({
      publicPath: 'dockit-0.5.0.zip',
      versionsByPublicPath: {
        'dockit-0.5.0.zip': [
          {
            uploadId: '20260407_145659_216',
            uploadedAt: '2026-04-07T14:56:59.000Z',
            size: 42086,
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
});
