// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { readFile, stat } from 'fs/promises';
import { FastifyReply } from 'fastify';
import AdmZip from 'adm-zip';
import { ReaderWriterLock } from 'async-primitives';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Logger } from '../types';

dayjs.extend(utc);

/**
 * File entry included in a ZIP archive.
 */
export interface ZipArchiveEntry {
  /** Absolute filesystem path to the stored payload file. */
  absoluteFilePath: string;
  /** Path to write into the ZIP archive. */
  archivePath: string;
  /** Upload timestamp used as the ZIP entry modification time. */
  uploadedAt: string;
}

/**
 * Options for ZIP archive responses.
 */
export interface SendZipArchiveOptions {
  /** Set Content-Disposition header. */
  contentDisposition?: string;
}

const getEntryTime = (uploadedAt: string): Date => {
  const time = dayjs.utc(uploadedAt);
  return (time.isValid() ? time : dayjs.utc()).toDate();
};

/**
 * Build and send a ZIP archive.
 * @param logger Logger instance.
 * @param locker Reader lock for file reading.
 * @param entries File entries to include.
 * @param reply Fastify reply object.
 * @param options Optional response headers.
 * @param signal Optional AbortSignal for cancellation support.
 */
export const sendZipArchive = async (
  logger: Logger,
  locker: ReaderWriterLock,
  entries: readonly ZipArchiveEntry[],
  reply: FastifyReply,
  options: SendZipArchiveOptions = {},
  signal?: AbortSignal
): Promise<void> => {
  const handler = await locker.readLock(signal);
  try {
    if (entries.length === 0) {
      return reply.status(400).send({ error: 'No files selected' });
    }

    for (const entry of entries) {
      const stats = await stat(entry.absoluteFilePath);
      if (!stats.isFile()) {
        return reply.status(404).send({ error: 'File not found' });
      }
    }

    if (signal?.aborted) {
      logger.info('ZIP archive creation aborted by client disconnect');
      return;
    }

    const zipFile = new AdmZip();
    const archiveId = `archive-${dayjs.utc().valueOf()}`;

    reply.header('Content-Type', 'application/zip');
    if (options.contentDisposition) {
      reply.header('Content-Disposition', options.contentDisposition);
    }

    for (const entry of entries) {
      if (signal?.aborted) {
        logger.info(`[${archiveId}] ZIP archive creation aborted`);
        return;
      }

      const fileContent = await readFile(entry.absoluteFilePath);
      const zipEntry = zipFile.addFile(entry.archivePath, fileContent);
      zipEntry.header.time = getEntryTime(entry.uploadedAt);
    }

    logger.debug(
      `[${archiveId}] Sending ZIP archive with ${entries.length} entries`
    );

    if (signal?.aborted) {
      logger.info(`[${archiveId}] ZIP archive send aborted`);
      return;
    }

    return reply.send(zipFile.toBuffer());
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return reply.status(404).send({ error: 'File not found' });
    }
    if (error.code === 'EACCES') {
      return reply.status(403).send({ error: 'Permission denied' });
    }
    throw error;
  } finally {
    handler.release();
  }
};
