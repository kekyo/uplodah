// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

/**
 * Builds an encoded route path from a public file name.
 * @param publicFileName Public file name such as `report.txt` or `/tmp/report.txt`.
 * @returns Encoded route path without a leading slash.
 */
export const buildFileRoutePath = (publicFileName: string): string =>
  publicFileName
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

/**
 * Parses a decoded wildcard route path into a public file name.
 * @param routePath Wildcard route path without the `/api/...` prefix.
 * @returns Public file name or undefined when the path is empty.
 * @remarks Fastify decodes wildcard parameters once before handlers receive them.
 */
export const parsePublicFileNameFromRoutePath = (
  routePath: string
): string | undefined => {
  if (
    routePath.length === 0 ||
    routePath.startsWith('/') ||
    routePath.endsWith('/') ||
    routePath.includes('//')
  ) {
    return undefined;
  }

  const normalizedSegments = routePath
    .split('/')
    .filter((segment) => segment.length > 0);

  if (normalizedSegments.length === 0) {
    return undefined;
  }

  return normalizedSegments.length === 1
    ? normalizedSegments[0]
    : `/${normalizedSegments.join('/')}`;
};
