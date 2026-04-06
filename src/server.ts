// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import path from 'path';
import Fastify, { FastifyInstance } from 'fastify';
import * as packageMetadata from './generated/packageMetadata';
import { registerConfigRoutes } from './routes/api/config';
import { registerFileDownloadRoutes } from './routes/api/files/download';
import { registerFileListRoutes } from './routes/api/files/list';
import { registerUiRoutes } from './routes/api/ui';
import { registerUploadDirectoryRoutes } from './routes/api/upload/directories';
import { registerUploadRoutes } from './routes/api/upload';
import { registerHealthRoutes } from './routes/health';
import { registerStaticRoutes } from './routes/static';
import { createAppConfigService } from './services/appConfigService';
import { createFileService } from './services/fileService';
import { createTemporaryFileCleanupService } from './services/temporaryFileCleanupService';
import { Logger, LogLevel, ResolvedServerConfig, ServerConfig } from './types';
import { createUrlResolver } from './utils/urlResolver';

/**
 * Started server handle.
 */
export interface FastifyServerInstance {
  /**
   * Stops the server and releases resources.
   */
  close: () => Promise<void>;
}

const createPinoLoggerConfig = (logger: Logger, logLevel: LogLevel) => {
  const pinoLogLevel = (() => {
    switch (logLevel) {
      case 'debug':
        return 'debug';
      case 'info':
        return 'info';
      case 'warn':
        return 'warn';
      case 'error':
        return 'error';
      case 'ignore':
        return 'silent';
      default:
        return 'info';
    }
  })();

  return {
    level: pinoLogLevel,
    hooks: {
      logMethod(inputArgs: unknown[], _method: unknown, level: number) {
        const [msgOrObj] = inputArgs;
        const message =
          typeof msgOrObj === 'string'
            ? msgOrObj
            : msgOrObj && typeof msgOrObj === 'object'
              ? JSON.stringify(msgOrObj)
              : String(msgOrObj);

        if (level === 10 || level === 20) {
          logger.debug(message);
        } else if (level === 30) {
          logger.info(message);
        } else if (level === 40) {
          logger.warn(message);
        } else if (level >= 50) {
          logger.error(message);
        }
      },
    },
  };
};

const normalizeConfig = (config: ServerConfig): ResolvedServerConfig => ({
  port: config.port ?? 5968,
  baseUrl: config.baseUrl?.replace(/\/$/, ''),
  trustedProxies: config.trustedProxies,
  storageDir: path.resolve(config.storageDir ?? './storage'),
  configDir: path.resolve(config.configDir ?? '.'),
  realm:
    config.realm ??
    `${packageMetadata.name || 'uplodah'} ${packageMetadata.version || 'dev'}`,
  logLevel: config.logLevel ?? 'info',
  maxUploadSizeMb: config.maxUploadSizeMb ?? 100,
  storage: config.storage,
});

const createRewriteUrl = (
  urlResolver: ReturnType<typeof createUrlResolver>,
  logger: Logger
) => {
  return (request: {
    url?: string;
    socket?: {
      remoteAddress?: string;
    };
    headers: {
      [key: string]: string | string[] | undefined;
    };
  }) => {
    if (!request.url) {
      return '/';
    }

    const pathPrefix = urlResolver.extractPathPrefix({
      protocol: 'http',
      socket: {
        remoteAddress: request.socket?.remoteAddress,
      },
      headers: request.headers,
    });

    if (pathPrefix && request.url.startsWith(pathPrefix)) {
      const rewrittenUrl = request.url.slice(pathPrefix.length) || '/';
      logger.debug(`rewriteUrl: ${request.url} -> ${rewrittenUrl}`);
      return rewrittenUrl;
    }

    return request.url;
  };
};

/**
 * Creates a configured Fastify instance without starting the listener.
 * @param config Public server configuration.
 * @param logger Logger instance.
 * @returns Configured Fastify instance.
 */
export const createFastifyInstance = async (
  config: ServerConfig,
  logger: Logger
): Promise<FastifyInstance> => {
  const resolvedConfig = normalizeConfig(config);
  const urlResolver = createUrlResolver(logger, {
    baseUrl: resolvedConfig.baseUrl,
    trustedProxies: resolvedConfig.trustedProxies,
  });

  const fastify = Fastify({
    logger: createPinoLoggerConfig(logger, resolvedConfig.logLevel),
    bodyLimit: 1024 * 1024 * resolvedConfig.maxUploadSizeMb,
    disableRequestLogging: true,
    forceCloseConnections: true,
    rewriteUrl: createRewriteUrl(urlResolver, logger),
  });

  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body);
    }
  );

  const fileService = createFileService({
    storageDir: resolvedConfig.storageDir,
    logger,
    storage: resolvedConfig.storage,
  });
  await fileService.initialize();
  const temporaryFileCleanupService = createTemporaryFileCleanupService({
    fileService,
    logger,
  });
  await temporaryFileCleanupService.start();

  fastify.addHook('onClose', async () => {
    await temporaryFileCleanupService.close();
  });

  const appConfigService = createAppConfigService({
    resolvedConfig,
  });

  await registerHealthRoutes(fastify);
  await registerConfigRoutes(fastify, {
    appConfigService,
  });
  await registerUploadDirectoryRoutes(fastify, {
    appConfigService,
  });
  await registerUiRoutes(fastify, {
    appConfigService,
  });
  await registerFileListRoutes(fastify, {
    fileService,
    urlResolver,
  });
  await registerUploadRoutes(fastify, {
    fileService,
    urlResolver,
    temporaryFileCleanupService,
  });
  await registerFileDownloadRoutes(fastify, {
    fileService,
  });
  await registerStaticRoutes(fastify, {
    logger,
  });

  return fastify;
};

/**
 * Starts the Fastify server.
 * @param config Public server configuration.
 * @param logger Logger instance.
 * @returns Running server handle.
 */
export const startFastifyServer = async (
  config: ServerConfig,
  logger: Logger
): Promise<FastifyServerInstance> => {
  const resolvedConfig = normalizeConfig(config);
  const fastify = await createFastifyInstance(resolvedConfig, logger);

  await fastify.listen({
    port: resolvedConfig.port,
    host: '0.0.0.0',
  });

  logger.info(`Listening on http://localhost:${resolvedConfig.port}`);

  return {
    close: async () => {
      await fastify.close();
    },
  };
};
