// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TypedMessageProvider } from 'typed-message';
import { describe, expect, test, vi } from 'vitest';
import enMessages from '../src/ui/public/locale/en.json';
import { PackageListEntries, formatUploadedAt } from '../src/ui/PackageList';

const sampleFiles = [
  {
    publicPath: 'dockit-0.5.0.zip',
    displayPath: 'dockit-0.5.0.zip',
    directoryPath: '/',
    fileName: 'dockit-0.5.0.zip',
    latestUploadId: '20260407_145659_216',
    latestUploadedAt: '2026-04-07T14:56:59.000Z',
    latestDownloadPath: '/api/files/dockit-0.5.0.zip',
    versions: [
      {
        uploadId: '20260407_145659_216',
        uploadedAt: '2026-04-07T14:56:59.000Z',
        size: 42086,
        versionDownloadPath: '/api/files/dockit-0.5.0.zip/20260407_145659_216',
      },
      {
        uploadId: '20260407_145157_213',
        uploadedAt: '2026-04-07T14:51:57.000Z',
        size: 42086,
        versionDownloadPath: '/api/files/dockit-0.5.0.zip/20260407_145157_213',
      },
    ],
  },
];

const sampleSections = [
  {
    directoryPath: '/',
    fileGroupCount: sampleFiles.length,
    files: sampleFiles,
  },
];

const renderEntries = (expandedPanels: ReadonlySet<string>) =>
  renderToStaticMarkup(
    createElement(
      TypedMessageProvider,
      {
        messages: enMessages,
      },
      createElement(PackageListEntries, {
        sections: sampleSections,
        expandedPanels,
        versionsByPublicPath: {
          'dockit-0.5.0.zip': sampleFiles[0].versions,
        },
        versionErrorsByPublicPath: {},
        versionLoadingPanels: new Set(),
        onAccordionChange: vi.fn(),
      })
    )
  );

describe('package list entries', () => {
  test('formats uploaded timestamps as local time plus UTC', () => {
    expect(formatUploadedAt('2026-04-09T07:02:16.000Z', 540)).toBe(
      '2026/04/09 16:02:16 +09 (2026/04/09 07:02:16 UTC)'
    );
    expect(formatUploadedAt('not-a-date', 540)).toBe('not-a-date');
  });

  test('renders collapsed file group summary rows', () => {
    const html = renderEntries(new Set());

    expect(html).toContain('Root (/)');
    expect(html).toContain('1 file groups');
    expect(html).toContain('dockit-0.5.0.zip');
    expect(html).toContain('Latest upload:');
    expect(html).toContain('(2026/04/07 14:56:59 UTC)');
    expect(html).toContain('aria-expanded="false"');
  });

  test('renders expanded group summary and revisions', () => {
    const html = renderEntries(new Set(['dockit-0.5.0.zip']));

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Group Summary');
    expect(html).toContain('2 uploads');
    expect(html).toContain('Total size: 82.2 KB');
    expect(html).toContain('Revisions (2)');
    expect(html).toContain('(2026/04/07 14:51:57 UTC)');
    expect(html).toContain('Upload ID: 20260407_145157_213');
    expect(html).toContain('Size: 41.1 KB');
    expect(html).toContain('Download');
  });
});
