// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance } from 'fastify';
import { AppConfigService } from '../../../services/appConfigService';
import { AppConfigResponse, UploadDirectoriesResponse } from '../../../types';

/**
 * Configuration for UI compatibility routes.
 */
export interface UiRoutesConfig {
  /**
   * Public app config service.
   */
  appConfigService: AppConfigService;
}

/**
 * Registers UI compatibility routes.
 * @param fastify Fastify server instance.
 * @param config Route configuration.
 */
export const registerUiRoutes = async (
  fastify: FastifyInstance,
  config: UiRoutesConfig
): Promise<void> => {
  fastify.post(
    '/api/ui/config',
    async (): Promise<AppConfigResponse> => config.appConfigService.getConfig()
  );
  fastify.post(
    '/api/ui/upload/directories',
    async (): Promise<UploadDirectoriesResponse> =>
      config.appConfigService.getUploadDirectories()
  );
};
