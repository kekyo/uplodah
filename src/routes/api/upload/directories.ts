// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance } from 'fastify';
import { AppConfigService } from '../../../services/appConfigService';
import { UploadDirectoriesResponse } from '../../../types';

/**
 * Configuration for upload directory routes.
 */
export interface UploadDirectoryRoutesConfig {
  /**
   * Public app config service.
   */
  appConfigService: AppConfigService;
}

/**
 * Registers writable upload directory routes.
 * @param fastify Fastify server instance.
 * @param config Route configuration.
 */
export const registerUploadDirectoryRoutes = async (
  fastify: FastifyInstance,
  config: UploadDirectoryRoutesConfig
): Promise<void> => {
  fastify.get(
    '/api/upload/directories',
    async (): Promise<UploadDirectoriesResponse> =>
      config.appConfigService.getUploadDirectories()
  );
};
