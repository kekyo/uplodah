// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import CommandExamplesAccordion from '../src/ui/components/CommandExamplesAccordion';

describe('command examples accordion', () => {
  test('renders the command examples inside a collapsed accordion', () => {
    const html = renderToStaticMarkup(
      createElement(CommandExamplesAccordion, {
        title: 'API usage examples',
        commands: [
          {
            label: 'Upload',
            command:
              'curl -X POST "https://files.example.com/api/upload/report.txt" --data-binary @./report.txt',
            copyAriaLabel: 'copy upload command',
          },
          {
            label: 'List',
            command: 'curl "https://files.example.com/api/files"',
            copyAriaLabel: 'copy list command',
          },
          {
            label: 'Download',
            command:
              'curl -L "https://files.example.com/api/files/report.txt" -o ./report.txt',
            copyAriaLabel: 'copy download command',
            preserveWhitespace: true,
          },
        ],
        onCopyCommand: vi.fn(),
      })
    );

    expect(html).toContain('API usage examples');
    expect(html).toContain('curl -X POST');
    expect(html).toContain('/api/files');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="copy upload command"');
    expect(html).toContain('aria-label="copy list command"');
    expect(html).toContain('aria-label="copy download command"');
  });
});
