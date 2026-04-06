// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import JSON5 from 'json5';
import { createReaderWriterLock } from 'async-primitives';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import {
  FileGroup,
  FileListResponse,
  FileRevision,
  Logger,
  StorageEntryConfig,
} from '../types';
import {
  compareUploadIdsDesc,
  createUploadIdBase,
  extractUploadedAtFromUploadId,
} from '../utils/fileId';
import {
  decodeHeaderFileName,
  parseVirtualFileName,
  ParsedVirtualFileName,
  resolveStoragePolicy,
} from '../utils/storagePolicy';
import { buildFileRoutePath } from '../utils/fileRoutePath';

const managedStorageDirectoryName = '.uplodah';
const managedGroupDirectoryName = 'groups';
const managedRootDirectoryName = 'root';
const managedTreeDirectoryName = 'tree';
const uploadMetadataFileName = 'metadata.json';

interface CreateFileServiceOptions {
  storageDir: string;
  logger: Logger;
  storage: Record<string, StorageEntryConfig> | undefined;
}

interface SaveFileInput {
  fileName: string;
  content: Buffer;
  baseUrl: string;
}

interface ResolveFileInput {
  groupId: string;
  uploadId: string | undefined;
}

interface UploadTargetDirectory {
  groupDirectoryPath: string;
  pruneStopDirectoryPath: string;
}

/**
 * Resolved file download target.
 */
export interface DownloadTarget {
  /**
   * File name suggested to download clients.
   */
  fileName: string;
  /**
   * Absolute payload path on disk.
   */
  filePath: string;
  /**
   * Upload timestamp in ISO 8601 UTC.
   */
  uploadedAt: string;
  /**
   * File size in bytes.
   */
  size: number;
}

/**
 * File catalog service backed only by the filesystem.
 */
export interface FileService {
  /**
   * Ensures the storage root exists.
   */
  initialize: () => Promise<void>;
  /**
   * Saves an uploaded file as a new revision.
   * @param input Save parameters.
   * @returns Stored revision metadata.
   */
  saveFile: (input: SaveFileInput) => Promise<FileRevision>;
  /**
   * Lists all grouped files sorted by latest upload.
   * @param baseUrl Base URL used to generate download links.
   * @returns Grouped file metadata.
   */
  listFiles: (
    baseUrl: string,
    skip: number,
    take: number
  ) => Promise<FileListResponse>;
  /**
   * Resolves a revision into an absolute download target.
   * @param input Resolve parameters.
   * @returns Download target or undefined when not found.
   */
  resolveFile: (input: ResolveFileInput) => Promise<DownloadTarget | undefined>;
  /**
   * Returns the earliest expiration time among all managed uploads.
   * @returns Expiration time or undefined when no expiring upload exists.
   */
  getNextExpiringUploadAt: () => Promise<Date | undefined>;
  /**
   * Deletes all uploads that have expired by the given time.
   * @param now Current wall clock time.
   * @returns Number of deleted revisions.
   */
  deleteExpiredFiles: (now: Date) => Promise<number>;
}

interface IndexedFileRevision {
  groupId: string;
  uploadId: string;
  fileName: string;
  storedFileName: string;
  uploadedAt: string;
  expiresAtMs: number | undefined;
  size: number;
  filePath: string;
  pruneStopDirectoryPath: string;
}

interface IndexedFileGroup {
  groupId: string;
  fileName: string;
  latestUploadId: string;
  latestUploadedAt: string;
  totalSize: number;
  versions: IndexedFileRevision[];
}

const buildLatestDownloadRoute = (groupId: string): string =>
  `api/files/${buildFileRoutePath(groupId)}`;

const buildVersionDownloadRoute = (groupId: string, uploadId: string): string =>
  `${buildLatestDownloadRoute(groupId)}/${encodeURIComponent(uploadId)}`;

const resolveRouteUrl = (baseUrl: string, routePath: string): URL =>
  new URL(routePath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

const buildDownloadReferences = (
  baseUrl: string,
  groupId: string,
  uploadId: string
): Pick<
  FileRevision,
  'downloadPath' | 'downloadUrl' | 'latestDownloadPath' | 'latestDownloadUrl'
> => {
  const latestUrl = resolveRouteUrl(baseUrl, buildLatestDownloadRoute(groupId));
  const versionUrl = resolveRouteUrl(
    baseUrl,
    buildVersionDownloadRoute(groupId, uploadId)
  );

  return {
    downloadPath: versionUrl.pathname,
    downloadUrl: versionUrl.toString(),
    latestDownloadPath: latestUrl.pathname,
    latestDownloadUrl: latestUrl.toString(),
  };
};

const validateUploadId = (uploadId: string): string => {
  if (
    uploadId.length === 0 ||
    uploadId.includes('/') ||
    uploadId.includes('\\') ||
    uploadId.includes('..')
  ) {
    throw new Error('Invalid upload identifier');
  }
  return uploadId;
};

const resolveManagedGroupDirectoryPath = (
  storageDir: string,
  parsedFileName: ParsedVirtualFileName
): UploadTargetDirectory => {
  const managedGroupsRootDirectoryPath = path.join(
    storageDir,
    managedStorageDirectoryName,
    managedGroupDirectoryName
  );

  if (parsedFileName.directoryPath === '/') {
    return {
      groupDirectoryPath: path.join(
        managedGroupsRootDirectoryPath,
        managedRootDirectoryName,
        parsedFileName.storedFileName
      ),
      pruneStopDirectoryPath: path.join(
        managedGroupsRootDirectoryPath,
        managedRootDirectoryName
      ),
    };
  }

  return {
    groupDirectoryPath: path.join(
      managedGroupsRootDirectoryPath,
      managedTreeDirectoryName,
      ...parsedFileName.pathSegments
    ),
    pruneStopDirectoryPath: path.join(
      managedGroupsRootDirectoryPath,
      managedTreeDirectoryName
    ),
  };
};

const safeReadDirectory = async (directoryPath: string) => {
  try {
    return await readdir(directoryPath, {
      withFileTypes: true,
    });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const safeReadFile = async (filePath: string): Promise<string | undefined> => {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const pruneEmptyDirectories = async (
  startDirectoryPath: string,
  stopDirectoryPath: string
): Promise<void> => {
  let currentDirectoryPath = startDirectoryPath;

  while (
    currentDirectoryPath !== stopDirectoryPath &&
    currentDirectoryPath.startsWith(`${stopDirectoryPath}${path.sep}`)
  ) {
    try {
      const entries = await readdir(currentDirectoryPath);
      if (entries.length > 0) {
        return;
      }
      await rm(currentDirectoryPath, {
        recursive: true,
        force: true,
      });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    currentDirectoryPath = path.dirname(currentDirectoryPath);
  }
};

const normalizeUploadFileName = (input: {
  fileName: string;
  storage: Record<string, StorageEntryConfig> | undefined;
}): ParsedVirtualFileName => {
  const decodedFileName = decodeHeaderFileName(input.fileName);
  const trimmedFileName = decodedFileName.trim();

  if (!input.storage) {
    if (trimmedFileName.includes('/')) {
      throw new Error(
        'Only plain file names are allowed when storage rules are not configured'
      );
    }

    return parseVirtualFileName(trimmedFileName);
  }

  const parsedFileName = parseVirtualFileName(trimmedFileName);
  const storagePolicy = resolveStoragePolicy(
    input.storage,
    parsedFileName.directoryPath
  );
  if (!storagePolicy) {
    throw new Error(
      `Uploads to ${parsedFileName.directoryPath} are not allowed`
    );
  }
  if (storagePolicy.readonly) {
    throw new Error(`Uploads to ${storagePolicy.directoryPath} are read-only`);
  }

  return parsedFileName;
};

/**
 * Creates a filesystem-backed file service.
 * @param options Service options.
 * @returns File service instance.
 */
export const createFileService = (
  options: CreateFileServiceOptions
): FileService => {
  const { storageDir, logger, storage } = options;

  const indexedGroups = new Map<string, IndexedFileGroup>();
  const cacheLock = createReaderWriterLock();
  let sortedGroupIds: string[] = [];
  let totalFileCount = 0;
  let initialized = false;
  let initializationPromise: Promise<void> | undefined = undefined;

  const resolveExpirationMs = (
    parsedFileName: ParsedVirtualFileName,
    uploadedAt: string
  ): number | undefined => {
    if (storage) {
      const policy = resolveStoragePolicy(
        storage,
        parsedFileName.directoryPath
      );
      return policy?.expireSeconds !== undefined
        ? new Date(uploadedAt).getTime() + policy.expireSeconds * 1000
        : undefined;
    }

    return undefined;
  };

  const loadMetadataIndexedRevision = async (input: {
    metadataFilePath: string;
    scanRootDirectoryPath: string;
    pruneStopDirectoryPath: string;
  }): Promise<IndexedFileRevision | undefined> => {
    const metadataContent = await safeReadFile(input.metadataFilePath);
    if (metadataContent === undefined) {
      return undefined;
    }

    try {
      JSON5.parse(metadataContent);
    } catch (error) {
      logger.warn(`Skipped invalid upload metadata: ${input.metadataFilePath}`);
      return undefined;
    }

    const uploadDirectoryPath = path.dirname(input.metadataFilePath);
    const uploadId = path.basename(uploadDirectoryPath);
    let uploadedAt: string;
    try {
      uploadedAt = extractUploadedAtFromUploadId(uploadId);
    } catch (error) {
      logger.warn(
        `Skipped upload metadata with invalid upload id: ${input.metadataFilePath}`
      );
      return undefined;
    }

    const groupDirectoryPath = path.dirname(uploadDirectoryPath);
    const relativeGroupDirectoryPath = path.relative(
      input.scanRootDirectoryPath,
      groupDirectoryPath
    );
    if (
      relativeGroupDirectoryPath.length === 0 ||
      relativeGroupDirectoryPath.startsWith('..')
    ) {
      logger.warn(
        `Skipped upload metadata outside the storage root: ${input.metadataFilePath}`
      );
      return undefined;
    }

    const groupPathSegments = relativeGroupDirectoryPath
      .split(path.sep)
      .filter((segment) => segment.length > 0);
    if (groupPathSegments.length === 0) {
      return undefined;
    }

    const publicFileName =
      groupPathSegments.length === 1
        ? groupPathSegments[0]!
        : `/${groupPathSegments.join('/')}`;

    let parsedFileName: ParsedVirtualFileName;
    try {
      parsedFileName = parseVirtualFileName(publicFileName);
    } catch (error) {
      logger.warn(
        `Skipped upload metadata with invalid group path: ${input.metadataFilePath}`
      );
      return undefined;
    }

    const payloadPath = path.join(
      uploadDirectoryPath,
      parsedFileName.storedFileName
    );
    try {
      const fileStats = await stat(payloadPath);
      return {
        groupId: parsedFileName.publicFileName,
        uploadId,
        fileName: parsedFileName.publicFileName,
        storedFileName: parsedFileName.storedFileName,
        uploadedAt,
        expiresAtMs: resolveExpirationMs(parsedFileName, uploadedAt),
        size: fileStats.size,
        filePath: payloadPath,
        pruneStopDirectoryPath: input.pruneStopDirectoryPath,
      };
    } catch (error) {
      logger.warn(`Skipped upload metadata without payload: ${payloadPath}`);
      return undefined;
    }
  };

  const walkMetadataIndexedRevisions = async (input: {
    directoryPath: string;
    scanRootDirectoryPath: string;
    pruneStopDirectoryPath: string;
  }): Promise<IndexedFileRevision[]> => {
    const entries = await safeReadDirectory(input.directoryPath);
    const metadataEntry = entries.find(
      (entry) => entry.isFile() && entry.name === uploadMetadataFileName
    );
    if (metadataEntry) {
      const indexedRevision = await loadMetadataIndexedRevision({
        metadataFilePath: path.join(input.directoryPath, metadataEntry.name),
        scanRootDirectoryPath: input.scanRootDirectoryPath,
        pruneStopDirectoryPath: input.pruneStopDirectoryPath,
      });
      return indexedRevision ? [indexedRevision] : [];
    }

    const childRevisions = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          walkMetadataIndexedRevisions({
            directoryPath: path.join(input.directoryPath, entry.name),
            scanRootDirectoryPath: input.scanRootDirectoryPath,
            pruneStopDirectoryPath: input.pruneStopDirectoryPath,
          })
        )
    );

    return childRevisions.flat();
  };

  const loadMetadataIndexedRevisions = async (): Promise<
    IndexedFileRevision[]
  > => {
    const rootEntries = await safeReadDirectory(storageDir);
    const childRevisions = await Promise.all(
      rootEntries
        .filter(
          (entry) =>
            entry.isDirectory() && entry.name !== managedStorageDirectoryName
        )
        .map((entry) =>
          walkMetadataIndexedRevisions({
            directoryPath: path.join(storageDir, entry.name),
            scanRootDirectoryPath: storageDir,
            pruneStopDirectoryPath: storageDir,
          })
        )
    );

    return childRevisions.flat();
  };

  const sortIndexedGroupIds = (): void => {
    sortedGroupIds = Array.from(indexedGroups.values())
      .sort(
        (left, right) =>
          compareUploadIdsDesc(left.latestUploadId, right.latestUploadId) ||
          left.fileName.localeCompare(right.fileName, undefined, {
            sensitivity: 'base',
          })
      )
      .map((group) => group.groupId);
  };

  const toPublicRevision = (
    revision: IndexedFileRevision,
    baseUrl: string
  ): FileRevision => ({
    groupId: revision.groupId,
    uploadId: revision.uploadId,
    fileName: revision.fileName,
    uploadedAt: revision.uploadedAt,
    size: revision.size,
    ...buildDownloadReferences(baseUrl, revision.groupId, revision.uploadId),
  });

  const toPublicGroup = (
    indexedGroup: IndexedFileGroup,
    baseUrl: string
  ): FileGroup => ({
    groupId: indexedGroup.groupId,
    fileName: indexedGroup.fileName,
    latestUploadedAt: indexedGroup.latestUploadedAt,
    versionCount: indexedGroup.versions.length,
    totalSize: indexedGroup.totalSize,
    versions: indexedGroup.versions.map((version) =>
      toPublicRevision(version, baseUrl)
    ),
  });

  const loadIndexedGroup = async (input: {
    parsedFileName: ParsedVirtualFileName;
    groupDirectoryPath: string;
    pruneStopDirectoryPath: string;
  }): Promise<IndexedFileGroup | undefined> => {
    const versionEntries = await safeReadDirectory(input.groupDirectoryPath);

    const versions = (
      await Promise.all(
        versionEntries
          .filter((entry) => entry.isDirectory())
          .map(async (entry): Promise<IndexedFileRevision | undefined> => {
            const uploadId = entry.name;
            const payloadPath = path.join(
              input.groupDirectoryPath,
              uploadId,
              input.parsedFileName.storedFileName
            );

            try {
              const fileStats = await stat(payloadPath);
              const uploadedAt = extractUploadedAtFromUploadId(uploadId);
              return {
                groupId: input.parsedFileName.publicFileName,
                uploadId,
                fileName: input.parsedFileName.publicFileName,
                storedFileName: input.parsedFileName.storedFileName,
                uploadedAt,
                expiresAtMs: resolveExpirationMs(
                  input.parsedFileName,
                  uploadedAt
                ),
                size: fileStats.size,
                filePath: payloadPath,
                pruneStopDirectoryPath: input.pruneStopDirectoryPath,
              };
            } catch (error) {
              logger.warn(`Skipped broken upload entry: ${payloadPath}`);
              return undefined;
            }
          })
      )
    )
      .filter((entry): entry is IndexedFileRevision => entry !== undefined)
      .sort((left, right) =>
        compareUploadIdsDesc(left.uploadId, right.uploadId)
      );

    if (versions.length === 0) {
      return undefined;
    }

    const [latestVersion] = versions;
    if (!latestVersion) {
      return undefined;
    }

    return {
      groupId: latestVersion.groupId,
      fileName: latestVersion.fileName,
      latestUploadId: latestVersion.uploadId,
      latestUploadedAt: latestVersion.uploadedAt,
      totalSize: versions.reduce((sum, version) => sum + version.size, 0),
      versions,
    };
  };

  const addIndexedGroup = (indexedGroup: IndexedFileGroup): void => {
    for (const indexedRevision of indexedGroup.versions) {
      addIndexedRevision(indexedRevision);
    }
  };

  const loadLegacyIndexedGroups = async (): Promise<IndexedFileGroup[]> => {
    const rootEntries = await safeReadDirectory(storageDir);

    const loadedGroups = await Promise.all(
      rootEntries
        .filter(
          (entry) =>
            entry.isDirectory() && entry.name !== managedStorageDirectoryName
        )
        .map(async (entry): Promise<IndexedFileGroup | undefined> => {
          try {
            const parsedFileName = parseVirtualFileName(entry.name);
            return loadIndexedGroup({
              parsedFileName,
              groupDirectoryPath: path.join(storageDir, entry.name),
              pruneStopDirectoryPath: storageDir,
            });
          } catch (error) {
            logger.warn(`Skipped invalid group directory: ${entry.name}`);
            return undefined;
          }
        })
    );

    return loadedGroups.filter(
      (entry): entry is IndexedFileGroup => entry !== undefined
    );
  };

  const loadManagedRootIndexedGroups = async (): Promise<
    IndexedFileGroup[]
  > => {
    const managedRootDirectoryPath = path.join(
      storageDir,
      managedStorageDirectoryName,
      managedGroupDirectoryName,
      managedRootDirectoryName
    );
    const managedRootEntries = await safeReadDirectory(
      managedRootDirectoryPath
    );

    const loadedGroups = await Promise.all(
      managedRootEntries
        .filter((entry) => entry.isDirectory())
        .map(async (entry): Promise<IndexedFileGroup | undefined> => {
          try {
            const parsedFileName = parseVirtualFileName(entry.name);
            return loadIndexedGroup({
              parsedFileName,
              groupDirectoryPath: path.join(
                managedRootDirectoryPath,
                entry.name
              ),
              pruneStopDirectoryPath: managedRootDirectoryPath,
            });
          } catch (error) {
            logger.warn(`Skipped invalid managed root group: ${entry.name}`);
            return undefined;
          }
        })
    );

    return loadedGroups.filter(
      (entry): entry is IndexedFileGroup => entry !== undefined
    );
  };

  const isManagedGroupDirectory = async (
    directoryPath: string,
    relativeSegments: string[]
  ): Promise<boolean> => {
    const storedFileName = relativeSegments[relativeSegments.length - 1];
    if (!storedFileName) {
      return false;
    }

    const entries = (await safeReadDirectory(directoryPath)).filter((entry) =>
      entry.isDirectory()
    );
    if (entries.length === 0) {
      return false;
    }

    const payloadChecks = await Promise.all(
      entries.map(async (entry) => {
        try {
          const payloadPath = path.join(
            directoryPath,
            entry.name,
            storedFileName
          );
          const fileStats = await stat(payloadPath);
          return fileStats.isFile();
        } catch (error) {
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code === 'ENOENT') {
            return false;
          }
          throw error;
        }
      })
    );

    return payloadChecks.some((matched) => matched);
  };

  const walkManagedTreeIndexedGroups = async (
    directoryPath: string,
    relativeSegments: string[],
    pruneStopDirectoryPath: string
  ): Promise<IndexedFileGroup[]> => {
    const entries = (await safeReadDirectory(directoryPath)).filter((entry) =>
      entry.isDirectory()
    );
    if (entries.length === 0) {
      return [];
    }

    if (await isManagedGroupDirectory(directoryPath, relativeSegments)) {
      try {
        const parsedFileName = parseVirtualFileName(
          `/${relativeSegments.join('/')}`
        );
        const indexedGroup = await loadIndexedGroup({
          parsedFileName,
          groupDirectoryPath: directoryPath,
          pruneStopDirectoryPath,
        });
        return indexedGroup ? [indexedGroup] : [];
      } catch (error) {
        logger.warn(
          `Skipped invalid managed tree group: /${relativeSegments.join('/')}`
        );
        return [];
      }
    }

    const childGroups = await Promise.all(
      entries.map((entry) =>
        walkManagedTreeIndexedGroups(
          path.join(directoryPath, entry.name),
          [...relativeSegments, entry.name],
          pruneStopDirectoryPath
        )
      )
    );

    return childGroups.flat();
  };

  const loadManagedTreeIndexedGroups = async (): Promise<
    IndexedFileGroup[]
  > => {
    const managedTreeDirectoryPath = path.join(
      storageDir,
      managedStorageDirectoryName,
      managedGroupDirectoryName,
      managedTreeDirectoryName
    );
    return walkManagedTreeIndexedGroups(
      managedTreeDirectoryPath,
      [],
      managedTreeDirectoryPath
    );
  };

  const rebuildIndex = async (): Promise<void> => {
    await mkdir(storageDir, { recursive: true });

    indexedGroups.clear();
    sortedGroupIds = [];
    totalFileCount = 0;

    const [metadataRevisions, ...loadedGroups] = await Promise.all([
      loadMetadataIndexedRevisions(),
      loadLegacyIndexedGroups(),
      loadManagedRootIndexedGroups(),
      loadManagedTreeIndexedGroups(),
    ]);

    for (const indexedRevision of metadataRevisions) {
      addIndexedRevision(indexedRevision);
    }
    for (const indexedGroup of loadedGroups.flat()) {
      addIndexedGroup(indexedGroup);
    }

    sortIndexedGroupIds();
    initialized = true;
  };

  const initialize = (): Promise<void> => {
    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      const handle = await cacheLock.writeLock();
      try {
        await rebuildIndex();
      } finally {
        handle.release();
        initializationPromise = undefined;
      }
    })();

    return initializationPromise;
  };

  const ensureInitialized = async (): Promise<void> => {
    if (!initialized) {
      await initialize();
    }
  };

  const resolveUploadTargetDirectory = (
    parsedFileName: ParsedVirtualFileName
  ): UploadTargetDirectory => {
    if (storage) {
      return resolveManagedGroupDirectoryPath(storageDir, parsedFileName);
    }

    return {
      groupDirectoryPath: path.join(storageDir, parsedFileName.storedFileName),
      pruneStopDirectoryPath: storageDir,
    };
  };

  const createUniqueUploadDirectory = async (
    groupDirectoryPath: string,
    uploadedAt: Date
  ): Promise<{ uploadId: string; targetDir: string }> => {
    const uploadIdBase = createUploadIdBase(uploadedAt);

    await mkdir(groupDirectoryPath, { recursive: true });

    for (let attempt = 0; ; attempt++) {
      const uploadId =
        attempt === 0 ? uploadIdBase : `${uploadIdBase}_${attempt}`;
      const targetDir = path.join(groupDirectoryPath, uploadId);

      try {
        await mkdir(targetDir);
        return {
          uploadId,
          targetDir,
        };
      } catch (error) {
        const errno = error as NodeJS.ErrnoException;
        if (errno.code === 'EEXIST') {
          continue;
        }
        throw error;
      }
    }
  };

  const addIndexedRevision = (indexedRevision: IndexedFileRevision): void => {
    const existingGroup = indexedGroups.get(indexedRevision.groupId);
    if (existingGroup) {
      const alreadyExists = existingGroup.versions.some(
        (version) => version.uploadId === indexedRevision.uploadId
      );
      if (alreadyExists) {
        return;
      }
      existingGroup.versions.push(indexedRevision);
      existingGroup.versions.sort((left, right) =>
        compareUploadIdsDesc(left.uploadId, right.uploadId)
      );
      existingGroup.latestUploadId = existingGroup.versions[0]!.uploadId;
      existingGroup.latestUploadedAt = existingGroup.versions[0]!.uploadedAt;
      existingGroup.totalSize += indexedRevision.size;
    } else {
      indexedGroups.set(indexedRevision.groupId, {
        groupId: indexedRevision.groupId,
        fileName: indexedRevision.fileName,
        latestUploadId: indexedRevision.uploadId,
        latestUploadedAt: indexedRevision.uploadedAt,
        totalSize: indexedRevision.size,
        versions: [indexedRevision],
      });
    }

    totalFileCount += 1;
    sortIndexedGroupIds();
  };

  const saveFile = async (input: SaveFileInput): Promise<FileRevision> => {
    await ensureInitialized();

    const handle = await cacheLock.writeLock();
    try {
      const parsedFileName = normalizeUploadFileName({
        fileName: input.fileName,
        storage,
      });
      const uploadDate = new Date();
      const uploadedAt = uploadDate.toISOString();
      const uploadTargetDirectory =
        resolveUploadTargetDirectory(parsedFileName);
      const { uploadId, targetDir } = await createUniqueUploadDirectory(
        uploadTargetDirectory.groupDirectoryPath,
        uploadDate
      );
      const targetFilePath = path.join(
        targetDir,
        parsedFileName.storedFileName
      );
      const targetMetadataPath = path.join(targetDir, uploadMetadataFileName);

      await Promise.all([
        writeFile(targetFilePath, input.content),
        writeFile(targetMetadataPath, '{}\n', 'utf8'),
      ]);

      const indexedRevision: IndexedFileRevision = {
        groupId: parsedFileName.publicFileName,
        uploadId,
        fileName: parsedFileName.publicFileName,
        storedFileName: parsedFileName.storedFileName,
        uploadedAt,
        expiresAtMs: resolveExpirationMs(parsedFileName, uploadedAt),
        size: input.content.length,
        filePath: targetFilePath,
        pruneStopDirectoryPath: uploadTargetDirectory.pruneStopDirectoryPath,
      };

      addIndexedRevision(indexedRevision);
      logger.info(
        `Stored upload: ${parsedFileName.publicFileName} (${uploadId})`
      );

      return toPublicRevision(indexedRevision, input.baseUrl);
    } finally {
      handle.release();
    }
  };

  const listFiles = async (
    baseUrl: string,
    skip: number,
    take: number
  ): Promise<FileListResponse> => {
    await ensureInitialized();

    const handle = await cacheLock.readLock();
    try {
      const normalizedSkip = Math.max(0, skip);
      const normalizedTake = Math.max(1, take);
      const groups = sortedGroupIds
        .slice(normalizedSkip, normalizedSkip + normalizedTake)
        .map((groupId) => indexedGroups.get(groupId))
        .filter((group): group is IndexedFileGroup => group !== undefined)
        .map((group) => toPublicGroup(group, baseUrl));

      return {
        groups,
        totalGroups: indexedGroups.size,
        totalFiles: totalFileCount,
        skip: normalizedSkip,
        take: normalizedTake,
      };
    } finally {
      handle.release();
    }
  };

  const resolveFileFromIndex = (
    groupId: string,
    uploadId: string | undefined
  ): IndexedFileRevision | undefined => {
    const indexedGroup = indexedGroups.get(groupId);
    if (!indexedGroup) {
      return undefined;
    }

    if (uploadId === undefined) {
      return indexedGroup.versions[0];
    }

    return indexedGroup.versions.find(
      (version) => version.uploadId === uploadId
    );
  };

  const resolveFile = async (
    input: ResolveFileInput
  ): Promise<DownloadTarget | undefined> => {
    await ensureInitialized();

    let parsedFileName: ParsedVirtualFileName;
    let uploadId: string | undefined;
    try {
      parsedFileName = parseVirtualFileName(input.groupId);
      uploadId =
        input.uploadId === undefined
          ? undefined
          : validateUploadId(input.uploadId);
    } catch (error) {
      return undefined;
    }

    const handle = await cacheLock.readLock();
    try {
      const indexedRevision = resolveFileFromIndex(
        parsedFileName.publicFileName,
        uploadId
      );
      if (!indexedRevision) {
        return undefined;
      }

      try {
        const fileStats = await stat(indexedRevision.filePath);
        return {
          fileName: indexedRevision.storedFileName,
          filePath: indexedRevision.filePath,
          uploadedAt: indexedRevision.uploadedAt,
          size: fileStats.size,
        };
      } catch (error) {
        return undefined;
      }
    } finally {
      handle.release();
    }
  };

  const getNextExpiringUploadAt = async (): Promise<Date | undefined> => {
    await ensureInitialized();

    const handle = await cacheLock.readLock();
    try {
      let nextExpirationMs: number | undefined = undefined;

      for (const group of indexedGroups.values()) {
        for (const version of group.versions) {
          if (version.expiresAtMs === undefined) {
            continue;
          }
          if (
            nextExpirationMs === undefined ||
            version.expiresAtMs < nextExpirationMs
          ) {
            nextExpirationMs = version.expiresAtMs;
          }
        }
      }

      return nextExpirationMs === undefined
        ? undefined
        : new Date(nextExpirationMs);
    } finally {
      handle.release();
    }
  };

  const deleteExpiredFiles = async (now: Date): Promise<number> => {
    await ensureInitialized();

    const handle = await cacheLock.writeLock();
    try {
      const expiredRevisions = Array.from(indexedGroups.values()).flatMap(
        (group) =>
          group.versions.filter(
            (version) =>
              version.expiresAtMs !== undefined &&
              version.expiresAtMs <= now.getTime()
          )
      );

      if (expiredRevisions.length === 0) {
        return 0;
      }

      for (const revision of expiredRevisions) {
        const uploadDirectoryPath = path.dirname(revision.filePath);
        const groupDirectoryPath = path.dirname(uploadDirectoryPath);
        await rm(uploadDirectoryPath, {
          recursive: true,
          force: true,
        });
        await pruneEmptyDirectories(
          groupDirectoryPath,
          revision.pruneStopDirectoryPath
        );
        logger.info(
          `Deleted expired upload: ${revision.fileName} (${revision.uploadId})`
        );
      }

      await rebuildIndex();
      return expiredRevisions.length;
    } finally {
      handle.release();
    }
  };

  return {
    initialize,
    saveFile,
    listFiles,
    resolveFile,
    getNextExpiringUploadAt,
    deleteExpiredFiles,
  };
};
