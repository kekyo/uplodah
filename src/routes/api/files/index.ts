// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ReaderWriterLock } from 'async-primitives';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Logger } from '../../../types';
import { AuthService } from '../../../services/authService';
import {
  AuthenticatedFastifyRequest,
  createConditionalHybridAuthMiddleware,
  FastifyAuthConfig,
} from '../../../middleware/fastifyAuth';
import {
  StorageService,
  StoredFileGroupInfo,
  StoredFileVersionInfo,
} from '../../../services/storageService';
import { createUrlResolver } from '../../../utils/urlResolver';
import { streamFile } from '../../../utils/fileStreaming';
import {
  createZipArchiveFile,
  ZipArchiveEntry,
} from '../../../utils/zipArchive';
import { canDeleteStoredVersion } from '../../../utils/storageAccess';

dayjs.extend(utc);

/**
 * Files routes configuration.
 */
export interface FilesRoutesConfig {
  storageService: StorageService;
  authService: AuthService;
  authConfig: FastifyAuthConfig;
  logger: Logger;
  urlResolver: ReturnType<typeof createUrlResolver>;
  realm: string;
  maxDownloadSizeMb: number;
}

/**
 * File version selected for an archive download.
 */
export interface FileArchiveSelectionItem {
  /** Public file path relative to the storage root. */
  publicPath: string;
  /** Upload identifier of the selected version. */
  uploadId: string;
}

/**
 * POST /api/files/archive-requests request body.
 */
export interface CreateFileArchiveRequestBody {
  /** Selected file versions to include in the archive. */
  items: FileArchiveSelectionItem[];
  /** Browser-generated archive file name without the .zip extension. */
  archiveFileName?: string;
}

/**
 * POST /api/files/archive-requests response body.
 */
export interface CreateFileArchiveResponse {
  /** Archive request identifier. */
  requestId: string;
  /** Current archive generation status. */
  status: FileArchiveRequestStatus;
  /** Relative status path for polling archive generation progress. */
  statusPath: string;
  /** Relative download path for the completed archive request. */
  downloadPath: string;
}

/**
 * Archive generation status returned to the browser.
 */
export type FileArchiveRequestStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * GET /api/files/archive-requests/:requestId/status response body.
 */
export interface FileArchiveStatusResponse {
  /** Current archive generation status. */
  status: FileArchiveRequestStatus;
  /** Relative download path, present when the archive is completed. */
  downloadPath?: string;
  /** Failure detail, present when the archive generation failed. */
  error?: string;
}

interface PendingFileArchiveRequest {
  status: FileArchiveRequestStatus;
  archiveFileName: string;
  outputPath: string;
  tempDirectoryPath: string;
  expiresAt: number;
  error?: string;
}

const decodeWildcardPath = (rawPath: string): string => {
  const segments = rawPath.split('/');
  return segments.map((segment) => decodeURIComponent(segment)).join('/');
};

const withAbsoluteUrls = (
  baseUrl: string,
  group: StoredFileGroupInfo
): StoredFileGroupInfo & {
  latestDownloadUrl: string;
  versions: Array<StoredFileVersionInfo & { versionDownloadUrl: string }>;
} => ({
  ...group,
  latestDownloadUrl: `${baseUrl}${group.latestDownloadPath}`,
  versions: group.versions.map((version) => ({
    ...version,
    versionDownloadUrl: `${baseUrl}${version.versionDownloadPath}`,
  })),
});

const archiveRequestTtlMs = 5 * 60 * 1000;

const reservedWindowsFileNames = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const sanitizePortableFileNameComponent = (
  value: string,
  fallbackValue: string
): string => {
  const sanitizedValue = value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');

  const fileName =
    sanitizedValue.length > 0 ? sanitizedValue.slice(0, 120) : fallbackValue;
  const reservedNameTarget = fileName.split('.')[0]?.toUpperCase();
  return reservedNameTarget && reservedWindowsFileNames.has(reservedNameTarget)
    ? `_${fileName}`
    : fileName;
};

/**
 * Convert a realm value into a portable archive file name prefix.
 * @param realm Realm name from the server configuration.
 * @returns Sanitized file name prefix.
 */
export const sanitizeArchiveRealmFileName = (realm: string): string =>
  sanitizePortableFileNameComponent(realm, 'uplodah');

/**
 * Convert a browser-provided archive file name into a portable file name part.
 * @param archiveFileName File name requested by the browser, without extension.
 * @returns Sanitized file name part.
 */
export const sanitizeArchiveRequestFileName = (
  archiveFileName: string
): string => sanitizePortableFileNameComponent(archiveFileName, 'archive');

/**
 * Format a timestamp for archive file names.
 * @param date Date-time value to format.
 * @returns Timestamp in YYYYMMDD_HHmmss form using the date's current zone.
 */
export const formatArchiveTimestamp = (date: Dayjs): string =>
  date.format('YYYYMMDD_HHmmss');

const normalizeArchiveRequestFileName = (rawFileName: unknown): string =>
  typeof rawFileName === 'string' && rawFileName.trim().length > 0
    ? sanitizeArchiveRequestFileName(rawFileName)
    : formatArchiveTimestamp(dayjs.utc());

const createArchiveFileName = (
  realm: string,
  archiveFileName: string
): string =>
  `${sanitizeArchiveRealmFileName(realm)}_${sanitizeArchiveRequestFileName(
    archiveFileName
  )}.zip`;

const normalizeArchiveItems = (
  rawItems: unknown
): FileArchiveSelectionItem[] | undefined => {
  if (!Array.isArray(rawItems)) {
    return undefined;
  }

  const uniqueItems = new Map<string, FileArchiveSelectionItem>();
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') {
      return undefined;
    }

    const candidate = item as {
      publicPath?: unknown;
      uploadId?: unknown;
    };
    if (
      typeof candidate.publicPath !== 'string' ||
      candidate.publicPath.trim().length === 0 ||
      typeof candidate.uploadId !== 'string' ||
      candidate.uploadId.trim().length === 0
    ) {
      return undefined;
    }

    const normalizedItem = {
      publicPath: candidate.publicPath,
      uploadId: candidate.uploadId,
    };
    uniqueItems.set(
      `${normalizedItem.publicPath}\n${normalizedItem.uploadId}`,
      normalizedItem
    );
  }

  return Array.from(uniqueItems.values());
};

const createArchiveDownloadPath = (requestId: string): string =>
  `/api/files/archive-requests/${encodeURIComponent(requestId)}`;

const createArchiveStatusPath = (requestId: string): string =>
  `${createArchiveDownloadPath(requestId)}/status`;

const createArchiveStatusResponse = (
  requestId: string,
  request: PendingFileArchiveRequest
): FileArchiveStatusResponse => ({
  status: request.status,
  ...(request.status === 'completed'
    ? {
        downloadPath: createArchiveDownloadPath(requestId),
      }
    : {}),
  ...(request.status === 'failed' && request.error
    ? {
        error: request.error,
      }
    : {}),
});

const cleanupArchiveRequestFiles = async (
  request: PendingFileArchiveRequest,
  logger: Logger
): Promise<void> => {
  try {
    await rm(request.tempDirectoryPath, {
      recursive: true,
      force: true,
    });
  } catch (error) {
    logger.warn(`Failed to clean archive request files: ${error}`);
  }
};

const cleanupExpiredArchiveRequests = async (
  archiveRequests: Map<string, PendingFileArchiveRequest>,
  now: number,
  logger: Logger
): Promise<void> => {
  const cleanups: Promise<void>[] = [];

  archiveRequests.forEach((request, requestId) => {
    if (
      request.expiresAt <= now &&
      request.status !== 'pending' &&
      request.status !== 'processing'
    ) {
      archiveRequests.delete(requestId);
      cleanups.push(cleanupArchiveRequestFiles(request, logger));
    }
  });

  await Promise.all(cleanups);
};

const createArchiveEntryPath = (item: FileArchiveSelectionItem): string => {
  const pathSegments = item.publicPath
    .split('/')
    .filter((segment) => segment.length > 0);
  const fileName = pathSegments[pathSegments.length - 1] ?? 'file';
  return [...pathSegments, item.uploadId, fileName].join('/');
};

const createArchiveTempPaths = async (
  requestId: string
): Promise<{ tempDirectoryPath: string; outputPath: string }> => {
  const tempDirectoryPath = await mkdtemp(
    path.join(tmpdir(), 'uplodah-archive-')
  );
  return {
    tempDirectoryPath,
    outputPath: path.join(tempDirectoryPath, `${requestId}.zip`),
  };
};

/**
 * Register file list and download API routes.
 * @param fastify Fastify instance.
 * @param config Files route configuration.
 * @param locker Reader/writer lock for streaming.
 */
export const registerFilesRoutes = async (
  fastify: FastifyInstance,
  config: FilesRoutesConfig,
  locker: ReaderWriterLock
) => {
  const {
    storageService,
    authService,
    authConfig,
    logger,
    urlResolver,
    realm,
    maxDownloadSizeMb,
  } = config;
  const maxDownloadSizeBytes = maxDownloadSizeMb * 1024 * 1024;

  const authHandler = authService.isAuthRequired('general')
    ? createConditionalHybridAuthMiddleware(authConfig)
    : null;
  const authPreHandler = authHandler ? ([authHandler] as any) : [];
  const deleteAuthHandler = authService.isAuthRequired('publish')
    ? createConditionalHybridAuthMiddleware(authConfig)
    : null;
  const deleteAuthPreHandler = deleteAuthHandler
    ? ([deleteAuthHandler] as any)
    : [];
  const archiveRequests = new Map<string, PendingFileArchiveRequest>();
  const archiveTasks = new Set<Promise<void>>();

  fastify.addHook('onClose', async () => {
    await Promise.allSettled(Array.from(archiveTasks));
    await Promise.all(
      Array.from(archiveRequests.values()).map((request) =>
        cleanupArchiveRequestFiles(request, logger)
      )
    );
    archiveRequests.clear();
  });

  const startArchiveRequestTask = (
    requestId: string,
    request: PendingFileArchiveRequest,
    entries: readonly ZipArchiveEntry[]
  ): void => {
    request.status = 'processing';
    const task = (async () => {
      try {
        await createZipArchiveFile(logger, locker, entries, request.outputPath);
        request.status = 'completed';
        request.expiresAt = dayjs().valueOf() + archiveRequestTtlMs;
      } catch (error) {
        request.status = 'failed';
        request.error =
          error instanceof Error ? error.message : 'Internal server error';
        request.expiresAt = dayjs().valueOf() + archiveRequestTtlMs;
        logger.error(`Failed to create archive ${requestId}: ${error}`);
      }
    })();

    archiveTasks.add(task);
    task.finally(() => {
      archiveTasks.delete(task);
    });
  };

  fastify.get(
    '/',
    {
      preHandler: authPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as {
        skip?: string;
        take?: string;
      };

      const skip = Math.max(0, Number.parseInt(query.skip || '0', 10) || 0);
      const take = Math.max(1, Number.parseInt(query.take || '20', 10) || 20);
      const baseUrl = urlResolver.resolveUrl(request).baseUrl;
      const files = await storageService.listFiles(skip, take);

      return reply.send({
        totalCount: files.totalCount,
        skip,
        take,
        items: files.items.map((group) => withAbsoluteUrls(baseUrl, group)),
      });
    }
  );

  fastify.post(
    '/archive-requests',
    {
      preHandler: authPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Partial<CreateFileArchiveRequestBody>;
      const items = normalizeArchiveItems(body?.items);
      const archiveFileName = normalizeArchiveRequestFileName(
        body?.archiveFileName
      );
      if (!items) {
        return reply
          .status(400)
          .send({ error: 'Archive request items are invalid' });
      }
      if (items.length === 0) {
        return reply.status(400).send({ error: 'No files selected' });
      }

      const entries: ZipArchiveEntry[] = [];
      let resolvedSizeBytes = 0;
      try {
        for (const item of items) {
          const version = await storageService.getFileVersion(
            item.publicPath,
            item.uploadId
          );
          if (!version) {
            return reply.status(404).send({ error: 'File version not found' });
          }
          resolvedSizeBytes += version.size;
          if (resolvedSizeBytes > maxDownloadSizeBytes) {
            return reply
              .status(413)
              .send({ error: 'Selected files exceed maximum download size' });
          }
          entries.push({
            absoluteFilePath: version.absoluteFilePath,
            archivePath: createArchiveEntryPath({
              publicPath: version.publicPath,
              uploadId: version.uploadId,
            }),
            uploadedAt: version.uploadedAt,
          });
        }
      } catch (error) {
        logger.error(`Failed to prepare archive request: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }

      const now = dayjs().valueOf();
      await cleanupExpiredArchiveRequests(archiveRequests, now, logger);

      const requestId = randomUUID();
      const { tempDirectoryPath, outputPath } =
        await createArchiveTempPaths(requestId);
      const archiveRequest: PendingFileArchiveRequest = {
        status: 'pending',
        archiveFileName,
        outputPath,
        tempDirectoryPath,
        expiresAt: now + archiveRequestTtlMs,
      };
      archiveRequests.set(requestId, archiveRequest);
      startArchiveRequestTask(requestId, archiveRequest, entries);

      const response: CreateFileArchiveResponse = {
        requestId,
        status: archiveRequest.status,
        statusPath: createArchiveStatusPath(requestId),
        downloadPath: createArchiveDownloadPath(requestId),
      };
      return reply.send(response);
    }
  );

  fastify.get(
    '/archive-requests/:requestId/status',
    {
      preHandler: authPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request.params as { requestId?: string }).requestId;
      if (!requestId) {
        return reply.status(404).send({ error: 'Archive request not found' });
      }

      const now = dayjs().valueOf();
      await cleanupExpiredArchiveRequests(archiveRequests, now, logger);

      const archiveRequest = archiveRequests.get(requestId);
      if (!archiveRequest) {
        return reply.status(404).send({ error: 'Archive request not found' });
      }

      return reply.send(createArchiveStatusResponse(requestId, archiveRequest));
    }
  );

  fastify.get(
    '/archive-requests/:requestId',
    {
      preHandler: authPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request.params as { requestId?: string }).requestId;
      if (!requestId) {
        return reply.status(404).send({ error: 'Archive request not found' });
      }

      const now = dayjs().valueOf();
      await cleanupExpiredArchiveRequests(archiveRequests, now, logger);

      const archiveRequest = archiveRequests.get(requestId);
      if (!archiveRequest) {
        return reply.status(404).send({ error: 'Archive request not found' });
      }

      if (archiveRequest.status === 'failed') {
        return reply.status(500).send({
          error: archiveRequest.error || 'Archive request failed',
        });
      }

      if (archiveRequest.status !== 'completed') {
        return reply
          .status(409)
          .send({ error: 'Archive request is not completed' });
      }

      try {
        const archiveStats = await stat(archiveRequest.outputPath);
        if (!archiveStats.isFile()) {
          archiveRequests.delete(requestId);
          await cleanupArchiveRequestFiles(archiveRequest, logger);
          return reply.status(404).send({ error: 'Archive request not found' });
        }

        let cleanupStarted = false;
        const cleanupAfterSend = () => {
          if (cleanupStarted) {
            return;
          }
          cleanupStarted = true;
          archiveRequests.delete(requestId);
          void cleanupArchiveRequestFiles(archiveRequest, logger);
        };

        const archiveStream = createReadStream(archiveRequest.outputPath);
        archiveStream.once('error', cleanupAfterSend);
        reply.raw.once('finish', cleanupAfterSend);
        reply.raw.once('close', cleanupAfterSend);

        reply.header('Content-Type', 'application/zip');
        reply.header('Content-Length', archiveStats.size);
        reply.header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(
            createArchiveFileName(realm, archiveRequest.archiveFileName)
          )}`
        );

        return reply.send(archiveStream);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          archiveRequests.delete(requestId);
          await cleanupArchiveRequestFiles(archiveRequest, logger);
          return reply.status(404).send({ error: 'Archive request not found' });
        }
        logger.error(`Failed to serve archive ${requestId}: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.get(
    '/*',
    {
      preHandler: authPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rawPath = (request.params as { '*': string })['*'];
      if (!rawPath) {
        return reply.status(404).send({ error: 'File not found' });
      }

      try {
        const decodedPath = decodeWildcardPath(rawPath);
        let latestVersion;
        try {
          latestVersion =
            await storageService.getLatestFileVersion(decodedPath);
        } catch (error) {
          if (error instanceof URIError) {
            throw error;
          }
          latestVersion = undefined;
        }

        const resolvedVersion =
          latestVersion ||
          (await (async () => {
            const segments = decodedPath.split('/');
            if (segments.length < 2) {
              return undefined;
            }

            const uploadId = segments[segments.length - 1];
            const filePath = segments.slice(0, -1).join('/');
            if (!uploadId || filePath.length === 0) {
              return undefined;
            }
            return await storageService.getFileVersion(filePath, uploadId);
          })());

        if (!resolvedVersion) {
          return reply.status(404).send({ error: 'File not found' });
        }

        await streamFile(
          logger,
          locker,
          resolvedVersion.absoluteFilePath,
          reply,
          {
            contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
              resolvedVersion.fileName
            )}`,
          },
          request.abortSignal
        );
      } catch (error) {
        if (error instanceof URIError) {
          return reply.status(400).send({ error: 'File path is invalid' });
        }

        logger.error(`Failed to serve file ${request.url}: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.delete(
    '/*',
    {
      preHandler: deleteAuthPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rawPath = (request.params as { '*': string })['*'];
      if (!rawPath) {
        return reply.status(400).send({ error: 'File path is required' });
      }

      try {
        const decodedPath = decodeWildcardPath(rawPath);
        const authMode = authService.getAuthMode();
        const authRequest = request as AuthenticatedFastifyRequest;
        const currentUser = authRequest.user
          ? {
              username: authRequest.user.username,
              role: authRequest.user.role,
              authenticated: true,
            }
          : null;
        let latestVersion;
        try {
          latestVersion =
            await storageService.getLatestFileVersion(decodedPath);
        } catch (error) {
          if (error instanceof URIError) {
            throw error;
          }
          latestVersion = undefined;
        }

        if (latestVersion) {
          return reply.status(400).send({
            error: 'Deleting the latest file version requires an upload ID',
          });
        }

        const segments = decodedPath.split('/');
        if (segments.length < 2) {
          return reply.status(400).send({
            error: 'Deleting the latest file version requires an upload ID',
          });
        }

        const uploadId = segments[segments.length - 1];
        const filePath = segments.slice(0, -1).join('/');
        if (!uploadId || filePath.length === 0) {
          return reply.status(400).send({
            error: 'Deleting the latest file version requires an upload ID',
          });
        }

        const targetVersion = await storageService.getFileVersion(
          filePath,
          uploadId
        );
        if (!targetVersion) {
          return reply.status(404).send({ error: 'File not found' });
        }

        if (
          !canDeleteStoredVersion({
            authMode,
            currentUser,
            uploadedBy: targetVersion.uploadedBy,
          })
        ) {
          return reply
            .status(403)
            .send({ error: 'Delete permission required' });
        }

        const handle = await locker.writeLock();
        let deleted = false;
        try {
          deleted = await storageService.deleteFileVersion(filePath, uploadId);
        } finally {
          handle.release();
        }
        if (!deleted) {
          return reply.status(404).send({ error: 'File not found' });
        }

        return reply.send({ message: 'File deleted successfully' });
      } catch (error: any) {
        if (error instanceof URIError) {
          return reply.status(400).send({ error: 'File path is invalid' });
        }

        if (error?.message === 'Upload directory does not allow deletions') {
          return reply.status(403).send({ error: error.message });
        }

        if (error instanceof Error) {
          logger.warn(`Delete rejected for ${request.url}: ${error.message}`);
          return reply.status(400).send({ error: error.message });
        }

        logger.error(`Failed to delete file ${request.url}: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  logger.info('Files API routes registered successfully');
};
