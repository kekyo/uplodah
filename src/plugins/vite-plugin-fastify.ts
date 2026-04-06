// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { FastifyInstance } from 'fastify';
import { Plugin, ViteDevServer } from 'vite';
import { createConsoleLogger } from '../logger';
import { createFastifyInstance } from '../server';
import { LogLevel, ServerConfig } from '../types';
import { name } from '../generated/packageMetadata';

type HTTPMethods =
  | 'DELETE'
  | 'delete'
  | 'GET'
  | 'get'
  | 'HEAD'
  | 'head'
  | 'PATCH'
  | 'patch'
  | 'POST'
  | 'post'
  | 'PUT'
  | 'put'
  | 'OPTIONS'
  | 'options';

const requestToStream = (req: IncomingMessage): Readable => {
  const stream = new Readable({
    read() {},
  });

  req.on('data', (chunk) => {
    stream.push(chunk);
  });

  req.on('end', () => {
    stream.push(null);
  });

  req.on('error', (error) => {
    stream.destroy(error);
  });

  return stream;
};

/**
 * Runs Fastify in-process with the Vite dev server.
 * @param config Server configuration used for the embedded Fastify instance.
 * @returns Vite plugin.
 */
export const fastifyHost = (config: ServerConfig): Plugin => {
  let fastify: FastifyInstance | undefined = undefined;
  let logger = createConsoleLogger(`${name || 'uplodah'} vite`, 'debug');

  const closeFastify = async (): Promise<void> => {
    if (!fastify) {
      return;
    }
    await fastify.close();
    fastify = undefined;
  };

  return {
    name: 'vite-plugin-fastify',
    configureServer: async (server: ViteDevServer) => {
      const logLevel =
        (server.config.logLevel as LogLevel | undefined) ?? 'info';
      logger = createConsoleLogger(`${name || 'uplodah'} vite`, logLevel);
      fastify = await createFastifyInstance(config, logger);

      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const url = req.url || '';
          if (!url.startsWith('/api/') && url !== '/health') {
            next();
            return;
          }

          if (!fastify) {
            res.statusCode = 503;
            res.end('Fastify server not initialized');
            return;
          }

          try {
            const response = await fastify.inject({
              method: (req.method || 'GET') as HTTPMethods,
              url,
              headers: req.headers as Record<string, string>,
              payload: requestToStream(req),
            });

            res.statusCode = response.statusCode;
            for (const [key, value] of Object.entries(response.headers)) {
              if (value !== undefined) {
                res.setHeader(key, String(value));
              }
            }
            res.end(response.rawPayload);
          } catch (error) {
            logger.error(`Failed to proxy request ${url}: ${error}`);
            res.statusCode = 500;
            res.end('Internal Server Error');
          }
        }
      );

      server.watcher.on('change', async (changedPath: string) => {
        if (
          !changedPath.includes('/src/') ||
          changedPath.includes('/src/ui/')
        ) {
          return;
        }

        logger.info(`Server file changed: ${changedPath}`);
        try {
          await closeFastify();
          fastify = await createFastifyInstance(config, logger);
        } catch (error) {
          logger.error(`Failed to reload Fastify instance: ${error}`);
        }
      });
    },
    closeBundle: async () => {
      await closeFastify();
    },
  };
};
