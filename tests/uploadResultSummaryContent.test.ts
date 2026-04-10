// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TypedMessageProvider } from 'typed-message';
import { describe, expect, test } from 'vitest';
import enMessages from '../src/ui/public/locale/en.json';
import {
  UploadDirectoryTooltipLabel,
  UploadResultSummaryContent,
  buildUploadDirectoryOptions,
} from '../src/ui/components/UploadDrawer';

describe('upload result summary content', () => {
  test('renders file name and upload id on separate lines', () => {
    const html = renderToStaticMarkup(
      createElement(
        TypedMessageProvider,
        {
          messages: enMessages,
        },
        createElement(UploadResultSummaryContent, {
          fileName:
            'CargoNavigator.Core.0.31.0(1).nupkg-super-long-file-name-that-should-wrap-properly',
          uploadId: '20260409_065152_741',
        })
      )
    );

    expect(html).toContain(
      'CargoNavigator.Core.0.31.0(1).nupkg-super-long-file-name-that-should-wrap-properly'
    );
    expect(html).toContain('Upload ID: 20260409_065152_741');
    expect(html).toMatch(
      /CargoNavigator\.Core\.0\.31\.0\(1\)\.nupkg-super-long-file-name-that-should-wrap-properly<\/div>.*<div[^>]*>Upload ID: 20260409_065152_741/s
    );
  });

  test('builds upload directory options from detailed metadata', () => {
    expect(
      buildUploadDirectoryOptions(undefined, [
        {
          directoryPath: '/runs',
          description: 'GitHub Actions artifacts',
        },
      ])
    ).toEqual([
      {
        directoryPath: '/runs',
        description: 'GitHub Actions artifacts',
      },
    ]);
  });

  test('renders the upload directory label with a tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(UploadDirectoryTooltipLabel, {
        directoryPath: '/runs',
        description: 'GitHub Actions artifacts',
      })
    );

    expect(html).toContain('/runs');
    expect(html).toContain('title="GitHub Actions artifacts"');
  });
});
