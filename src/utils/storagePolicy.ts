// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { StorageEntryConfig } from '../types';

const validatePathSegment = (segment: string, label: string): string => {
  if (segment.length === 0) {
    throw new Error(`${label} contains an empty path segment`);
  }
  if (segment === '.' || segment === '..') {
    throw new Error(`${label} cannot contain relative path segments`);
  }
  if (segment.includes('\0')) {
    throw new Error(`${label} cannot contain NUL characters`);
  }
  if (segment.includes('\\')) {
    throw new Error(`${label} cannot contain backslashes`);
  }
  if (segment.length > 255) {
    throw new Error(`${label} contains a segment that is too long`);
  }
  return segment;
};

/**
 * Parsed virtual upload path.
 */
export interface ParsedVirtualFileName {
  /**
   * Public file name exposed by the API.
   */
  publicFileName: string;
  /**
   * Virtual directory path that contains the file.
   */
  directoryPath: string;
  /**
   * Virtual directory segments without the leading slash.
   */
  directorySegments: string[];
  /**
   * Complete virtual path segments including the file name.
   */
  pathSegments: string[];
  /**
   * File name shown when downloaded.
   */
  storedFileName: string;
}

/**
 * Matched storage rule for a virtual directory path.
 */
export interface ResolvedStoragePolicy {
  /**
   * Directory path that matched the input.
   */
  directoryPath: string;
  /**
   * Whether uploads are rejected for the matched directory.
   */
  readonly: boolean;
  /**
   * Expiration applied to the matched directory and its descendants.
   */
  expireSeconds: number | undefined;
}

/**
 * Decodes a file name that was passed through encodeURIComponent.
 * @param fileName Header value to decode.
 * @returns Decoded file name.
 */
export const decodeHeaderFileName = (fileName: string): string => {
  try {
    return decodeURIComponent(fileName);
  } catch (error) {
    return fileName;
  }
};

/**
 * Parses and validates a public file name used by the API.
 * @param fileName Raw file name or group identifier.
 * @returns Parsed virtual file information.
 */
export const parseVirtualFileName = (
  fileName: string
): ParsedVirtualFileName => {
  const normalizedFileName = fileName.trim();
  if (normalizedFileName.length === 0) {
    throw new Error('File name header is empty');
  }
  if (normalizedFileName.includes('\0')) {
    throw new Error('NUL characters are not allowed in file names');
  }
  if (normalizedFileName.includes('\\')) {
    throw new Error('Directory separators are not allowed in file names');
  }

  if (!normalizedFileName.includes('/')) {
    const storedFileName = validatePathSegment(normalizedFileName, 'File name');
    return {
      publicFileName: storedFileName,
      directoryPath: '/',
      directorySegments: [],
      pathSegments: [storedFileName],
      storedFileName,
    };
  }

  if (!normalizedFileName.startsWith('/')) {
    throw new Error('Directory-style file names must start with /');
  }

  const pathSegments = normalizedFileName
    .slice(1)
    .split('/')
    .map((segment) => validatePathSegment(segment, 'File name'));

  if (pathSegments.length < 2) {
    throw new Error('Directory-style file names must include a file name');
  }

  const storedFileName = pathSegments[pathSegments.length - 1]!;
  const directorySegments = pathSegments.slice(0, -1);

  return {
    publicFileName: normalizedFileName,
    directoryPath: `/${directorySegments.join('/')}`,
    directorySegments,
    pathSegments,
    storedFileName,
  };
};

/**
 * Normalizes and validates a configured virtual directory path.
 * @param directoryPath Directory path from configuration.
 * @returns Normalized virtual directory path.
 */
export const normalizeVirtualDirectoryPath = (
  directoryPath: string
): string => {
  const normalizedDirectoryPath = directoryPath.trim();
  if (normalizedDirectoryPath.length === 0) {
    throw new Error('Storage directory path is empty');
  }
  if (normalizedDirectoryPath.includes('\0')) {
    throw new Error('Storage directory path cannot contain NUL characters');
  }
  if (normalizedDirectoryPath.includes('\\')) {
    throw new Error('Storage directory path cannot contain backslashes');
  }
  if (!normalizedDirectoryPath.startsWith('/')) {
    throw new Error('Storage directory path must start with /');
  }

  const trimmedDirectoryPath =
    normalizedDirectoryPath === '/'
      ? '/'
      : normalizedDirectoryPath.replace(/\/+$/, '');

  if (trimmedDirectoryPath === '/') {
    return '/';
  }

  const segments = trimmedDirectoryPath
    .slice(1)
    .split('/')
    .map((segment) => validatePathSegment(segment, 'Storage directory path'));

  return `/${segments.join('/')}`;
};

const matchesDirectoryPath = (
  targetDirectoryPath: string,
  ruleDirectoryPath: string
): boolean => {
  if (ruleDirectoryPath === '/') {
    return true;
  }
  return (
    targetDirectoryPath === ruleDirectoryPath ||
    targetDirectoryPath.startsWith(`${ruleDirectoryPath}/`)
  );
};

/**
 * Resolves the most specific storage rule that matches a virtual directory.
 * @param storage Configured storage rules.
 * @param directoryPath Target virtual directory path.
 * @returns Matched rule or undefined when no rule applies.
 */
export const resolveStoragePolicy = (
  storage: Record<string, StorageEntryConfig> | undefined,
  directoryPath: string
): ResolvedStoragePolicy | undefined => {
  if (!storage) {
    return undefined;
  }

  let matchedDirectoryPath: string | undefined = undefined;
  for (const ruleDirectoryPath of Object.keys(storage)) {
    if (!matchesDirectoryPath(directoryPath, ruleDirectoryPath)) {
      continue;
    }

    if (
      matchedDirectoryPath === undefined ||
      ruleDirectoryPath.length > matchedDirectoryPath.length
    ) {
      matchedDirectoryPath = ruleDirectoryPath;
    }
  }

  if (!matchedDirectoryPath) {
    return undefined;
  }

  const entry = storage[matchedDirectoryPath] ?? {};
  return {
    directoryPath: matchedDirectoryPath,
    readonly: entry.readonly ?? false,
    expireSeconds: entry.expireSeconds,
  };
};

/**
 * Checks whether a directory name looks like an upload identifier.
 * @param uploadId Directory name to inspect.
 * @returns True when the name matches the upload id format.
 */
export const isLikelyUploadId = (uploadId: string): boolean =>
  /^\d{8}_\d{6}_\d{3}(?:_\d+)?$/.test(uploadId);
