// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { createReadStream } from 'fs';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FileService } from '../../../services/fileService';
import { parsePublicFileNameFromRoutePath } from '../../../utils/fileRoutePath';

/**
 * Configuration for the file download route.
 */
export interface FileDownloadRoutesConfig {
  /**
   * Backing file service.
   */
  fileService: FileService;
}

const sanitizeDownloadFileName = (fileName: string): string =>
  fileName.replaceAll('"', "'");

const createContentDisposition = (fileName: string): string => {
  const fallback = sanitizeDownloadFileName(fileName);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

/**
 * Registers the file download route.
 * @param fastify Fastify server instance.
 * @param config Route configuration.
 */
export const registerFileDownloadRoutes = async (
  fastify: FastifyInstance,
  config: FileDownloadRoutesConfig
): Promise<void> => {
  const resolveTargetFromRoutePath = async (
    routePath: string
  ): Promise<Awaited<ReturnType<FileService['resolveFile']>>> => {
    const exactGroupId = parsePublicFileNameFromRoutePath(routePath);
    if (exactGroupId) {
      const exactTarget = await config.fileService.resolveFile({
        groupId: exactGroupId,
        uploadId: undefined,
      });
      if (exactTarget) {
        return exactTarget;
      }
    }

    const pathSegments = routePath
      .split('/')
      .filter((segment) => segment.length > 0);
    if (pathSegments.length < 2) {
      return undefined;
    }

    const suffix = pathSegments[pathSegments.length - 1];
    const groupId = parsePublicFileNameFromRoutePath(
      pathSegments.slice(0, -1).join('/')
    );
    if (!groupId || !suffix) {
      return undefined;
    }

    return config.fileService.resolveFile({
      groupId,
      uploadId: suffix === 'latest' ? undefined : suffix,
    });
  };

  fastify.get(
    '/api/files/*',
    async (
      request: FastifyRequest<{
        Params: {
          '*': string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const target = await resolveTargetFromRoutePath(request.params['*']);

      if (!target) {
        return reply.status(404).send({
          error: 'File revision not found',
        });
      }

      reply.header('Content-Type', 'application/octet-stream');
      reply.header(
        'Content-Disposition',
        createContentDisposition(target.fileName)
      );
      reply.header('Content-Length', String(target.size));
      reply.header('Last-Modified', new Date(target.uploadedAt).toUTCString());

      return reply.send(createReadStream(target.filePath));
    }
  );
};
