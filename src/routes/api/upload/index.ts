// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolveRequestBaseUrl } from '../shared/requestUrl';
import { FileService } from '../../../services/fileService';
import { TemporaryFileCleanupService } from '../../../services/temporaryFileCleanupService';
import { UploadResponse } from '../../../types';
import { parsePublicFileNameFromRoutePath } from '../../../utils/fileRoutePath';
import { createUrlResolver } from '../../../utils/urlResolver';

/**
 * Configuration for the upload route.
 */
export interface UploadRoutesConfig {
  /**
   * Backing file service.
   */
  fileService: FileService;
  /**
   * URL resolver for proxy-aware request handling.
   */
  urlResolver: ReturnType<typeof createUrlResolver>;
  /**
   * Background cleanup worker for expiring uploads.
   */
  temporaryFileCleanupService: TemporaryFileCleanupService;
}

const sendMissingFilePath = (reply: FastifyReply): FastifyReply =>
  reply.status(400).send({
    error: 'Missing file path in request URL',
  });

/**
 * Registers the upload route.
 * @param fastify Fastify server instance.
 * @param config Route configuration.
 */
export const registerUploadRoutes = async (
  fastify: FastifyInstance,
  config: UploadRoutesConfig
): Promise<void> => {
  const storeUpload = async (
    request: FastifyRequest,
    reply: FastifyReply,
    fileName: string
  ): Promise<UploadResponse | FastifyReply> => {
    const payload = request.body as Buffer | undefined;
    if (!payload || payload.length === 0) {
      return reply.status(400).send({
        error: 'No file payload received',
      });
    }

    try {
      const file = await config.fileService.saveFile({
        fileName,
        content: payload,
        baseUrl: resolveRequestBaseUrl(request, config.urlResolver),
      });

      try {
        await config.temporaryFileCleanupService.notifyFileStored();
      } catch (error) {
        request.log.warn(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to reschedule upload cleanup'
        );
      }

      reply.header('Location', file.downloadUrl ?? file.downloadPath);
      return reply.status(201).send({
        message: 'File uploaded successfully',
        file,
      } satisfies UploadResponse);
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : 'Upload failed',
      });
    }
  };

  const registerUploadRoute = (
    method: 'post' | 'put',
    routePath: '/api/upload' | '/api/upload/*'
  ) => {
    fastify[method](
      routePath,
      async (
        request: FastifyRequest<{
          Params: {
            '*': string | undefined;
          };
        }>,
        reply: FastifyReply
      ): Promise<UploadResponse | FastifyReply> => {
        const fileName = parsePublicFileNameFromRoutePath(
          request.params['*'] ?? ''
        );
        if (!fileName) {
          return sendMissingFilePath(reply);
        }

        return storeUpload(request, reply, fileName);
      }
    );
  };

  fastify.post(
    '/api/upload',
    async (
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<UploadResponse | FastifyReply> => {
      return sendMissingFilePath(reply);
    }
  );
  fastify.put(
    '/api/upload',
    async (_request, reply): Promise<FastifyReply> => sendMissingFilePath(reply)
  );

  registerUploadRoute('post', '/api/upload/*');
  registerUploadRoute('put', '/api/upload/*');
};
