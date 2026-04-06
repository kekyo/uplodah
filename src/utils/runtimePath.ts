// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import path from 'path';

/**
 * Resolves a path relative to the current runtime layout.
 * @param currentDir Directory of the currently executing module or bundle.
 * @param developmentPath Path segments used when running from `src`.
 * @param productionPath Path segments used when running from `dist`.
 * @returns Absolute path resolved for the current runtime.
 */
export const resolveEnvironmentPath = (
  currentDir: string,
  developmentPath: string[],
  productionPath: string[]
): string => {
  const normalizedCurrentDir = currentDir.replaceAll('\\', '/');
  const isDevelopment =
    normalizedCurrentDir.includes('/src/') ||
    normalizedCurrentDir.endsWith('/src');

  return isDevelopment
    ? path.join(currentDir, ...developmentPath)
    : path.join(currentDir, ...productionPath);
};
