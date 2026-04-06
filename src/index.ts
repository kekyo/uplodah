// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

/**
 * Public server entrypoint.
 */
export { createFastifyInstance, startFastifyServer } from './server';
export type {
  AppConfigResponse,
  FileGroup,
  FileListResponse,
  FileRevision,
  Logger,
  ServerUrlInfo,
  ServerConfig,
  UploadDirectory,
  UploadDirectoriesResponse,
  UploadResponse,
} from './types';
