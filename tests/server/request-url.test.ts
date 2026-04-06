// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import { createConsoleLogger } from '../../src/logger';
import { resolveRequestBaseUrl } from '../../src/routes/api/shared/requestUrl';
import { createUrlResolver } from '../../src/utils/urlResolver';
import { testGlobalLogLevel } from '../helpers/test-helper';

describe('request url resolution', () => {
  test('includes forwarded path prefixes in the resolved request base URL', () => {
    const logger = createConsoleLogger('request-url-test', testGlobalLogLevel);
    const urlResolver = createUrlResolver(logger, {
      trustedProxies: ['127.0.0.1'],
    });

    const baseUrl = resolveRequestBaseUrl(
      {
        protocol: 'http',
        ip: '127.0.0.1',
        socket: {
          remoteAddress: '127.0.0.1',
        },
        headers: {
          host: 'localhost:5968',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'files.example.com',
          'x-forwarded-path': '/proxy',
        },
      } as any,
      urlResolver
    );

    expect(baseUrl).toBe('https://files.example.com/proxy');
  });

  test('returns the fixed base URL as-is when configured', () => {
    const logger = createConsoleLogger('request-url-test', testGlobalLogLevel);
    const urlResolver = createUrlResolver(logger, {
      baseUrl: 'https://files.example.com/uplodah',
    });

    const baseUrl = resolveRequestBaseUrl(
      {
        protocol: 'http',
        socket: {},
        headers: {
          host: 'localhost:5968',
          'x-forwarded-path': '/ignored',
        },
      } as any,
      urlResolver
    );

    expect(baseUrl).toBe('https://files.example.com/uplodah');
  });
});
