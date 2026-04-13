// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ReaderWriterLock } from 'async-primitives';
import { Logger } from '../../../types';
import { AuthService } from '../../../services/authService';
import {
  AuthenticatedFastifyRequest,
  createConditionalHybridAuthMiddleware,
  FastifyAuthConfig,
  requireRole,
} from '../../../middleware/fastifyAuth';
import {
  StorageService,
  StoredFileGroupInfo,
  StoredFileVersionInfo,
} from '../../../services/storageService';
import { createUrlResolver } from '../../../utils/urlResolver';
import { streamFile } from '../../../utils/fileStreaming';

/**
 * Files routes configuration.
 */
export interface FilesRoutesConfig {
  storageService: StorageService;
  authService: AuthService;
  authConfig: FastifyAuthConfig;
  logger: Logger;
  urlResolver: ReturnType<typeof createUrlResolver>;
}

const decodeWildcardPath = (rawPath: string): string => {
  const segments = rawPath.split('/');
  return segments.map((segment) => decodeURIComponent(segment)).join('/');
};

const withAbsoluteUrls = (
  baseUrl: string,
  group: StoredFileGroupInfo
): StoredFileGroupInfo & {
  latestDownloadUrl: string;
  versions: Array<StoredFileVersionInfo & { versionDownloadUrl: string }>;
} => ({
  ...group,
  latestDownloadUrl: `${baseUrl}${group.latestDownloadPath}`,
  versions: group.versions.map((version) => ({
    ...version,
    versionDownloadUrl: `${baseUrl}${version.versionDownloadPath}`,
  })),
});

const requirePublishRole = (
  request: AuthenticatedFastifyRequest,
  reply: FastifyReply
) => {
  if (!requireRole(request, ['publish'])) {
    return reply.status(403).send({ error: 'Delete permission required' });
  }

  return undefined;
};

/**
 * Register file list and download API routes.
 * @param fastify Fastify instance.
 * @param config Files route configuration.
 * @param locker Reader/writer lock for streaming.
 */
export const registerFilesRoutes = async (
  fastify: FastifyInstance,
  config: FilesRoutesConfig,
  locker: ReaderWriterLock
) => {
  const { storageService, authService, authConfig, logger, urlResolver } =
    config;

  const authHandler = authService.isAuthRequired('general')
    ? createConditionalHybridAuthMiddleware(authConfig)
    : null;
  const authPreHandler = authHandler ? ([authHandler] as any) : [];
  const publishAuthHandler = authService.isAuthRequired('publish')
    ? createConditionalHybridAuthMiddleware(authConfig)
    : null;
  const publishAuthPreHandler = publishAuthHandler
    ? ([
        publishAuthHandler,
        async (request: FastifyRequest, reply: FastifyReply) => {
          const roleCheck = requirePublishRole(
            request as AuthenticatedFastifyRequest,
            reply
          );
          if (roleCheck) {
            return roleCheck;
          }
        },
      ] as any)
    : [];

  fastify.get(
    '/',
    {
      preHandler: authPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as {
        skip?: string;
        take?: string;
      };

      const skip = Math.max(0, Number.parseInt(query.skip || '0', 10) || 0);
      const take = Math.max(1, Number.parseInt(query.take || '20', 10) || 20);
      const baseUrl = urlResolver.resolveUrl(request).baseUrl;
      const files = await storageService.listFiles(skip, take);

      return reply.send({
        totalCount: files.totalCount,
        skip,
        take,
        items: files.items.map((group) => withAbsoluteUrls(baseUrl, group)),
      });
    }
  );

  fastify.get(
    '/*',
    {
      preHandler: authPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rawPath = (request.params as { '*': string })['*'];
      if (!rawPath) {
        return reply.status(404).send({ error: 'File not found' });
      }

      try {
        const decodedPath = decodeWildcardPath(rawPath);
        let latestVersion;
        try {
          latestVersion =
            await storageService.getLatestFileVersion(decodedPath);
        } catch (error) {
          if (error instanceof URIError) {
            throw error;
          }
          latestVersion = undefined;
        }

        const resolvedVersion =
          latestVersion ||
          (await (async () => {
            const segments = decodedPath.split('/');
            if (segments.length < 2) {
              return undefined;
            }

            const uploadId = segments[segments.length - 1];
            const filePath = segments.slice(0, -1).join('/');
            if (!uploadId || filePath.length === 0) {
              return undefined;
            }
            return await storageService.getFileVersion(filePath, uploadId);
          })());

        if (!resolvedVersion) {
          return reply.status(404).send({ error: 'File not found' });
        }

        await streamFile(
          logger,
          locker,
          resolvedVersion.absoluteFilePath,
          reply,
          {
            contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
              resolvedVersion.fileName
            )}`,
          },
          request.abortSignal
        );
      } catch (error) {
        if (error instanceof URIError) {
          return reply.status(400).send({ error: 'File path is invalid' });
        }

        logger.error(`Failed to serve file ${request.url}: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.delete(
    '/*',
    {
      preHandler: publishAuthPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rawPath = (request.params as { '*': string })['*'];
      if (!rawPath) {
        return reply.status(400).send({ error: 'File path is required' });
      }

      try {
        const decodedPath = decodeWildcardPath(rawPath);
        let latestVersion;
        try {
          latestVersion =
            await storageService.getLatestFileVersion(decodedPath);
        } catch (error) {
          if (error instanceof URIError) {
            throw error;
          }
          latestVersion = undefined;
        }

        if (latestVersion) {
          return reply.status(400).send({
            error: 'Deleting the latest file version requires an upload ID',
          });
        }

        const segments = decodedPath.split('/');
        if (segments.length < 2) {
          return reply.status(400).send({
            error: 'Deleting the latest file version requires an upload ID',
          });
        }

        const uploadId = segments[segments.length - 1];
        const filePath = segments.slice(0, -1).join('/');
        if (!uploadId || filePath.length === 0) {
          return reply.status(400).send({
            error: 'Deleting the latest file version requires an upload ID',
          });
        }

        const handle = await locker.writeLock();
        let deleted = false;
        try {
          deleted = await storageService.deleteFileVersion(filePath, uploadId);
        } finally {
          handle.release();
        }
        if (!deleted) {
          return reply.status(404).send({ error: 'File not found' });
        }

        return reply.send({ message: 'File deleted successfully' });
      } catch (error: any) {
        if (error instanceof URIError) {
          return reply.status(400).send({ error: 'File path is invalid' });
        }

        if (error?.message === 'Upload directory is read-only') {
          return reply.status(403).send({ error: error.message });
        }

        if (error instanceof Error) {
          logger.warn(`Delete rejected for ${request.url}: ${error.message}`);
          return reply.status(400).send({ error: error.message });
        }

        logger.error(`Failed to delete file ${request.url}: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  logger.info('Files API routes registered successfully');
};
