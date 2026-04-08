// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import { shouldShowPackageListInitialLoading } from '../src/ui/PackageList';

describe('package list loading behavior', () => {
  test('shows the full-screen loading state only during initial browse loading', () => {
    expect(shouldShowPackageListInitialLoading(true, false)).toBe(true);
    expect(shouldShowPackageListInitialLoading(false, false)).toBe(false);
  });

  test('keeps the filter UI mounted while search results are loading', () => {
    expect(shouldShowPackageListInitialLoading(true, true)).toBe(false);
    expect(shouldShowPackageListInitialLoading(false, true)).toBe(false);
  });
});
