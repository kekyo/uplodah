// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import fs from 'fs/promises';
import { Dirent } from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import { Logger, ServerConfig, StorageRule } from '../types';

dayjs.extend(customParseFormat);
dayjs.extend(utc);

/**
 * Normalized public file path information.
 */
export interface NormalizedPublicPath {
  publicPath: string;
  displayPath: string;
  directoryPath: string;
  fileName: string;
  segments: string[];
}

/**
 * Stored version information returned to API callers.
 */
export interface StoredFileVersionInfo {
  uploadId: string;
  uploadedAt: string;
  size: number;
  versionDownloadPath: string;
}

/**
 * Stored file-group summary returned to the browse/search API.
 */
export interface StoredFileGroupSummaryInfo {
  publicPath: string;
  displayPath: string;
  directoryPath: string;
  fileName: string;
  latestUploadId: string;
  latestUploadedAt: string;
  latestDownloadPath: string;
}

/**
 * Stored file group returned by the list API.
 */
export interface StoredFileGroupInfo {
  publicPath: string;
  displayPath: string;
  directoryPath: string;
  fileName: string;
  latestUploadId: string;
  latestUploadedAt: string;
  latestDownloadPath: string;
  versions: StoredFileVersionInfo[];
}

/**
 * Stored file version resolved for download.
 */
export interface StoredFileVersion {
  uploadId: string;
  uploadedAt: string;
  size: number;
  absoluteFilePath: string;
  fileName: string;
  publicPath: string;
  displayPath: string;
  directoryPath: string;
  latestDownloadPath: string;
  versionDownloadPath: string;
}

/**
 * Result of a stored upload.
 */
export interface StoreFileResult {
  uploadId: string;
  uploadedAt: string;
  size: number;
  publicPath: string;
  displayPath: string;
  directoryPath: string;
  fileName: string;
  latestDownloadPath: string;
  versionDownloadPath: string;
}

/**
 * Paginated file list result.
 */
export interface StoredFileListResult {
  totalCount: number;
  items: StoredFileGroupInfo[];
}

/**
 * Virtual directory summary returned to the browse API.
 */
export interface StoredDirectoryInfo {
  directoryPath: string;
  readonly: boolean;
  fileGroupCount: number;
}

/**
 * Storage service for uplodah file history management.
 */
export interface StorageService {
  /**
   * Initialize the storage directories.
   */
  readonly initialize: () => Promise<void>;
  /**
   * Get uploadable public directories.
   */
  readonly getAvailableUploadDirectories: () => string[];
  /**
   * List configured virtual directories in display order with file-group counts.
   */
  readonly listBrowseDirectories: () => Promise<StoredDirectoryInfo[]>;
  /**
   * List file-group summaries in a virtual directory.
   * @param directoryPath Public virtual directory path.
   */
  readonly listDirectoryFileGroups: (
    directoryPath: string
  ) => Promise<StoredFileGroupSummaryInfo[]>;
  /**
   * List versions for a public file path.
   * @param rawPublicPath Public file path.
   */
  readonly listFileGroupVersions: (
    rawPublicPath: string
  ) => Promise<StoredFileVersionInfo[]>;
  /**
   * Search file-group summaries across storage.
   * @param rawQuery Search query text.
   */
  readonly searchFileGroups: (
    rawQuery: string
  ) => Promise<StoredFileGroupSummaryInfo[]>;
  /**
   * List stored files.
   * @param skip Zero-based offset.
   * @param take Maximum group count to return.
   */
  readonly listFiles: (
    skip: number,
    take: number
  ) => Promise<StoredFileListResult>;
  /**
   * Store a new file version.
   * @param rawPublicPath Public file path.
   * @param fileContent File content.
   */
  readonly storeFile: (
    rawPublicPath: string,
    fileContent: Buffer
  ) => Promise<StoreFileResult>;
  /**
   * Resolve the latest stored version for a public file path.
   * @param rawPublicPath Public file path.
   */
  readonly getLatestFileVersion: (
    rawPublicPath: string
  ) => Promise<StoredFileVersion | undefined>;
  /**
   * Resolve a specific stored version for a public file path.
   * @param rawPublicPath Public file path.
   * @param uploadId Upload identifier.
   */
  readonly getFileVersion: (
    rawPublicPath: string,
    uploadId: string
  ) => Promise<StoredFileVersion | undefined>;
}

interface UploadIdParts {
  timestamp: number;
  sequence: number;
}

interface InternalStoredFileVersion {
  uploadId: string;
  uploadedAt: string;
  uploadedAtMs: number;
  size: number;
  absoluteFilePath: string;
}

interface InternalStoredFileGroupSummary {
  normalizedPath: NormalizedPublicPath;
  latestVersion: InternalStoredFileVersion;
}

interface MatchingRule {
  directoryPath: string;
  rule: StorageRule;
}

/**
 * Create uplodah storage service.
 * @param config Server configuration.
 * @param logger Logger instance.
 * @returns Storage service.
 */
export const createStorageService = (
  config: ServerConfig,
  logger: Logger
): StorageService => {
  const storageRoot = path.resolve(config.storageDir || './storage');
  const storageRules = config.storage;
  const hasStorageRules = storageRules !== undefined;

  const safeReadDirectory = async (targetPath: string): Promise<Dirent[]> => {
    try {
      return await fs.readdir(targetPath, { withFileTypes: true });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  };

  const directoryExists = async (targetPath: string): Promise<boolean> => {
    try {
      const stat = await fs.stat(targetPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  };

  const parseUploadId = (uploadId: string): UploadIdParts | undefined => {
    const match = uploadId.match(/^(\d{8}_\d{6}_\d{3})(?:_(\d+))?$/);
    if (!match) {
      return undefined;
    }

    const [, utcTimestampId, sequence] = match;
    const parsedTimestamp = dayjs.utc(
      utcTimestampId,
      'YYYYMMDD_HHmmss_SSS',
      true
    );
    if (!parsedTimestamp.isValid()) {
      return undefined;
    }

    return {
      timestamp: parsedTimestamp.valueOf(),
      sequence: sequence ? Number(sequence) : 0,
    };
  };

  const compareUploadIdsDescending = (left: string, right: string): number => {
    const leftParts = parseUploadId(left);
    const rightParts = parseUploadId(right);

    if (!leftParts && !rightParts) {
      return right.localeCompare(left);
    }
    if (!leftParts) {
      return 1;
    }
    if (!rightParts) {
      return -1;
    }
    if (leftParts.timestamp !== rightParts.timestamp) {
      return rightParts.timestamp - leftParts.timestamp;
    }
    return rightParts.sequence - leftParts.sequence;
  };

  const encodePublicPath = (normalizedPath: NormalizedPublicPath): string =>
    normalizedPath.segments
      .map((segment) => encodeURIComponent(segment))
      .join('/');

  const buildDisplayPath = (directoryPath: string, fileName: string): string =>
    directoryPath === '/' ? fileName : `${directoryPath}/${fileName}`;

  const normalizeStoredPublicPath = (
    rawPublicPath: string
  ): NormalizedPublicPath => {
    const trimmedPath = rawPublicPath.trim().replace(/^\/+|\/+$/g, '');
    if (trimmedPath.length === 0) {
      throw new Error('File path is required');
    }

    const segments = trimmedPath.split('/');
    if (
      segments.some(
        (segment) =>
          segment.length === 0 ||
          segment === '.' ||
          segment === '..' ||
          segment.includes('\\')
      )
    ) {
      throw new Error('File path contains invalid segments');
    }

    const fileName = segments[segments.length - 1];
    if (!fileName) {
      throw new Error('File name is required');
    }
    if (fileName === 'metadata.json') {
      throw new Error('metadata.json is reserved');
    }

    const directorySegments = segments.slice(0, -1);
    const directoryPath =
      directorySegments.length === 0 ? '/' : `/${directorySegments.join('/')}`;

    return {
      publicPath: segments.join('/'),
      displayPath: buildDisplayPath(directoryPath, fileName),
      directoryPath,
      fileName,
      segments,
    };
  };

  const normalizePublicPath = (rawPublicPath: string): NormalizedPublicPath => {
    const normalizedPath = normalizeStoredPublicPath(rawPublicPath);

    if (!hasStorageRules && normalizedPath.segments.length !== 1) {
      throw new Error('Subdirectories require storage rules to be configured');
    }

    return normalizedPath;
  };

  const normalizeDirectoryPath = (rawDirectoryPath: string): string => {
    const trimmedPath = rawDirectoryPath.trim();
    if (trimmedPath.length === 0 || trimmedPath === '/') {
      return '/';
    }

    const normalizedPath = `/${trimmedPath.replace(/^\/+|\/+$/g, '')}`;
    const segments = normalizedPath.split('/').filter((segment) => segment);
    if (
      segments.some(
        (segment) =>
          segment.length === 0 ||
          segment === '.' ||
          segment === '..' ||
          segment.includes('\\')
      )
    ) {
      throw new Error('Directory path contains invalid segments');
    }

    return normalizedPath;
  };

  const getConfiguredDirectoryPaths = (): string[] => {
    if (!storageRules) {
      return ['/'];
    }
    return Object.keys(storageRules);
  };

  const ensureDirectoryDefined = (directoryPath: string) => {
    if (!storageRules) {
      if (directoryPath !== '/') {
        throw new Error('Directory is not defined in storage rules');
      }
      return;
    }

    if (!(directoryPath in storageRules)) {
      throw new Error('Directory is not defined in storage rules');
    }
  };

  const getMatchingRule = (directoryPath: string): MatchingRule | undefined => {
    if (!storageRules) {
      return undefined;
    }

    const matches = Object.entries(storageRules)
      .filter(([candidatePath]) => {
        if (candidatePath === '/') {
          return true;
        }
        return (
          directoryPath === candidatePath ||
          directoryPath.startsWith(`${candidatePath}/`)
        );
      })
      .sort((left, right) => right[0].length - left[0].length);

    const matched = matches[0];
    return matched
      ? {
          directoryPath: matched[0],
          rule: matched[1],
        }
      : undefined;
  };

  const ensureUploadAllowed = (normalizedPath: NormalizedPublicPath) => {
    if (!storageRules) {
      return;
    }

    const matchingRule = getMatchingRule(normalizedPath.directoryPath);
    if (!matchingRule) {
      throw new Error('Upload directory is not defined in storage rules');
    }

    if (matchingRule.rule.readonly === true) {
      throw new Error('Upload directory is read-only');
    }
  };

  const getGroupDirectoryPath = (
    normalizedPath: NormalizedPublicPath
  ): string => path.join(storageRoot, ...normalizedPath.segments);

  const cleanupEmptyDirectories = async (
    startPath: string,
    stopPath: string
  ): Promise<void> => {
    let currentPath = startPath;

    while (currentPath.startsWith(stopPath)) {
      if (currentPath === stopPath) {
        break;
      }

      const entries = await safeReadDirectory(currentPath);
      if (entries.length > 0) {
        break;
      }

      await fs.rmdir(currentPath).catch(() => undefined);
      currentPath = path.dirname(currentPath);
    }
  };

  const removeVersionDirectory = async (
    versionDirectoryPath: string,
    cleanupBoundaryPath: string
  ): Promise<void> => {
    await fs.rm(versionDirectoryPath, { recursive: true, force: true });
    await cleanupEmptyDirectories(
      path.dirname(versionDirectoryPath),
      cleanupBoundaryPath
    );
  };

  const isExpired = (
    directoryPath: string,
    uploadedAtMs: number,
    nowMs: number
  ): boolean => {
    const matchingRule = getMatchingRule(directoryPath);
    if (!matchingRule?.rule.expireSeconds) {
      return false;
    }
    return uploadedAtMs + matchingRule.rule.expireSeconds * 1000 <= nowMs;
  };

  const createVersionInfo = (
    normalizedPath: NormalizedPublicPath,
    version: InternalStoredFileVersion
  ): StoredFileVersionInfo => ({
    uploadId: version.uploadId,
    uploadedAt: version.uploadedAt,
    size: version.size,
    versionDownloadPath: `/api/files/${encodePublicPath(normalizedPath)}/${encodeURIComponent(version.uploadId)}`,
  });

  const createGroupSummaryInfo = (
    normalizedPath: NormalizedPublicPath,
    latestVersion: InternalStoredFileVersion
  ): StoredFileGroupSummaryInfo => ({
    publicPath: normalizedPath.publicPath,
    displayPath: normalizedPath.displayPath,
    directoryPath: normalizedPath.directoryPath,
    fileName: normalizedPath.fileName,
    latestUploadId: latestVersion.uploadId,
    latestUploadedAt: latestVersion.uploadedAt,
    latestDownloadPath: `/api/files/${encodePublicPath(normalizedPath)}`,
  });

  const createStoredVersion = (
    normalizedPath: NormalizedPublicPath,
    version: InternalStoredFileVersion
  ): StoredFileVersion => ({
    uploadId: version.uploadId,
    uploadedAt: version.uploadedAt,
    size: version.size,
    absoluteFilePath: version.absoluteFilePath,
    fileName: normalizedPath.fileName,
    publicPath: normalizedPath.publicPath,
    displayPath: normalizedPath.displayPath,
    directoryPath: normalizedPath.directoryPath,
    latestDownloadPath: `/api/files/${encodePublicPath(normalizedPath)}`,
    versionDownloadPath: `/api/files/${encodePublicPath(normalizedPath)}/${encodeURIComponent(version.uploadId)}`,
  });

  const scanVersionDirectory = async (
    normalizedPath: NormalizedPublicPath,
    versionDirectoryPath: string,
    uploadId: string,
    nowMs: number
  ): Promise<InternalStoredFileVersion | undefined> => {
    const uploadIdParts = parseUploadId(uploadId);
    if (!uploadIdParts) {
      logger.warn(
        `Ignoring invalid uploadId directory: ${versionDirectoryPath}`
      );
      return undefined;
    }

    if (
      isExpired(normalizedPath.directoryPath, uploadIdParts.timestamp, nowMs)
    ) {
      logger.info(
        `Removing expired upload: ${normalizedPath.displayPath} (${uploadId})`
      );
      await removeVersionDirectory(versionDirectoryPath, storageRoot);
      return undefined;
    }

    const metadataFilePath = path.join(versionDirectoryPath, 'metadata.json');
    try {
      const metadataContent = await fs.readFile(metadataFilePath, 'utf-8');
      JSON.parse(metadataContent);
    } catch {
      return undefined;
    }

    const absoluteFilePath = path.join(
      versionDirectoryPath,
      normalizedPath.fileName
    );
    let stat;
    try {
      stat = await fs.stat(absoluteFilePath);
      if (!stat.isFile()) {
        return undefined;
      }
    } catch {
      return undefined;
    }

    return {
      uploadId,
      uploadedAt: dayjs.utc(uploadIdParts.timestamp).toISOString(),
      uploadedAtMs: uploadIdParts.timestamp,
      size: stat.size,
      absoluteFilePath,
    };
  };

  const scanGroupDirectory = async (
    normalizedPath: NormalizedPublicPath,
    groupDirectoryPath: string
  ): Promise<InternalStoredFileVersion[]> => {
    const versionEntries = await safeReadDirectory(groupDirectoryPath);
    const nowMs = Date.now();
    const versions: InternalStoredFileVersion[] = [];

    for (const entry of versionEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const version = await scanVersionDirectory(
        normalizedPath,
        path.join(groupDirectoryPath, entry.name),
        entry.name,
        nowMs
      );
      if (version) {
        versions.push(version);
      }
    }

    versions.sort((left, right) =>
      compareUploadIdsDescending(left.uploadId, right.uploadId)
    );
    return versions;
  };

  const scanGroupDirectorySummary = async (
    normalizedPath: NormalizedPublicPath,
    groupDirectoryPath: string
  ): Promise<InternalStoredFileGroupSummary | undefined> => {
    const versionEntries = await safeReadDirectory(groupDirectoryPath);
    const nowMs = Date.now();
    let latestVersion: InternalStoredFileVersion | undefined;

    for (const entry of versionEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const version = await scanVersionDirectory(
        normalizedPath,
        path.join(groupDirectoryPath, entry.name),
        entry.name,
        nowMs
      );
      if (!version) {
        continue;
      }

      if (
        !latestVersion ||
        compareUploadIdsDescending(version.uploadId, latestVersion.uploadId) < 0
      ) {
        latestVersion = version;
      }
    }

    return latestVersion
      ? {
          normalizedPath,
          latestVersion,
        }
      : undefined;
  };

  const createGroupInfo = (
    normalizedPath: NormalizedPublicPath,
    versions: InternalStoredFileVersion[]
  ): StoredFileGroupInfo => {
    const latestVersion = versions[0]!;
    return {
      ...createGroupSummaryInfo(normalizedPath, latestVersion),
      versions: versions.map((version) =>
        createVersionInfo(normalizedPath, version)
      ),
    };
  };

  const toGroupSummaryInfo = (
    group: StoredFileGroupInfo
  ): StoredFileGroupSummaryInfo => ({
    publicPath: group.publicPath,
    displayPath: group.displayPath,
    directoryPath: group.directoryPath,
    fileName: group.fileName,
    latestUploadId: group.latestUploadId,
    latestUploadedAt: group.latestUploadedAt,
    latestDownloadPath: group.latestDownloadPath,
  });

  const scanLegacyStorage = async (): Promise<StoredFileGroupInfo[]> => {
    const groups: StoredFileGroupInfo[] = [];
    const entries = await safeReadDirectory(storageRoot);

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      const normalizedPath = normalizePublicPath(entry.name);
      const groupDirectoryPath = path.join(storageRoot, entry.name);
      const versions = await scanGroupDirectory(
        normalizedPath,
        groupDirectoryPath
      );
      if (versions.length > 0) {
        groups.push(createGroupInfo(normalizedPath, versions));
      }
    }

    return groups;
  };

  const scanLegacyStorageSummaries = async (): Promise<
    StoredFileGroupSummaryInfo[]
  > => {
    const groups: StoredFileGroupSummaryInfo[] = [];
    const entries = await safeReadDirectory(storageRoot);

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      const normalizedPath = normalizePublicPath(entry.name);
      const groupDirectoryPath = path.join(storageRoot, entry.name);
      const summary = await scanGroupDirectorySummary(
        normalizedPath,
        groupDirectoryPath
      );
      if (summary) {
        groups.push(
          createGroupSummaryInfo(summary.normalizedPath, summary.latestVersion)
        );
      }
    }

    return groups;
  };

  const looksLikeGroupDirectory = async (
    targetPath: string,
    currentSegments: string[]
  ): Promise<boolean> => {
    let normalizedPath: NormalizedPublicPath;
    try {
      normalizedPath = normalizeStoredPublicPath(currentSegments.join('/'));
    } catch {
      return false;
    }

    const entries = await safeReadDirectory(targetPath);
    const childDirectories = entries.filter((entry) => entry.isDirectory());
    if (childDirectories.length === 0) {
      return false;
    }

    const nowMs = Date.now();
    for (const entry of childDirectories) {
      if (!parseUploadId(entry.name)) {
        continue;
      }

      const version = await scanVersionDirectory(
        normalizedPath,
        path.join(targetPath, entry.name),
        entry.name,
        nowMs
      );
      if (version) {
        return true;
      }
    }

    return false;
  };

  const scanTreeStorage = async (
    currentPath: string,
    currentSegments: string[]
  ): Promise<StoredFileGroupInfo[]> => {
    const groups: StoredFileGroupInfo[] = [];
    const entries = await safeReadDirectory(currentPath);

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const nextPath = path.join(currentPath, entry.name);
      const nextSegments = [...currentSegments, entry.name];

      if (await looksLikeGroupDirectory(nextPath, nextSegments)) {
        const normalizedPath = normalizeStoredPublicPath(
          nextSegments.join('/')
        );
        const versions = await scanGroupDirectory(normalizedPath, nextPath);
        if (versions.length > 0) {
          groups.push(createGroupInfo(normalizedPath, versions));
        }
      } else {
        groups.push(...(await scanTreeStorage(nextPath, nextSegments)));
      }
    }

    return groups;
  };

  const scanTreeStorageSummaries = async (
    currentPath: string,
    currentSegments: string[]
  ): Promise<StoredFileGroupSummaryInfo[]> => {
    const groups: StoredFileGroupSummaryInfo[] = [];
    const entries = await safeReadDirectory(currentPath);

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const nextPath = path.join(currentPath, entry.name);
      const nextSegments = [...currentSegments, entry.name];

      if (await looksLikeGroupDirectory(nextPath, nextSegments)) {
        const normalizedPath = normalizeStoredPublicPath(
          nextSegments.join('/')
        );
        const summary = await scanGroupDirectorySummary(
          normalizedPath,
          nextPath
        );
        if (summary) {
          groups.push(
            createGroupSummaryInfo(
              summary.normalizedPath,
              summary.latestVersion
            )
          );
        }
      } else {
        groups.push(
          ...(await scanTreeStorageSummaries(nextPath, nextSegments))
        );
      }
    }

    return groups;
  };

  const scanAllGroups = async (): Promise<StoredFileGroupInfo[]> => {
    const groups = hasStorageRules
      ? await scanTreeStorage(storageRoot, [])
      : await scanLegacyStorage();

    groups.sort((left, right) =>
      compareUploadIdsDescending(left.latestUploadId, right.latestUploadId)
    );
    return groups;
  };

  const scanAllGroupSummaries = async (): Promise<
    StoredFileGroupSummaryInfo[]
  > => {
    const groups = hasStorageRules
      ? await scanTreeStorageSummaries(storageRoot, [])
      : await scanLegacyStorageSummaries();

    groups.sort((left, right) =>
      compareUploadIdsDescending(left.latestUploadId, right.latestUploadId)
    );
    return groups;
  };

  const resolveStoredVersion = async (
    rawPublicPath: string,
    uploadId: string | undefined
  ): Promise<StoredFileVersion | undefined> => {
    const normalizedPath = normalizePublicPath(rawPublicPath);
    const groupDirectoryPath = getGroupDirectoryPath(normalizedPath);
    const versions = await scanGroupDirectory(
      normalizedPath,
      groupDirectoryPath
    );

    if (versions.length === 0) {
      return undefined;
    }

    const version = uploadId
      ? versions.find((candidate) => candidate.uploadId === uploadId)
      : versions[0];

    return version ? createStoredVersion(normalizedPath, version) : undefined;
  };

  const createUploadId = async (
    normalizedPath: NormalizedPublicPath
  ): Promise<string> => {
    const baseId = dayjs().utc().format('YYYYMMDD_HHmmss_SSS');
    const groupDirectoryPath = getGroupDirectoryPath(normalizedPath);
    let uploadId = baseId;
    let sequence = 1;

    while (await directoryExists(path.join(groupDirectoryPath, uploadId))) {
      uploadId = `${baseId}_${sequence}`;
      sequence += 1;
    }

    return uploadId;
  };

  return {
    initialize: async () => {
      await fs.mkdir(storageRoot, { recursive: true });
    },

    getAvailableUploadDirectories: () => {
      if (!storageRules) {
        return ['/'];
      }

      return Object.entries(storageRules)
        .filter(([, rule]) => rule.readonly !== true)
        .map(([directoryPath]) => directoryPath)
        .sort((left, right) => {
          if (left === '/') {
            return -1;
          }
          if (right === '/') {
            return 1;
          }
          return left.localeCompare(right);
        });
    },

    listBrowseDirectories: async () => {
      const groups = await scanAllGroupSummaries();
      const fileGroupCounts = new Map<string, number>();

      groups.forEach((group) => {
        fileGroupCounts.set(
          group.directoryPath,
          (fileGroupCounts.get(group.directoryPath) ?? 0) + 1
        );
      });

      return getConfiguredDirectoryPaths().map((directoryPath) => ({
        directoryPath,
        readonly: storageRules?.[directoryPath]?.readonly === true,
        fileGroupCount: fileGroupCounts.get(directoryPath) ?? 0,
      }));
    },

    listDirectoryFileGroups: async (rawDirectoryPath: string) => {
      const directoryPath = normalizeDirectoryPath(rawDirectoryPath);
      ensureDirectoryDefined(directoryPath);

      const groups = await scanAllGroupSummaries();
      return groups.filter((group) => group.directoryPath === directoryPath);
    },

    listFileGroupVersions: async (rawPublicPath: string) => {
      const normalizedPath = normalizePublicPath(rawPublicPath);
      const groupDirectoryPath = getGroupDirectoryPath(normalizedPath);
      const versions = await scanGroupDirectory(
        normalizedPath,
        groupDirectoryPath
      );
      return versions.map((version) =>
        createVersionInfo(normalizedPath, version)
      );
    },

    searchFileGroups: async (rawQuery: string) => {
      const searchTerms = rawQuery
        .split(/[,\s]+/)
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term.length > 0);

      if (searchTerms.length === 0) {
        return [];
      }

      const groups = await scanAllGroups();
      return groups
        .filter((group) =>
          searchTerms.every((term) => {
            if (group.displayPath.toLowerCase().includes(term)) {
              return true;
            }
            if (group.directoryPath.toLowerCase().includes(term)) {
              return true;
            }
            if (group.latestUploadId.toLowerCase().includes(term)) {
              return true;
            }
            return group.versions.some((version) =>
              version.uploadId.toLowerCase().includes(term)
            );
          })
        )
        .map((group) => toGroupSummaryInfo(group));
    },

    listFiles: async (skip: number, take: number) => {
      const safeSkip = Math.max(0, skip);
      const safeTake = Math.max(1, take);
      const groups = await scanAllGroups();

      return {
        totalCount: groups.length,
        items: groups.slice(safeSkip, safeSkip + safeTake),
      };
    },

    storeFile: async (rawPublicPath: string, fileContent: Buffer) => {
      const normalizedPath = normalizePublicPath(rawPublicPath);
      ensureUploadAllowed(normalizedPath);

      const groupDirectoryPath = getGroupDirectoryPath(normalizedPath);
      const uploadId = await createUploadId(normalizedPath);
      const versionDirectoryPath = path.join(groupDirectoryPath, uploadId);

      await fs.mkdir(versionDirectoryPath, { recursive: true });
      await fs.writeFile(
        path.join(versionDirectoryPath, 'metadata.json'),
        '{}'
      );
      await fs.writeFile(
        path.join(versionDirectoryPath, normalizedPath.fileName),
        fileContent
      );

      const storedVersion = await resolveStoredVersion(
        normalizedPath.publicPath,
        uploadId
      );
      if (!storedVersion) {
        throw new Error('Stored file version could not be resolved');
      }

      return {
        uploadId: storedVersion.uploadId,
        uploadedAt: storedVersion.uploadedAt,
        size: storedVersion.size,
        publicPath: storedVersion.publicPath,
        displayPath: storedVersion.displayPath,
        directoryPath: storedVersion.directoryPath,
        fileName: storedVersion.fileName,
        latestDownloadPath: storedVersion.latestDownloadPath,
        versionDownloadPath: storedVersion.versionDownloadPath,
      };
    },

    getLatestFileVersion: async (rawPublicPath: string) =>
      await resolveStoredVersion(rawPublicPath, undefined),

    getFileVersion: async (rawPublicPath: string, uploadId: string) =>
      await resolveStoredVersion(rawPublicPath, uploadId),
  };
};
