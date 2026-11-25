// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import {
  openStorageFile,
  prepareStorageDirectory,
  resolveStoragePath,
} from '../utils/storagePaths.ts';
import fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import utc from 'dayjs/plugin/utc.js';
import {
  buildFileDownloadPath,
  uploadIdPattern,
} from '../utils/fileDownloadPath.ts';
import type {
  Logger,
  ServerConfig,
  StorageDirectoryDescriptor,
  StoragePermission,
  StorageRule,
} from '../types.ts';

dayjs.extend(customParseFormat);
dayjs.extend(utc);

/**
 * Normalized public file path information.
 */
interface NormalizedPublicPath {
  publicPath: string;
  displayPath: string;
  directoryPath: string;
  fileName: string;
  segments: string[];
  virtualDirectoryPath: string;
  relativePath: string;
  storageRule?: StorageRule;
}

/**
 * Optional upload metadata stored alongside a file version.
 */
export interface StoredUploadMetadata {
  /**
   * Name of the uploader recorded for the version.
   */
  uploadedBy?: string;
  /**
   * Additional tags recorded for the version.
   */
  tags?: string[];
}

/**
 * Stored version information returned to API callers.
 */
export interface StoredFileVersionInfo extends StoredUploadMetadata {
  uploadId: string;
  uploadedAt: string;
  size: number;
  versionDownloadPath: string;
}

/**
 * Stored file-group summary returned to the browse/search API.
 */
export interface StoredFileGroupSummaryInfo {
  /** Public file path relative to the storage root. */
  publicPath: string;
  /** Human-readable full path shown in the UI. */
  displayPath: string;
  /** Actual public parent directory that contains the file group. */
  directoryPath: string;
  /** Directory section path used to group the file in browse/search views. */
  browseDirectoryPath: string;
  /** File label relative to the browse directory section. */
  browseRelativePath: string;
  /** Basename of the file group. */
  fileName: string;
  /** Upload identifier of the latest stored version. */
  latestUploadId: string;
  /** ISO-8601 timestamp of the latest stored version. */
  latestUploadedAt: string;
  /** Latest-download API path for the file group. */
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
export interface StoredFileVersion extends StoredUploadMetadata {
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
export interface StoreFileResult extends StoredUploadMetadata {
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
  description?: string;
  accept: StoragePermission[];
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
   * Get uploadable public directories with UI metadata.
   */
  readonly getAvailableUploadDirectoryDetails: () => StorageDirectoryDescriptor[];
  /**
   * Check whether a public file path is accepted for a storage action by
   * storage-directory rules.
   * @param rawPublicPath Public file path.
   * @param permission Directory permission to check.
   */
  readonly isPublicPathAcceptedForPermission: (
    rawPublicPath: string,
    permission: StoragePermission
  ) => boolean;
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
   * @param metadata Upload metadata written to `metadata.json`.
   */
  readonly storeFile: (
    rawPublicPath: string,
    fileContent: Buffer,
    metadata?: StoredUploadMetadata
  ) => Promise<StoreFileResult>;
  /**
   * Delete a specific stored file version.
   * @param rawPublicPath Public file path.
   * @param uploadId Upload identifier.
   * @returns True when the version was deleted, otherwise false.
   */
  readonly deleteFileVersion: (
    rawPublicPath: string,
    uploadId: string
  ) => Promise<boolean>;
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

interface InternalStoredFileVersion extends StoredUploadMetadata {
  uploadId: string;
  uploadedAt: string;
  uploadedAtMs: number;
  size: number;
  absoluteFilePath: string;
}

interface ResolvedVirtualDirectory {
  virtualDirectoryPath: string;
  relativeSegments: string[];
  rule?: StorageRule;
}

interface ConfiguredStorageDirectory {
  directoryPath: string;
  segments: string[];
  rule: StorageRule;
}

interface InternalStoredFileGroupInfo extends StoredFileGroupInfo {
  browseDirectoryPath: string;
  browseRelativePath: string;
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
      const directory = await resolveStoragePath(
        storageRoot,
        path.relative(storageRoot, targetPath)
      );
      return await fs.readdir(directory, { withFileTypes: true });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  };

  const parseUploadId = (uploadId: string): UploadIdParts | undefined => {
    const match = uploadId.match(uploadIdPattern);
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
      virtualDirectoryPath: '/',
      relativePath: segments.join('/'),
    };
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
  const defaultStoragePermissions: readonly StoragePermission[] = [
    'store',
    'delete',
  ];
  const getAcceptedPermissions = (
    rule: StorageRule | undefined
  ): StoragePermission[] =>
    rule?.accept !== undefined
      ? Array.from(new Set(rule.accept))
      : [...defaultStoragePermissions];
  const isPermissionAccepted = (
    rule: StorageRule | undefined,
    permission: StoragePermission
  ): boolean => getAcceptedPermissions(rule).includes(permission);
  const getPermissionDeniedMessage = (permission: StoragePermission): string =>
    permission === 'store'
      ? 'Upload directory does not allow uploads'
      : 'Upload directory does not allow deletions';

  const createDirectoryDescriptionFields = (description?: string) =>
    description !== undefined ? { description } : {};

  const normalizeStoredUploadMetadata = (
    metadata: StoredUploadMetadata | undefined
  ): StoredUploadMetadata => {
    const uploadedBy =
      typeof metadata?.uploadedBy === 'string'
        ? metadata.uploadedBy.trim()
        : '';
    const tags = Array.isArray(metadata?.tags)
      ? Array.from(
          new Set(
            metadata.tags
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          )
        )
      : [];

    return {
      ...(uploadedBy.length > 0 ? { uploadedBy } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    };
  };

  const parseStoredUploadMetadata = (value: unknown): StoredUploadMetadata => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }

    const candidate = value as {
      uploadedBy?: unknown;
      tags?: unknown;
    };

    return normalizeStoredUploadMetadata({
      uploadedBy:
        typeof candidate.uploadedBy === 'string'
          ? candidate.uploadedBy
          : undefined,
      tags: Array.isArray(candidate.tags)
        ? candidate.tags.filter((tag): tag is string => typeof tag === 'string')
        : undefined,
    });
  };

  const splitDirectoryPathSegments = (directoryPath: string): string[] =>
    directoryPath === '/'
      ? []
      : directoryPath.split('/').filter((segment) => segment.length > 0);

  const configuredStorageDirectories: ConfiguredStorageDirectory[] =
    storageRules
      ? Object.entries(storageRules)
          .map(([directoryPath, rule]) => ({
            directoryPath,
            segments: splitDirectoryPathSegments(directoryPath),
            rule,
          }))
          .sort(
            (left, right) =>
              right.segments.length - left.segments.length ||
              left.directoryPath.localeCompare(right.directoryPath)
          )
      : [];

  const createResolvedPublicPath = (
    normalizedPath: NormalizedPublicPath,
    resolution: ResolvedVirtualDirectory
  ): NormalizedPublicPath => ({
    ...normalizedPath,
    virtualDirectoryPath: resolution.virtualDirectoryPath,
    relativePath: resolution.relativeSegments.join('/'),
    storageRule: resolution.rule,
  });

  const resolveConfiguredVirtualDirectory = (
    segments: string[]
  ): ResolvedVirtualDirectory | undefined => {
    if (!storageRules) {
      return segments.length === 1
        ? {
            virtualDirectoryPath: '/',
            relativeSegments: segments,
          }
        : undefined;
    }

    for (const configuredDirectory of configuredStorageDirectories) {
      if (configuredDirectory.segments.length >= segments.length) {
        continue;
      }
      if (
        configuredDirectory.segments.every(
          (segment, index) => segments[index] === segment
        )
      ) {
        return {
          virtualDirectoryPath: configuredDirectory.directoryPath,
          relativeSegments: segments.slice(configuredDirectory.segments.length),
          rule: configuredDirectory.rule,
        };
      }
    }

    return undefined;
  };

  const resolveReadablePublicPath = (
    rawPublicPath: string
  ): NormalizedPublicPath | undefined => {
    let normalizedPath: NormalizedPublicPath;
    try {
      normalizedPath = normalizeStoredPublicPath(rawPublicPath);
    } catch {
      return undefined;
    }
    const resolution = resolveConfiguredVirtualDirectory(
      normalizedPath.segments
    );
    return resolution
      ? createResolvedPublicPath(normalizedPath, resolution)
      : undefined;
  };

  const resolvePublicPathForPermission = (
    rawPublicPath: string,
    permission: StoragePermission
  ): NormalizedPublicPath => {
    const normalizedPath = normalizeStoredPublicPath(rawPublicPath);
    const resolution = resolveConfiguredVirtualDirectory(
      normalizedPath.segments
    );

    if (!resolution) {
      if (!hasStorageRules) {
        throw new Error(
          'Subdirectories require storage rules to be configured'
        );
      }
      throw new Error('Upload directory is not defined in storage rules');
    }

    if (!isPermissionAccepted(resolution.rule, permission)) {
      throw new Error(getPermissionDeniedMessage(permission));
    }

    return createResolvedPublicPath(normalizedPath, resolution);
  };

  const isPublicPathAcceptedForPermission = (
    rawPublicPath: string,
    permission: StoragePermission
  ): boolean => {
    const normalizedPath = resolveReadablePublicPath(rawPublicPath);
    return normalizedPath
      ? isPermissionAccepted(normalizedPath.storageRule, permission)
      : false;
  };

  const getAvailableUploadDirectoryDetails =
    (): StorageDirectoryDescriptor[] => {
      if (!storageRules) {
        return [
          {
            directoryPath: '/',
          },
        ];
      }

      return Object.entries(storageRules)
        .filter(([, rule]) => isPermissionAccepted(rule, 'store'))
        .map(([directoryPath, rule]) => ({
          directoryPath,
          ...createDirectoryDescriptionFields(rule.description),
        }))
        .sort((left, right) => {
          if (left.directoryPath === '/') {
            return -1;
          }
          if (right.directoryPath === '/') {
            return 1;
          }
          return left.directoryPath.localeCompare(right.directoryPath);
        });
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

  const removeVersionFiles = async (
    absoluteFilePath: string
  ): Promise<void> => {
    const versionDirectoryPath = path.dirname(absoluteFilePath);
    let directory: string;
    try {
      directory = await resolveStoragePath(
        storageRoot,
        path.relative(storageRoot, versionDirectoryPath)
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    // A version directory can also contain file groups for nested public paths.
    await fs.rm(path.join(directory, 'metadata.json'), {
      force: true,
    });
    await fs.rm(path.join(directory, path.basename(absoluteFilePath)), {
      force: true,
    });
    await cleanupEmptyDirectories(versionDirectoryPath, storageRoot);
  };

  const isExpired = (
    expireSeconds: number | undefined,
    uploadedAtMs: number,
    nowMs: number
  ): boolean =>
    expireSeconds !== undefined && uploadedAtMs + expireSeconds * 1000 <= nowMs;

  const createVersionInfo = (
    normalizedPath: NormalizedPublicPath,
    version: InternalStoredFileVersion
  ): StoredFileVersionInfo => ({
    ...normalizeStoredUploadMetadata(version),
    uploadId: version.uploadId,
    uploadedAt: version.uploadedAt,
    size: version.size,
    versionDownloadPath: buildFileDownloadPath(
      normalizedPath.publicPath,
      version.uploadId
    ),
  });

  const createGroupSummaryInfo = (
    normalizedPath: NormalizedPublicPath,
    latestVersion: InternalStoredFileVersion
  ): StoredFileGroupSummaryInfo => ({
    publicPath: normalizedPath.publicPath,
    displayPath: normalizedPath.displayPath,
    directoryPath: normalizedPath.directoryPath,
    browseDirectoryPath: normalizedPath.virtualDirectoryPath,
    browseRelativePath: normalizedPath.relativePath,
    fileName: normalizedPath.fileName,
    latestUploadId: latestVersion.uploadId,
    latestUploadedAt: latestVersion.uploadedAt,
    latestDownloadPath: buildFileDownloadPath(
      normalizedPath.publicPath,
      undefined
    ),
  });

  const createStoredVersion = (
    normalizedPath: NormalizedPublicPath,
    version: InternalStoredFileVersion
  ): StoredFileVersion => ({
    ...normalizeStoredUploadMetadata(version),
    uploadId: version.uploadId,
    uploadedAt: version.uploadedAt,
    size: version.size,
    absoluteFilePath: version.absoluteFilePath,
    fileName: normalizedPath.fileName,
    publicPath: normalizedPath.publicPath,
    displayPath: normalizedPath.displayPath,
    directoryPath: normalizedPath.directoryPath,
    latestDownloadPath: buildFileDownloadPath(
      normalizedPath.publicPath,
      undefined
    ),
    versionDownloadPath: buildFileDownloadPath(
      normalizedPath.publicPath,
      version.uploadId
    ),
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

    const metadataFilePath = path.join(versionDirectoryPath, 'metadata.json');
    let metadata: StoredUploadMetadata;
    try {
      const { file } = await openStorageFile(
        storageRoot,
        path.relative(storageRoot, metadataFilePath)
      );
      try {
        metadata = parseStoredUploadMetadata(
          JSON.parse(await file.readFile('utf8'))
        );
      } finally {
        await file.close();
      }
    } catch {
      return undefined;
    }

    const absoluteFilePath = path.join(
      versionDirectoryPath,
      normalizedPath.fileName
    );
    let stat;
    try {
      const opened = await openStorageFile(
        storageRoot,
        path.relative(storageRoot, absoluteFilePath)
      );
      stat = opened.stats;
      await opened.file.close();
    } catch {
      return undefined;
    }

    if (
      isExpired(
        normalizedPath.storageRule?.expireSeconds,
        uploadIdParts.timestamp,
        nowMs
      )
    ) {
      logger.info(
        `Removing expired upload: ${normalizedPath.displayPath} (${uploadId})`
      );
      await removeVersionFiles(absoluteFilePath);
      return undefined;
    }

    return {
      ...metadata,
      uploadId,
      uploadedAt: dayjs.utc(uploadIdParts.timestamp).toISOString(),
      uploadedAtMs: uploadIdParts.timestamp,
      size: stat.size,
      absoluteFilePath,
    };
  };

  const scanGroupDirectory = async (
    normalizedPath: NormalizedPublicPath,
    versionEntries: Dirent[]
  ): Promise<InternalStoredFileVersion[]> => {
    const groupDirectoryPath = getGroupDirectoryPath(normalizedPath);
    const nowMs = Date.now();
    const versions: InternalStoredFileVersion[] = [];

    for (const entry of versionEntries) {
      if (!entry.isDirectory() || !uploadIdPattern.test(entry.name)) {
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
    versionEntries: Dirent[]
  ): Promise<StoredFileGroupSummaryInfo | undefined> => {
    const groupDirectoryPath = getGroupDirectoryPath(normalizedPath);
    const nowMs = Date.now();
    let latestVersion: InternalStoredFileVersion | undefined;

    for (const entry of versionEntries) {
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
      ? createGroupSummaryInfo(normalizedPath, latestVersion)
      : undefined;
  };

  const createGroupInfo = (
    normalizedPath: NormalizedPublicPath,
    versions: InternalStoredFileVersion[]
  ): InternalStoredFileGroupInfo => {
    const latestVersion = versions[0]!;
    return {
      publicPath: normalizedPath.publicPath,
      displayPath: normalizedPath.displayPath,
      directoryPath: normalizedPath.directoryPath,
      browseDirectoryPath: normalizedPath.virtualDirectoryPath,
      browseRelativePath: normalizedPath.relativePath,
      fileName: normalizedPath.fileName,
      latestUploadId: latestVersion.uploadId,
      latestUploadedAt: latestVersion.uploadedAt,
      latestDownloadPath: buildFileDownloadPath(
        normalizedPath.publicPath,
        undefined
      ),
      versions: versions.map((version) =>
        createVersionInfo(normalizedPath, version)
      ),
    };
  };

  const toStoredFileGroupInfo = (
    group: InternalStoredFileGroupInfo
  ): StoredFileGroupInfo => ({
    publicPath: group.publicPath,
    displayPath: group.displayPath,
    directoryPath: group.directoryPath,
    fileName: group.fileName,
    latestUploadId: group.latestUploadId,
    latestUploadedAt: group.latestUploadedAt,
    latestDownloadPath: group.latestDownloadPath,
    versions: group.versions,
  });

  const toGroupSummaryInfo = (
    group: InternalStoredFileGroupInfo
  ): StoredFileGroupSummaryInfo => ({
    publicPath: group.publicPath,
    displayPath: group.displayPath,
    directoryPath: group.directoryPath,
    browseDirectoryPath: group.browseDirectoryPath,
    browseRelativePath: group.browseRelativePath,
    fileName: group.fileName,
    latestUploadId: group.latestUploadId,
    latestUploadedAt: group.latestUploadedAt,
    latestDownloadPath: group.latestDownloadPath,
  });

  const visitFileGroups = async (
    visit: (
      group: NormalizedPublicPath,
      versionEntries: Dirent[]
    ) => Promise<void>
  ): Promise<void> => {
    const walk = async (
      directoryPath: string,
      publicPath: string
    ): Promise<void> => {
      const entries = await safeReadDirectory(directoryPath);
      const directories = entries.filter((entry) => entry.isDirectory());
      if (publicPath) {
        const versions = directories.filter((entry) =>
          uploadIdPattern.test(entry.name)
        );
        if (versions.length > 0) {
          const normalizedPath = resolveReadablePublicPath(publicPath);
          if (normalizedPath) {
            await visit(normalizedPath, versions);
          }
        }
        if (!hasStorageRules) {
          return;
        }
      }

      // A file group may have both versions of its own and nested file groups.
      for (const entry of directories) {
        if (!hasStorageRules && entry.name.startsWith('.')) {
          continue;
        }
        await walk(
          path.join(directoryPath, entry.name),
          publicPath ? `${publicPath}/${entry.name}` : entry.name
        );
      }
    };
    await walk(storageRoot, '');
  };

  const scanAllGroups = async (): Promise<InternalStoredFileGroupInfo[]> => {
    const groups: InternalStoredFileGroupInfo[] = [];
    await visitFileGroups(async (normalizedPath, entries) => {
      const versions = await scanGroupDirectory(normalizedPath, entries);
      if (versions.length > 0) {
        groups.push(createGroupInfo(normalizedPath, versions));
      }
    });
    groups.sort((left, right) =>
      compareUploadIdsDescending(left.latestUploadId, right.latestUploadId)
    );
    return groups;
  };

  const scanAllGroupSummaries = async (): Promise<
    StoredFileGroupSummaryInfo[]
  > => {
    const groups: StoredFileGroupSummaryInfo[] = [];
    await visitFileGroups(async (normalizedPath, entries) => {
      const summary = await scanGroupDirectorySummary(normalizedPath, entries);
      if (summary) {
        groups.push(summary);
      }
    });
    groups.sort((left, right) =>
      compareUploadIdsDescending(left.latestUploadId, right.latestUploadId)
    );
    return groups;
  };

  const resolveStoredVersion = async (
    rawPublicPath: string,
    uploadId: string | undefined
  ): Promise<StoredFileVersion | undefined> => {
    const normalizedPath = resolveReadablePublicPath(rawPublicPath);
    if (!normalizedPath) {
      return undefined;
    }
    const groupDirectoryPath = getGroupDirectoryPath(normalizedPath);
    const versions = await scanGroupDirectory(
      normalizedPath,
      await safeReadDirectory(groupDirectoryPath)
    );

    if (versions.length === 0) {
      return undefined;
    }

    const version = uploadId
      ? versions.find((candidate) => candidate.uploadId === uploadId)
      : versions[0];

    return version ? createStoredVersion(normalizedPath, version) : undefined;
  };

  const createVersionDirectory = async (
    groupDirectoryPath: string
  ): Promise<{ uploadId: string; versionDirectoryPath: string }> => {
    const baseId = dayjs().utc().format('YYYYMMDD_HHmmss_SSS');

    for (let sequence = 0; ; sequence++) {
      const uploadId = sequence === 0 ? baseId : `${baseId}_${sequence}`;
      const versionDirectoryPath = path.join(groupDirectoryPath, uploadId);
      try {
        // Creating the directory reserves this ID across all storage writers.
        await fs.mkdir(versionDirectoryPath);
        return { uploadId, versionDirectoryPath };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }
    }
  };

  return {
    initialize: async () => {
      await fs.mkdir(storageRoot, { recursive: true });
    },

    getAvailableUploadDirectories: () => {
      return getAvailableUploadDirectoryDetails().map(
        (directory) => directory.directoryPath
      );
    },

    getAvailableUploadDirectoryDetails,

    isPublicPathAcceptedForPermission,

    listBrowseDirectories: async () => {
      const groups = await scanAllGroupSummaries();
      const fileGroupCounts = new Map<string, number>();

      groups.forEach((group) => {
        fileGroupCounts.set(
          group.browseDirectoryPath,
          (fileGroupCounts.get(group.browseDirectoryPath) ?? 0) + 1
        );
      });

      return getConfiguredDirectoryPaths().map((directoryPath) => ({
        directoryPath,
        ...createDirectoryDescriptionFields(
          storageRules?.[directoryPath]?.description
        ),
        accept: getAcceptedPermissions(storageRules?.[directoryPath]),
        fileGroupCount: fileGroupCounts.get(directoryPath) ?? 0,
      }));
    },

    listDirectoryFileGroups: async (rawDirectoryPath: string) => {
      const directoryPath = normalizeDirectoryPath(rawDirectoryPath);
      ensureDirectoryDefined(directoryPath);

      const groups = await scanAllGroupSummaries();
      return groups.filter(
        (group) => group.browseDirectoryPath === directoryPath
      );
    },

    listFileGroupVersions: async (rawPublicPath: string) => {
      const normalizedPath = resolveReadablePublicPath(rawPublicPath);
      if (!normalizedPath) {
        return [];
      }
      const groupDirectoryPath = getGroupDirectoryPath(normalizedPath);
      const versions = await scanGroupDirectory(
        normalizedPath,
        await safeReadDirectory(groupDirectoryPath)
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
            return group.versions.some(
              (version) =>
                version.uploadId.toLowerCase().includes(term) ||
                version.uploadedBy?.toLowerCase().includes(term) === true ||
                version.tags?.some((tag) =>
                  tag.toLowerCase().includes(term)
                ) === true
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
        items: groups
          .slice(safeSkip, safeSkip + safeTake)
          .map((group) => toStoredFileGroupInfo(group)),
      };
    },

    storeFile: async (
      rawPublicPath: string,
      fileContent: Buffer,
      metadata?: StoredUploadMetadata
    ) => {
      const normalizedPath = resolvePublicPathForPermission(
        rawPublicPath,
        'store'
      );

      const groupDirectoryPath = await prepareStorageDirectory(
        storageRoot,
        normalizedPath.segments
      );
      const normalizedMetadata = normalizeStoredUploadMetadata(metadata);
      const { uploadId, versionDirectoryPath } =
        await createVersionDirectory(groupDirectoryPath);
      const absoluteFilePath = path.join(
        versionDirectoryPath,
        normalizedPath.fileName
      );
      try {
        await fs.writeFile(absoluteFilePath, fileContent, { flag: 'wx' });
        // Readers recognize the version when its metadata is present.
        await fs.writeFile(
          path.join(versionDirectoryPath, 'metadata.json'),
          JSON.stringify(normalizedMetadata),
          { flag: 'wx' }
        );
      } catch (error) {
        await removeVersionFiles(
          path.join(
            getGroupDirectoryPath(normalizedPath),
            uploadId,
            normalizedPath.fileName
          )
        );
        throw error;
      }

      const storedVersion = await resolveStoredVersion(
        normalizedPath.publicPath,
        uploadId
      );
      if (!storedVersion) {
        throw new Error('Stored file version could not be resolved');
      }

      return {
        ...normalizeStoredUploadMetadata(storedVersion),
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

    deleteFileVersion: async (rawPublicPath: string, uploadId: string) => {
      if (!parseUploadId(uploadId)) {
        return false;
      }

      const normalizedPath = resolvePublicPathForPermission(
        rawPublicPath,
        'delete'
      );
      const storedVersion = await resolveStoredVersion(
        normalizedPath.publicPath,
        uploadId
      );
      if (!storedVersion) {
        return false;
      }

      await removeVersionFiles(storedVersion.absoluteFilePath);
      return true;
    },

    getLatestFileVersion: async (rawPublicPath: string) =>
      await resolveStoredVersion(rawPublicPath, undefined),

    getFileVersion: async (rawPublicPath: string, uploadId: string) =>
      await resolveStoredVersion(rawPublicPath, uploadId),
  };
};
