// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import { shouldRedirectFromLoginPage } from '../src/ui/LoginApp';

describe('login app', () => {
  test('redirects away from the login page when auth is disabled', () => {
    expect(
      shouldRedirectFromLoginPage(
        { authMode: 'none' },
        { authenticated: false }
      )
    ).toBe(true);
  });

  test('redirects away from the login page when the session is authenticated', () => {
    expect(
      shouldRedirectFromLoginPage(
        { authMode: 'publish' },
        { authenticated: true }
      )
    ).toBe(true);
  });

  test('keeps the login page open when auth is enabled and the session is anonymous', () => {
    expect(
      shouldRedirectFromLoginPage(
        { authMode: 'full' },
        { authenticated: false }
      )
    ).toBe(false);
  });
});
