// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { openStorageFile } from './storagePaths.ts';
import type { FastifyReply } from 'fastify';
import { extname } from 'node:path';
import type { Logger } from '../types.ts';
import type { ReaderWriterLock } from 'async-primitives';

/**
 * Options for file streaming
 */
export interface StreamFileOptions {
  /** Override Content-Type header */
  contentType?: string;
  /** Set Content-Disposition header */
  contentDisposition?: string;
  /** Set Cache-Control header */
  cacheControl?: string;
}

/**
 * Stream a file to the client using createReadStream
 *
 * This function provides a unified way to send files that works correctly
 * in both regular HTTP environments and fastify.inject() environments (like Vite dev server).
 *
 * Features:
 * - Memory efficient streaming (no loading entire file into memory)
 * - Works with fastify.inject() method used by Vite plugin
 * - Automatic Content-Type detection based on file extension
 * - Proper error handling for missing files
 * - Support for optional headers (cache control, content disposition)
 *
 * @param logger - Logger instance
 * @param locker - Reader lock for file streaming
 * @param root - Trusted directory containing this class of files
 * @param filePath - Path relative to that directory
 * @param reply - Fastify reply object
 * @param options - Optional headers and configuration
 * @param signal - Optional AbortSignal for cancellation support
 * @returns Resolves after streaming or sending an error response
 */
export const streamFile = async (
  logger: Logger,
  locker: ReaderWriterLock,
  root: string,
  filePath: string,
  reply: FastifyReply,
  options: StreamFileOptions,
  signal: AbortSignal | undefined
): Promise<void> => {
  // Acquire reader lock with signal support
  const handler = await locker.readLock(signal);
  try {
    const { file, stats } = await openStorageFile(root, filePath);
    try {
      // Determine Content-Type and stream from the descriptor used for Content-Length.
      reply.header(
        'Content-Type',
        options.contentType ?? getMimeTypeFromExtension(extname(filePath))
      );
      reply.header('Content-Length', stats.size);
      if (options.contentDisposition)
        reply.header('Content-Disposition', options.contentDisposition);
      if (options.cacheControl)
        reply.header('Cache-Control', options.cacheControl);
      logger.debug(`Streaming ${filePath}`);
      const stream = file.createReadStream({ signal, autoClose: false });
      try {
        await reply.send(stream);
      } finally {
        stream.destroy();
      }
      return;
    } finally {
      await file.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(code ?? '')) {
      await reply.status(404).send({ error: 'File not found' });
      return;
    }
    if (code === 'EACCES') {
      await reply.status(403).send({ error: 'Permission denied' });
      return;
    }
    throw error;
  } finally {
    // Release reader lock
    handler.release();
  }
};

/**
 * Get MIME type based on file extension
 * @param ext - File extension (including the dot)
 * @returns MIME type string
 */
function getMimeTypeFromExtension(ext: string): string {
  const mimeTypes: { [key: string]: string } = {
    // Web files
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.txt': 'text/plain',

    // Image files
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',

    // Archive files
    '.nupkg': 'application/zip',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',

    // Font files
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',

    // Other common files
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}
