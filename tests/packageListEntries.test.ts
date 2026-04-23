// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TypedMessageProvider } from 'typed-message';
import { describe, expect, test, vi } from 'vitest';
import enMessages from '../src/ui/public/locale/en.json';
import jaMessages from '../src/ui/public/locale/ja.json';
import {
  ArchiveDownloadButton,
  PackageListEntries,
  PackageListHeaderTitle,
  formatUploadedAt,
  resolveFileGroupIconComponent,
} from '../src/ui/PackageList';

const sampleFiles = [
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
    versions: [
      {
        uploadId: '20260407_145659_216',
        uploadedAt: '2026-04-07T14:56:59.000Z',
        size: 42086,
        canDelete: true,
        versionDownloadPath: '/api/files/dockit-0.5.0.zip/20260407_145659_216',
        uploadedBy: 'dockit-bot',
        tags: ['nightly', 'zip'],
      },
      {
        uploadId: '20260407_145157_213',
        uploadedAt: '2026-04-07T14:51:57.000Z',
        size: 42086,
        canDelete: false,
        versionDownloadPath: '/api/files/dockit-0.5.0.zip/20260407_145157_213',
      },
    ],
  },
];

const sampleSections = [
  {
    directoryPath: '/',
    description: 'Shared packages',
    fileGroupCount: sampleFiles.length,
    files: sampleFiles,
  },
];

const siblingSectionFile = {
  ...sampleFiles[0],
  publicPath: 'runs/dockit-0.5.0.zip',
  displayPath: '/runs/dockit-0.5.0.zip',
  directoryPath: '/runs',
  browseDirectoryPath: '/runs',
  browseRelativePath: 'dockit-0.5.0.zip',
  latestDownloadPath: '/api/files/runs/dockit-0.5.0.zip',
};

const sampleSectionsWithSiblingDirectory = [
  ...sampleSections,
  {
    directoryPath: '/runs',
    description: 'Workflow artifacts',
    fileGroupCount: 1,
    files: [siblingSectionFile],
  },
];

const renderEntries = ({
  expandedDirectoryPanels,
  expandedPanels,
  sections = sampleSections,
  versionsByPublicPath = {
    'dockit-0.5.0.zip': sampleFiles[0].versions,
  },
  canDeleteFileGroupVersion,
}: {
  expandedDirectoryPanels: ReadonlySet<string>;
  expandedPanels: ReadonlySet<string>;
  sections?: readonly {
    directoryPath: string;
    description?: string;
    fileGroupCount: number;
    files: readonly (typeof sampleFiles)[number][];
  }[];
  versionsByPublicPath?: Readonly<
    Record<string, (typeof sampleFiles)[number]['versions'] | undefined>
  >;
  canDeleteFileGroupVersion?: (
    file: {
      browseDirectoryPath: string;
    },
    version: (typeof sampleFiles)[number]['versions'][number]
  ) => boolean;
}) =>
  renderToStaticMarkup(
    createElement(
      TypedMessageProvider,
      {
        messages: enMessages,
      },
      createElement(PackageListEntries, {
        sections,
        loadedDirectoryPanels: new Set(
          sections.map((section) => section.directoryPath)
        ),
        directoryLoadingPanels: new Set(),
        directoryErrorsByPath: {},
        expandedDirectoryPanels,
        expandedPanels,
        versionsByPublicPath,
        versionErrorsByPublicPath: {},
        versionLoadingPanels: new Set(),
        selectedVersionKeys: new Set(),
        canDeleteFileGroupVersion: canDeleteFileGroupVersion ?? (() => false),
        onToggleVersionSelection: vi.fn(),
        onToggleFileGroupVersions: vi.fn(),
        onToggleDirectoryVersions: vi.fn(),
        onDeleteVersionRequest: vi.fn(),
        onDirectoryAccordionChange: vi.fn(),
        onAccordionChange: vi.fn(),
      })
    )
  );

const renderHeaderTitle = (visibleDirectoryCount: number) =>
  renderToStaticMarkup(
    createElement(
      TypedMessageProvider,
      {
        messages: enMessages,
      },
      createElement(PackageListHeaderTitle, {
        visibleDirectoryCount,
      })
    )
  );

const renderFileGroupIcon = (fileName: string) =>
  renderToStaticMarkup(createElement(resolveFileGroupIconComponent(fileName)));

const renderArchiveDownloadButton = ({
  inProgress,
  disabled,
}: {
  inProgress: boolean;
  disabled: boolean;
}) =>
  renderToStaticMarkup(
    createElement(
      TypedMessageProvider,
      {
        messages: enMessages,
      },
      createElement(ArchiveDownloadButton, {
        selectedCount: 2,
        disabled,
        inProgress,
        sizeExceeded: false,
        onClick: vi.fn(),
      })
    )
  );

describe('package list entries', () => {
  test('uses the virtual-directory empty-state message for browse mode', () => {
    expect(enMessages.NO_FILES_FOUND).toBe(
      'No virtual directories found in storage.'
    );
    expect(jaMessages.NO_FILES_FOUND).toBe(
      'ストレージに仮想ディレクトリがありません。'
    );
  });

  test('formats uploaded timestamps as local time plus UTC', () => {
    expect(formatUploadedAt('2026-04-09T07:02:16.000Z', 540)).toBe(
      '2026/04/09 16:02:16 +09 (2026/04/09 07:02:16 UTC)'
    );
    expect(formatUploadedAt('not-a-date', 540)).toBe('not-a-date');
  });

  test('selects representative icons by file extension and falls back to the default file icon', () => {
    expect(renderFileGroupIcon('report.pdf')).toContain(
      'data-testid="PictureAsPdfIcon"'
    );
    expect(renderFileGroupIcon('photo.png')).toContain(
      'data-testid="ImageIcon"'
    );
    expect(renderFileGroupIcon('movie.mp4')).toContain(
      'data-testid="MovieIcon"'
    );
    expect(renderFileGroupIcon('song.mp3')).toContain(
      'data-testid="AudioFileIcon"'
    );
    expect(renderFileGroupIcon('archive.zip')).toContain(
      'data-testid="ArchiveIcon"'
    );
    expect(renderFileGroupIcon('table.csv')).toContain(
      'data-testid="TableChartIcon"'
    );
    expect(renderFileGroupIcon('app.tsx')).toContain(
      'data-testid="JavascriptIcon"'
    );
    expect(renderFileGroupIcon('README')).toContain(
      'data-testid="InsertDriveFileIcon"'
    );
  });

  test('shows progress feedback in the archive download button while downloading', () => {
    const html = renderArchiveDownloadButton({
      inProgress: true,
      disabled: true,
    });

    expect(html).toContain('Download selected (2)');
    expect(html).toContain('disabled=""');
    expect(html).toContain('MuiCircularProgress-root');
    expect(html).not.toContain('data-testid="DownloadIcon"');
  });

  test('renders collapsed file group summary rows', () => {
    const html = renderEntries({
      expandedDirectoryPanels: new Set(['/']),
      expandedPanels: new Set(),
    });

    expect(html).toContain('Root (/)');
    expect(html).toContain('1 file groups');
    expect(html).toContain('Shared packages');
    expect(html).toContain('dockit-0.5.0.zip');
    expect(html).toContain('Latest upload:');
    expect(html).toContain('(2026/04/07 14:56:59 UTC)');
    expect(html).toContain('data-testid="ArchiveIcon"');
    expect(html).toContain('aria-expanded="false"');
  });

  test('renders directory accordions in a collapsed state', () => {
    const html = renderEntries({
      expandedDirectoryPanels: new Set(),
      expandedPanels: new Set(),
    });

    expect(html).toContain('Root (/)');
    expect(html).toContain('1 file groups');
    expect(html).toContain('Shared packages');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-testid="FolderCopyIcon"');
  });

  test('renders empty directory accordions with a zero-count chip', () => {
    const html = renderEntries({
      expandedDirectoryPanels: new Set(['/empty']),
      expandedPanels: new Set(),
      sections: [
        {
          directoryPath: '/empty',
          description: 'Unused',
          fileGroupCount: 0,
          files: [],
        },
      ],
      versionsByPublicPath: {},
    });

    expect(html).toContain('/empty');
    expect(html).toContain('Unused');
    expect(html).toContain('0 file groups');
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('dockit-0.5.0.zip');
  });

  test('renders nested file groups relative to the section directory', () => {
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
      versions: [
        {
          uploadId: '20260410_080527_291',
          uploadedAt: '2026-04-10T08:05:27.000Z',
          size: 12058624,
          canDelete: false,
          versionDownloadPath:
            '/api/files/runs/24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip/20260410_080527_291',
        },
      ],
    };
    const html = renderEntries({
      expandedDirectoryPanels: new Set(['/runs']),
      expandedPanels: new Set(),
      sections: [
        {
          directoryPath: '/runs',
          description: 'Workflow artifacts',
          fileGroupCount: 1,
          files: [nestedFile],
        },
      ],
      versionsByPublicPath: {
        [nestedFile.publicPath]: nestedFile.versions,
      },
    });

    expect(html).toContain('/runs');
    expect(html).toContain('Workflow artifacts');
    expect(html).toContain(
      '24224477918/attempt-2/polyfit-manuals/RJK.PolyFit.Manuals.zip'
    );
  });

  test('keeps a stable vertical gap between directory accordions when one expands', () => {
    const html = renderEntries({
      expandedDirectoryPanels: new Set(['/']),
      expandedPanels: new Set(),
      sections: sampleSectionsWithSiblingDirectory,
      versionsByPublicPath: {
        'dockit-0.5.0.zip': sampleFiles[0].versions,
        [siblingSectionFile.publicPath]: siblingSectionFile.versions,
      },
    });

    expect(html).toContain('Root (/)');
    expect(html).toContain('/runs');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('gap:20px');
  });

  test('renders expanded group summary and versions', () => {
    const html = renderEntries({
      expandedDirectoryPanels: new Set(['/']),
      expandedPanels: new Set(['dockit-0.5.0.zip']),
      canDeleteFileGroupVersion: (_file, version) => version.canDelete,
    });

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Versions (2)');
    expect(html).toContain('(2026/04/07 14:51:57 UTC)');
    expect(html).toContain('Upload ID: 20260407_145157_213, Size: 41.1 KB');
    expect(html).toContain(', User: dockit-bot');
    expect(html).toContain('Tags:');
    expect(html).toContain('nightly');
    expect(html).toContain('zip');
    expect(html.match(/User:/g)?.length).toBe(1);
    expect(html.match(/Tags:/g)?.length).toBe(1);
    expect(html).toContain('Download');
    expect(html).toContain('...');
    expect(html.match(/aria-label="Actions"/g)?.length).toBe(1);
  });

  test('hides version action buttons when delete permission is unavailable', () => {
    const html = renderEntries({
      expandedDirectoryPanels: new Set(['/']),
      expandedPanels: new Set(['dockit-0.5.0.zip']),
      canDeleteFileGroupVersion: () => false,
    });

    expect(html).toContain('Download');
    expect(html).not.toContain('aria-label="Actions"');
  });

  test('renders the directory header with a home icon', () => {
    const html = renderHeaderTitle(3);

    expect(html).toContain('Directories');
    expect(html).toContain('data-testid="HomeIcon"');
    expect(html).toContain('Directories (3)');
  });
});
