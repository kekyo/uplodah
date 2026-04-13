// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from '../../../types';
import { AuthService } from '../../../services/authService';
import { StorageService } from '../../../services/storageService';
import {
  AuthenticatedFastifyRequest,
  createConditionalHybridAuthMiddleware,
  FastifyAuthConfig,
} from '../../../middleware/fastifyAuth';
import { createUrlResolver } from '../../../utils/urlResolver';

/**
 * Upload routes configuration.
 */
export interface UploadRoutesConfig {
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

const parseUploadTagsHeader = (
  rawHeader: string | string[] | undefined
): string[] | undefined => {
  const rawValue = Array.isArray(rawHeader) ? rawHeader.join(',') : rawHeader;
  if (typeof rawValue !== 'string') {
    return undefined;
  }

  const tags = Array.from(
    new Set(
      rawValue
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    )
  );

  return tags.length > 0 ? tags : undefined;
};

const requirePublishRole = (
  request: AuthenticatedFastifyRequest,
  reply: FastifyReply
) => {
  if (!request.user || !['publish', 'admin'].includes(request.user.role)) {
    return reply.status(403).send({ error: 'Upload permission required' });
  }

  return undefined;
};

/**
 * Register upload API routes.
 * @param fastify Fastify instance.
 * @param config Upload route configuration.
 */
export const registerUploadRoutes = async (
  fastify: FastifyInstance,
  config: UploadRoutesConfig
) => {
  const { storageService, authService, authConfig, logger, urlResolver } =
    config;

  const authHandler = authService.isAuthRequired('publish')
    ? createConditionalHybridAuthMiddleware(authConfig)
    : null;
  const authPreHandler = authHandler
    ? ([
        authHandler,
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

  fastify.route({
    method: ['POST', 'PUT'],
    url: '/*',
    preHandler: authPreHandler,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const rawPath = (request.params as { '*': string })['*'];
      if (!rawPath) {
        return reply.status(400).send({ error: 'Upload path is required' });
      }

      const fileBuffer = request.body as Buffer | undefined;
      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: 'No file data received' });
      }

      try {
        const decodedPath = decodeWildcardPath(rawPath);
        const authRequest = request as AuthenticatedFastifyRequest;
        const storedFile = await storageService.storeFile(
          decodedPath,
          fileBuffer,
          {
            uploadedBy: authRequest.user?.username ?? 'anonymous',
            tags: parseUploadTagsHeader(request.headers['x-uplodah-tags']),
          }
        );
        const baseUrl = urlResolver.resolveUrl(request).baseUrl;
        const latestDownloadUrl = `${baseUrl}${storedFile.latestDownloadPath}`;
        const versionDownloadUrl = `${baseUrl}${storedFile.versionDownloadPath}`;

        reply.code(201).header('Location', versionDownloadUrl).send({
          message: 'File uploaded successfully',
          path: storedFile.publicPath,
          displayPath: storedFile.displayPath,
          directoryPath: storedFile.directoryPath,
          fileName: storedFile.fileName,
          uploadId: storedFile.uploadId,
          uploadedAt: storedFile.uploadedAt,
          size: storedFile.size,
          latestDownloadUrl,
          downloadUrl: versionDownloadUrl,
        });
      } catch (error: any) {
        logger.warn(`Upload rejected for ${request.url}: ${error.message}`);

        if (error instanceof URIError) {
          return reply.status(400).send({ error: 'Upload path is invalid' });
        }

        if (error.message === 'Upload directory is read-only') {
          return reply.status(403).send({ error: error.message });
        }

        return reply.status(400).send({ error: error.message });
      }
    },
  });

  logger.info('Upload API routes registered successfully');
};
