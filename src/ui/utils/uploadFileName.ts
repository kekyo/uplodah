// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { buildFileRoutePath } from '../../utils/fileRoutePath';

const resolvePublicFileName = (
  fileName: string,
  directoryPath: string
): string =>
  directoryPath === '/' ? fileName : `${directoryPath}/${fileName}`;

/**
 * Builds the upload request path from a browser-side file name.
 * @param fileName Browser-provided file name.
 * @param directoryPath Selected upload directory.
 * @returns Upload API path that embeds the target file name.
 */
export const buildUploadRequestPath = (
  fileName: string,
  directoryPath: string
): string =>
  `/api/upload/${buildFileRoutePath(resolvePublicFileName(fileName, directoryPath))}`;
