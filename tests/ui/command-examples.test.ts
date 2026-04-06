// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import {
  buildApiCommandExamples,
  buildDownloadCurlExample,
  buildPutUploadCurlExample,
  buildUploadCurlExample,
  buildVersionDownloadCurlExample,
} from '../../src/ui/utils/commandExamples';
import type { ServerUrlInfo } from '../../src/types';

describe('command examples', () => {
  const serverUrl: ServerUrlInfo = {
    baseUrl: 'https://files.example.com/uplodah',
    port: 5968,
    isHttps: true,
  };

  test('builds post upload curl example', () => {
    expect(buildUploadCurlExample(serverUrl)).toBe(
      'curl -X POST https://files.example.com/uplodah/api/upload/report.txt -H "Content-Type: application/octet-stream" --data-binary @./report.txt'
    );
  });

  test('builds download curl example', () => {
    expect(buildDownloadCurlExample(serverUrl)).toBe(
      'curl -L "https://files.example.com/uplodah/api/files/report.txt" -o ./report.txt'
    );
  });

  test('builds put upload curl example', () => {
    expect(buildPutUploadCurlExample(serverUrl)).toBe(
      'curl -X PUT https://files.example.com/uplodah/api/upload/report.txt -H "Content-Type: application/octet-stream" --data-binary @./report.txt'
    );
  });

  test('builds version-specific download curl example', () => {
    expect(buildVersionDownloadCurlExample(serverUrl)).toBe(
      'curl -L "https://files.example.com/uplodah/api/files/report.txt/20260406_203040_123" -o ./report.txt'
    );
  });

  test('falls back to localhost when baseUrl is not configured', () => {
    expect(
      buildUploadCurlExample({
        port: 6123,
        isHttps: false,
      })
    ).toBe(
      'curl -X POST http://localhost:6123/api/upload/report.txt -H "Content-Type: application/octet-stream" --data-binary @./report.txt'
    );
  });

  test('builds all api command entries in display order', () => {
    expect(buildApiCommandExamples(serverUrl)).toEqual([
      {
        title: 'Upload API (POST)',
        command:
          'curl -X POST https://files.example.com/uplodah/api/upload/report.txt -H "Content-Type: application/octet-stream" --data-binary @./report.txt',
      },
      {
        title: 'Upload API (PUT)',
        command:
          'curl -X PUT https://files.example.com/uplodah/api/upload/report.txt -H "Content-Type: application/octet-stream" --data-binary @./report.txt',
      },
      {
        title: 'Download API (Latest)',
        command:
          'curl -L "https://files.example.com/uplodah/api/files/report.txt" -o ./report.txt',
      },
      {
        title: 'Download API (Version)',
        command:
          'curl -L "https://files.example.com/uplodah/api/files/report.txt/20260406_203040_123" -o ./report.txt',
      },
    ]);
  });
});
