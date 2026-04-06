// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import { buildUploadRequestPath } from '../../src/ui/utils/uploadFileName';

describe('upload file name', () => {
  test('builds an upload request path for the root directory', () => {
    expect(buildUploadRequestPath('report.txt', '/')).toBe(
      '/api/upload/report.txt'
    );
  });

  test('builds an upload request path for a configured subdirectory', () => {
    expect(buildUploadRequestPath('report.txt', '/tmp')).toBe(
      '/api/upload/tmp/report.txt'
    );
  });

  test('encodes special characters after adding the selected subdirectory', () => {
    expect(buildUploadRequestPath('hello world.txt', '/tmp/foobar')).toBe(
      '/api/upload/tmp/foobar/hello%20world.txt'
    );
  });
});
