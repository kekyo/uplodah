// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import path from 'path';
import { describe, expect, test } from 'vitest';
import { resolveEnvironmentPath } from '../../src/utils/runtimePath';

describe('runtime path resolution', () => {
  test('resolves source-relative paths while running from src', () => {
    const currentDir = path.join(
      '/workspace',
      'uplodah',
      'src',
      'routes',
      'static'
    );

    expect(resolveEnvironmentPath(currentDir, ['../../ui'], ['ui'])).toBe(
      path.join('/workspace', 'uplodah', 'src', 'ui')
    );
  });

  test('resolves package-internal paths while running from dist', () => {
    const currentDir = path.join('/tmp', 'npm-cache', 'uplodah', 'dist');

    expect(resolveEnvironmentPath(currentDir, ['../../ui'], ['ui'])).toBe(
      path.join('/tmp', 'npm-cache', 'uplodah', 'dist', 'ui')
    );
  });
});
