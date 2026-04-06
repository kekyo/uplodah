// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance } from 'fastify';
import { AppConfigService } from '../../../services/appConfigService';
import { AppConfigResponse } from '../../../types';

/**
 * Configuration for public config routes.
 */
export interface ConfigRoutesConfig {
  /**
   * Public app config service.
   */
  appConfigService: AppConfigService;
}

/**
 * Registers the public app config route.
 * @param fastify Fastify server instance.
 * @param config Route configuration.
 */
export const registerConfigRoutes = async (
  fastify: FastifyInstance,
  config: ConfigRoutesConfig
): Promise<void> => {
  fastify.get(
    '/api/config',
    async (): Promise<AppConfigResponse> => config.appConfigService.getConfig()
  );
};
