// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance } from 'fastify';
import * as packageMetadata from '../../generated/packageMetadata';

/**
 * Registers the health endpoint.
 * @param fastify Fastify server instance.
 */
export const registerHealthRoutes = async (
  fastify: FastifyInstance
): Promise<void> => {
  fastify.get('/health', async () => ({
    status: 'ok',
    version: packageMetadata.version,
  }));
};
