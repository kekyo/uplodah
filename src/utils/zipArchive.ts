// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { openStorageFile } from './storagePaths.ts';
import type { ReaderWriterLock } from 'async-primitives';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { Worker, type WorkerOptions } from 'worker_threads';
import type { Logger } from '../types.ts';

dayjs.extend(utc);

/**
 * File entry included in a ZIP archive.
 */
export interface ZipArchiveEntry {
  /** Path to the payload relative to the configured storage root. */
  filePath: string;
  /** Path to write into the ZIP archive. */
  archivePath: string;
  /** Upload timestamp used as the ZIP entry modification time. */
  uploadedAt: string;
}

interface ZipArchiveWorkerMessage {
  type: 'done' | 'error';
  message?: string;
  stack?: string;
  code?: string;
}

const zipArchiveWorkerSource = `
import { writeFile } from 'fs/promises';
import { parentPort, workerData } from 'worker_threads';
import AdmZip from 'adm-zip';

const getEntryTime = (uploadedAt) => {
  const parsed = Date.parse(uploadedAt);
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
};

try {
  const zipFile = new AdmZip();
  for (const entry of workerData.entries) {
    const fileContent = Buffer.from(entry.contents);
    const zipEntry = zipFile.addFile(entry.archivePath, fileContent);
    zipEntry.header.time = getEntryTime(entry.uploadedAt);
  }

  await writeFile(workerData.outputPath, zipFile.toBuffer(), { flag: 'wx', mode: 0o600 });
  parentPort?.postMessage({ type: 'done' });
} catch (error) {
  parentPort?.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    code: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
  });
}
`;

const createWorkerError = (message: ZipArchiveWorkerMessage): Error => {
  const error = new Error(message.message || 'ZIP archive worker failed');
  if (typeof message.stack === 'string') {
    error.stack = message.stack;
  }
  if (typeof message.code === 'string') {
    (error as NodeJS.ErrnoException).code = message.code;
  }
  return error;
};

/**
 * Build a ZIP archive file on a worker thread.
 * @param logger Logger instance.
 * @param locker Reader lock held while source files are read.
 * @param storageRoot Trusted root of all selected file versions.
 * @param entries File entries to include.
 * @param maxBytes Maximum combined input size.
 * @param outputPath Absolute path for the generated ZIP file.
 */
export const createZipArchiveFile = async (
  logger: Logger,
  locker: ReaderWriterLock,
  storageRoot: string,
  entries: readonly ZipArchiveEntry[],
  maxBytes: number,
  outputPath: string
): Promise<void> => {
  const handler = await locker.readLock();
  try {
    if (entries.length === 0) {
      throw new Error('No files selected');
    }

    const inputs: {
      archivePath: string;
      uploadedAt: string;
      contents: ArrayBuffer;
    }[] = [];
    let remaining = maxBytes;
    for (const entry of entries) {
      const { file, stats } = await openStorageFile(
        storageRoot,
        entry.filePath
      );
      try {
        if (stats.size > remaining)
          throw new Error('Archive exceeds the download size limit');
        remaining -= stats.size;
        // Transfer each allocation to the compressor; it never reopens a payload by path.
        const contents = new ArrayBuffer(stats.size);
        const bytes = new Uint8Array(contents);
        let offset = 0;
        while (offset < bytes.length) {
          const result = await file.read(
            bytes,
            offset,
            bytes.length - offset,
            null
          );
          if (result.bytesRead === 0)
            throw new Error('File changed while creating the archive');
          offset += result.bytesRead;
        }
        inputs.push({
          archivePath: entry.archivePath,
          uploadedAt: entry.uploadedAt,
          contents,
        });
      } finally {
        await file.close();
      }
    }

    const archiveId = `archive-${dayjs.utc().valueOf()}`;
    logger.debug(
      `[${archiveId}] Creating ZIP archive with ${entries.length} entries`
    );

    await new Promise<void>((resolve, reject) => {
      let done = false;
      let settled = false;
      const workerOptions: WorkerOptions & { type: 'module' } = {
        transferList: inputs.map((input) => input.contents),
        eval: true,
        type: 'module',
        workerData: {
          entries: inputs,
          outputPath,
        },
      };
      const worker = new Worker(zipArchiveWorkerSource, workerOptions);

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        callback();
      };

      worker.on('message', (message: ZipArchiveWorkerMessage) => {
        if (message.type === 'done') {
          done = true;
          return;
        }
        if (message.type === 'error') {
          const error = createWorkerError(message);
          void worker.terminate();
          settle(() => reject(error));
        }
      });

      worker.on('error', (error) => {
        settle(() => reject(error));
      });

      worker.on('exit', (code) => {
        if (code === 0 && done) {
          settle(resolve);
          return;
        }
        if (settled) {
          return;
        }
        reject(new Error(`ZIP archive worker exited with code ${code}`));
      });
    });

    logger.debug(`[${archiveId}] ZIP archive file created`);
  } finally {
    handler.release();
  }
};
