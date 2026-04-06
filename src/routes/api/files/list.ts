// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance, FastifyRequest } from 'fastify';
import { resolveRequestBaseUrl } from '../shared/requestUrl';
import { FileService } from '../../../services/fileService';
import { FileListResponse } from '../../../types';
import { createUrlResolver } from '../../../utils/urlResolver';

interface FileListQuery {
  skip?: string;
  take?: string;
}

/**
 * Configuration for the file list route.
 */
export interface FileListRoutesConfig {
  /**
   * Backing file service.
   */
  fileService: FileService;
  /**
   * URL resolver for proxy-aware request handling.
   */
  urlResolver: ReturnType<typeof createUrlResolver>;
}

const parseQueryInteger = (
  value: string | undefined,
  fallbackValue: number,
  minimumValue: number
): number => {
  if (value === undefined) {
    return fallbackValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallbackValue;
  }

  return Math.max(minimumValue, parsed);
};

/**
 * Registers the file list route.
 * @param fastify Fastify server instance.
 * @param config Route configuration.
 */
export const registerFileListRoutes = async (
  fastify: FastifyInstance,
  config: FileListRoutesConfig
): Promise<void> => {
  fastify.get(
    '/api/files',
    async (
      request: FastifyRequest<{
        Querystring: FileListQuery;
      }>
    ): Promise<FileListResponse> => {
      const skip = parseQueryInteger(request.query.skip, 0, 0);
      const take = parseQueryInteger(request.query.take, 20, 1);
      const baseUrl = resolveRequestBaseUrl(request, config.urlResolver);

      return config.fileService.listFiles(baseUrl, skip, take);
    }
  );
};
