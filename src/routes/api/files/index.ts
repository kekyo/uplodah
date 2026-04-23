// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ReaderWriterLock } from 'async-primitives';
import { randomUUID } from 'crypto';
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
import { sendZipArchive, ZipArchiveEntry } from '../../../utils/zipArchive';
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
  /** Relative download path for the prepared archive request. */
  downloadPath: string;
}

interface PendingFileArchiveRequest {
  items: FileArchiveSelectionItem[];
  archiveFileName: string;
  expiresAt: number;
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

const cleanupExpiredArchiveRequests = (
  archiveRequests: Map<string, PendingFileArchiveRequest>,
  now: number
): void => {
  archiveRequests.forEach((request, requestId) => {
    if (request.expiresAt <= now) {
      archiveRequests.delete(requestId);
    }
  });
};

const createArchiveEntryPath = (item: FileArchiveSelectionItem): string => {
  const pathSegments = item.publicPath
    .split('/')
    .filter((segment) => segment.length > 0);
  const fileName = pathSegments[pathSegments.length - 1] ?? 'file';
  return [...pathSegments, item.uploadId, fileName].join('/');
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

      const resolvedItems: FileArchiveSelectionItem[] = [];
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
          resolvedItems.push({
            publicPath: version.publicPath,
            uploadId: version.uploadId,
          });
        }
      } catch (error) {
        logger.error(`Failed to prepare archive request: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }

      const now = dayjs().valueOf();
      cleanupExpiredArchiveRequests(archiveRequests, now);

      const requestId = randomUUID();
      archiveRequests.set(requestId, {
        items: resolvedItems,
        archiveFileName,
        expiresAt: now + archiveRequestTtlMs,
      });

      const response: CreateFileArchiveResponse = {
        downloadPath: `/api/files/archive-requests/${encodeURIComponent(
          requestId
        )}`,
      };
      return reply.send(response);
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
      cleanupExpiredArchiveRequests(archiveRequests, now);

      const archiveRequest = archiveRequests.get(requestId);
      if (!archiveRequest) {
        return reply.status(404).send({ error: 'Archive request not found' });
      }
      archiveRequests.delete(requestId);

      try {
        const entries: ZipArchiveEntry[] = [];
        let resolvedSizeBytes = 0;
        for (const item of archiveRequest.items) {
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

        await sendZipArchive(
          logger,
          locker,
          entries,
          reply,
          {
            contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
              createArchiveFileName(realm, archiveRequest.archiveFileName)
            )}`,
          },
          request.abortSignal
        );
      } catch (error) {
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
