// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { expect, it } from 'vitest';
import { resolveLoginRedirect } from '../src/ui/utils/loginRedirect.ts';

it('keeps login navigation on the upload origin and preserves local paths, queries and fragments', () => {
  const page = 'https://upload.example.test/prefix/login';
  const origin = new URL(page).origin;
  for (const value of [
    null,
    '',
    'relative',
    'https://elsewhere.example.test',
    '//elsewhere.example.test',
    '/\\elsewhere.example.test',
  ]) {
    expect(resolveLoginRedirect(page, value)).toBe(origin + '/');
  }
  expect(resolveLoginRedirect(page, '/prefix/files?a=1#details')).toBe(
    origin + '/prefix/files?a=1#details'
  );
  const normalized = resolveLoginRedirect(page, '/a/..//detail');
  expect(new URL(normalized).origin).toBe(origin);
});
