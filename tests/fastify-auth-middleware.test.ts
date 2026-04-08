// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test, vi } from 'vitest';
import { createHybridAuthMiddleware } from '../src/middleware/fastifyAuth';
import { Logger } from '../src/types';
import { UserService } from '../src/services/userService';
import { SessionService } from '../src/services/sessionService';

describe('fastify auth middleware', () => {
  test('uses the current app name as the default Basic auth realm', async () => {
    const logger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const userService = {
      validateApiPassword: vi.fn(async () => undefined),
    } as unknown as UserService;
    const sessionService = {
      validateSession: vi.fn(async () => undefined),
    } as unknown as SessionService;

    const middleware = createHybridAuthMiddleware({
      userService,
      sessionService,
      logger,
    });
    const reply = {
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    };
    const request = {
      method: 'GET',
      url: '/api/files',
      protocol: 'http',
      headers: {},
      cookies: {},
    };

    await middleware(request as any, reply as any);

    expect(reply.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="uplodah"'
    );
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Authentication required',
      message: 'Please provide valid credentials',
    });
  });
});
