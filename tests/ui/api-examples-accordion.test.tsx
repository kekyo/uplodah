// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import ApiExamplesAccordion from '../../src/ui/components/ApiExamplesAccordion';
import type { ApiCommandExample } from '../../src/ui/utils/commandExamples';

const apiExamples: ApiCommandExample[] = [
  {
    title: 'Upload API (POST)',
    command: 'curl -X POST http://localhost:5968/api/upload/report.txt',
  },
  {
    title: 'Upload API (PUT)',
    command: 'curl -X PUT http://localhost:5968/api/upload/report.txt',
  },
  {
    title: 'Download API (Latest)',
    command: 'curl -L "http://localhost:5968/api/files/report.txt"',
  },
  {
    title: 'Download API (Version)',
    command:
      'curl -L "http://localhost:5968/api/files/report.txt/20260406_203040_123"',
  },
];

describe('api examples accordion', () => {
  test('renders summary and all example entries', () => {
    const markup = renderToStaticMarkup(
      <ApiExamplesAccordion
        apiExamples={apiExamples}
        loading={false}
        onCopy={vi.fn()}
      />
    );

    expect(markup).toContain('API Examples');
    expect(markup).toContain('4 commands available');
    expect(markup).toContain('Upload API (POST)');
    expect(markup).toContain('Upload API (PUT)');
    expect(markup).toContain('Download API (Latest)');
    expect(markup).toContain('Download API (Version)');
    expect(markup).toContain('Copy upload');
    expect(markup).toContain('Copy download');
  });

  test('renders loading text while examples are unavailable', () => {
    const markup = renderToStaticMarkup(
      <ApiExamplesAccordion apiExamples={[]} loading={true} onCopy={vi.fn()} />
    );

    expect(markup).toContain('Loading API examples...');
  });
});
