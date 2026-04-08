// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

export interface ServerUrlInfo {
  baseUrl?: string;
  port: number;
  isHttps: boolean;
}

export interface CommandOptions {
  serverUrl: ServerUrlInfo;
  publicPath?: string;
  uploadId?: string;
  skip?: number;
  take?: number;
  username?: string;
  apiPassword?: string;
}

export type RepositoryAuthMode = 'none' | 'publish' | 'full';

const resolveServerOrigin = (serverUrl: ServerUrlInfo): string =>
  serverUrl.baseUrl
    ? serverUrl.baseUrl
    : `${serverUrl.isHttps ? 'https' : 'http'}://localhost:${serverUrl.port}`;

const encodePublicPath = (publicPath: string): string =>
  publicPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const buildAuthOption = (
  username: string | undefined,
  apiPassword: string | undefined
): string => (username && apiPassword ? ` -u ${username}:${apiPassword}` : '');

/**
 * Resolve a sample public path that fits the configured upload directories.
 */
export const resolveExamplePublicPath = (
  storageDirectories: readonly string[] | undefined,
  fileName = 'report.txt'
): string | undefined => {
  if (storageDirectories && storageDirectories.length === 0) {
    return undefined;
  }

  const directoryPath = storageDirectories?.[0];
  if (!directoryPath || directoryPath === '/') {
    return fileName;
  }

  return `${directoryPath.replace(/^\/+/, '')}/${fileName}`;
};

/**
 * Build a curl command for uploading a file.
 */
export const buildUploadCommand = (options: CommandOptions): string => {
  const {
    serverUrl,
    publicPath = 'report.txt',
    username,
    apiPassword,
  } = options;

  const url = `${resolveServerOrigin(serverUrl)}/api/upload/${encodePublicPath(
    publicPath
  )}`;

  return `curl -X POST "${url}"${buildAuthOption(
    username,
    apiPassword
  )} -H "Content-Type: application/octet-stream" --data-binary @./${
    publicPath.split('/').pop() || 'report.txt'
  }`;
};

/**
 * Build a curl command for listing uploaded files.
 */
export const buildListFilesCommand = (options: CommandOptions): string => {
  const { serverUrl, skip = 0, take = 20, username, apiPassword } = options;

  const url = `${resolveServerOrigin(
    serverUrl
  )}/api/files?skip=${skip}&take=${take}`;

  return `curl "${url}"${buildAuthOption(username, apiPassword)}`;
};

/**
 * Build a curl command for downloading a file.
 */
export const buildDownloadCommand = (options: CommandOptions): string => {
  const {
    serverUrl,
    publicPath = 'report.txt',
    uploadId,
    username,
    apiPassword,
  } = options;

  const basePath = `${resolveServerOrigin(serverUrl)}/api/files/${encodePublicPath(
    publicPath
  )}`;
  const url = uploadId
    ? `${basePath}/${encodeURIComponent(uploadId)}`
    : basePath;
  const outputFileName = publicPath.split('/').pop() || 'report.txt';

  return `curl -L "${url}"${buildAuthOption(
    username,
    apiPassword
  )} -o ./${outputFileName}`;
};

/**
 * Whether anonymous UI examples should include upload.
 */
export const shouldShowUploadCommandInRepositoryInfo = (
  authMode: RepositoryAuthMode
): boolean => authMode === 'none';

/**
 * Whether authenticated API password examples should be shown.
 */
export const shouldShowAuthenticatedApiExamples = (
  authMode: RepositoryAuthMode
): boolean => authMode === 'publish' || authMode === 'full';
