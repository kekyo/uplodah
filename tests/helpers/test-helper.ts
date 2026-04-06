// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { mkdtemp } from 'fs/promises';
import net from 'net';
import { tmpdir } from 'os';
import path from 'path';
import { LogLevel } from '../../src/types';

/**
 * Shared log level for tests.
 */
export const testGlobalLogLevel =
  (process.env['UPLODAH_TEST_LOGLEVEL'] as LogLevel | undefined) ?? 'warn';

/**
 * Creates an isolated temporary directory for a test.
 * @param prefix Test-specific directory prefix.
 * @returns Created directory path.
 */
export const createTestDirectory = async (prefix: string): Promise<string> =>
  mkdtemp(path.join(tmpdir(), `uplodah-${prefix}-`));

/**
 * Asks the OS for a free local port number for a test run.
 * @param _basePort Unused legacy argument kept for compatibility with call sites.
 * @returns Port number.
 */
export const getTestPort = async (_basePort: number = 6000): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error) => {
      reject(error);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close((closeError) => {
          reject(closeError ?? new Error('Failed to resolve test port'));
        });
        return;
      }

      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(address.port);
      });
    });
  });
