// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import fastifyStatic from '@fastify/static';
import { access } from 'fs/promises';
import { FastifyInstance } from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '../../types';
import { resolveEnvironmentPath } from '../../utils/runtimePath';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration for static UI routes.
 */
export interface StaticRoutesConfig {
  /**
   * Logger used for missing UI diagnostics.
   */
  logger: Logger;
}

const resolveUiRoot = async (): Promise<string | undefined> => {
  const candidates = [
    resolveEnvironmentPath(__dirname, ['../../ui'], ['ui']),
    path.resolve(process.cwd(), 'dist/ui'),
    path.resolve(process.cwd(), 'src/ui'),
  ];

  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, 'index.html'));
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
};

/**
 * Registers static UI delivery routes.
 * @param fastify Fastify server instance.
 * @param config Route configuration.
 */
export const registerStaticRoutes = async (
  fastify: FastifyInstance,
  config: StaticRoutesConfig
): Promise<void> => {
  const uiRoot = await resolveUiRoot();
  if (!uiRoot) {
    config.logger.warn(
      'UI build not found. API routes are available, but root UI is disabled.'
    );
    return;
  }

  await fastify.register(fastifyStatic, {
    root: uiRoot,
    prefix: '/',
  });

  fastify.get('/', async (_request, reply) => reply.sendFile('index.html'));
};
