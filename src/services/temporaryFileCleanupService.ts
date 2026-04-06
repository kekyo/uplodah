// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import {
  createConditional,
  createManuallyConditional,
  delay,
} from 'async-primitives';
import { Logger } from '../types';
import { FileService } from './fileService';

interface CreateTemporaryFileCleanupServiceInput {
  fileService: FileService;
  logger: Logger;
}

type WaitResult = 'changed' | 'expired';

/**
 * Background worker that deletes expired uploads.
 */
export interface TemporaryFileCleanupService {
  /**
   * Starts scheduling expiration checks.
   */
  start: () => Promise<void>;
  /**
   * Re-evaluates the next expiration after a file is stored.
   */
  notifyFileStored: () => Promise<void>;
  /**
   * Stops the background worker.
   */
  close: () => Promise<void>;
}

/**
 * Creates a background cleanup worker for expiring uploads.
 * @param input Service dependencies.
 * @returns Cleanup worker instance.
 */
export const createTemporaryFileCleanupService = (
  input: CreateTemporaryFileCleanupServiceInput
): TemporaryFileCleanupService => {
  const changed = createConditional();
  const started = createManuallyConditional(false);

  let closed = false;
  let workerPromise: Promise<void> | undefined = undefined;
  let changeVersion = 0;

  const notifyChanged = (): void => {
    changeVersion += 1;
    changed.trigger();
  };

  const waitForChange = async (
    observedVersion: number,
    signal: AbortSignal | undefined
  ): Promise<void> => {
    while (!closed && changeVersion === observedVersion) {
      await changed.wait(signal);
    }
  };

  const waitForNextAction = async (
    nextExpiration: Date | undefined,
    observedVersion: number
  ): Promise<WaitResult> => {
    if (!nextExpiration) {
      input.logger.debug('No expiring uploads to schedule for cleanup');
      await waitForChange(observedVersion, undefined);
      return 'changed';
    }

    const waitMs = Math.max(0, nextExpiration.getTime() - Date.now());
    input.logger.debug(`Scheduled upload cleanup in ${waitMs}ms`);

    const controller = new AbortController();
    try {
      return await Promise.race([
        delay(waitMs, controller.signal).then((): WaitResult => 'expired'),
        waitForChange(observedVersion, controller.signal).then(
          (): WaitResult => 'changed'
        ),
      ]);
    } finally {
      controller.abort();
    }
  };

  const runWorker = async (): Promise<void> => {
    started.raise();

    while (!closed) {
      try {
        const observedVersion = changeVersion;
        const nextExpiration =
          await input.fileService.getNextExpiringUploadAt();
        const waitResult = await waitForNextAction(
          nextExpiration,
          observedVersion
        );

        if (closed || waitResult !== 'expired') {
          continue;
        }

        const deletedCount = await input.fileService.deleteExpiredFiles(
          new Date()
        );
        if (deletedCount > 0) {
          input.logger.info(
            `Deleted ${deletedCount} expired upload${deletedCount === 1 ? '' : 's'}`
          );
        }
      } catch (error) {
        input.logger.error(
          `Upload cleanup failed: ${error instanceof Error ? error.message : String(error)}`
        );

        if (!closed) {
          await delay(1000);
        }
      }
    }
  };

  return {
    start: async (): Promise<void> => {
      if (!workerPromise) {
        workerPromise = runWorker();
      }

      await started.wait();
    },
    notifyFileStored: async (): Promise<void> => {
      notifyChanged();
    },
    close: async (): Promise<void> => {
      closed = true;
      notifyChanged();

      if (workerPromise) {
        await workerPromise;
      }
    },
  };
};
