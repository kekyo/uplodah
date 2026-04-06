// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyRequest } from 'fastify';
import { createUrlResolver } from '../../../utils/urlResolver';

/**
 * Resolves the externally visible base URL for the current request.
 * @param request Fastify request.
 * @param urlResolver URL resolver instance.
 * @returns Base URL including any externally visible path prefix.
 */
export const resolveRequestBaseUrl = (
  request: FastifyRequest,
  urlResolver: ReturnType<typeof createUrlResolver>
): string => {
  const resolvedUrl = urlResolver.resolveUrl(request);
  if (resolvedUrl.isFixed) {
    return resolvedUrl.baseUrl;
  }

  const pathPrefix = urlResolver.extractPathPrefix(request);
  if (!pathPrefix) {
    return resolvedUrl.baseUrl;
  }

  return new URL(pathPrefix.replace(/^\//, ''), `${resolvedUrl.baseUrl}/`)
    .toString()
    .replace(/\/$/, '');
};
