// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

/** Matches an upload ID and captures its UTC timestamp and optional sequence. */
export const uploadIdPattern = /^(\d{8}_\d{6}_\d{3})(?:_(\d+))?$/;

/**
 * Read the version selector at the end of a download path.
 * @param path Decoded path relative to the files API.
 * @returns The public path and upload ID for a specific version, if present.
 */
export const splitFileVersionPath = (
  path: string
): { publicPath: string; uploadId: string } | undefined => {
  const separator = path.lastIndexOf('/');
  const uploadId = path.slice(separator + 1);
  return separator > 0 && uploadIdPattern.test(uploadId)
    ? { publicPath: path.slice(0, separator), uploadId }
    : undefined;
};

/**
 * Build the download path for an uploaded file.
 * @param publicPath Decoded file path relative to the storage root.
 * @param uploadId Specific version to download, or undefined for the latest.
 * @returns An API path that identifies the requested file and version.
 */
export const buildFileDownloadPath = (
  publicPath: string,
  uploadId: string | undefined
): string => {
  const encodedPath = publicPath.split('/').map(encodeURIComponent).join('/');
  const base = `/api/files/${encodedPath}`;
  if (uploadId !== undefined) {
    return `${base}/${encodeURIComponent(uploadId)}`;
  }
  return splitFileVersionPath(publicPath) ? `${base}?version=latest` : base;
};
