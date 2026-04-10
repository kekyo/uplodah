// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import path from 'path';
import net from 'node:net';
import dayjs from 'dayjs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { LogLevel } from '../../src/types';
import { ensureDir } from './fs-utils';

const execAsync = promisify(exec);

const blockedFetchPorts = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6697, 10080,
]);

// Test global log level string
export const testGlobalLogLevel =
  (process.env['UPLODAH_TEST_LOGLEVEL'] as LogLevel | undefined) ?? 'warn';

// Timestamp for test directories
const timestamp = dayjs().format('YYYYMMDD_HHmmss');

/**
 * Creates a test directory with timestamp for test isolation
 * @remarks WARNING: Do NOT construct nested `describe()` tests, isolation environment will break.
 */
export const createTestDirectory = async (
  categoryName: string,
  testName: string
): Promise<string> => {
  // Sanitize names to be filesystem-safe
  const sanitize = (name: string) =>
    name
      .replaceAll(' ', '-')
      .replaceAll('/', '_') // Replace slash with underscore
      .replaceAll('\\', '_') // Replace backslash
      .replaceAll(':', '_') // Replace colon
      .replaceAll('*', '_') // Replace asterisk
      .replaceAll('?', '_') // Replace question mark
      .replaceAll('"', '_') // Replace double quote
      .replaceAll('<', '_') // Replace less than
      .replaceAll('>', '_') // Replace greater than
      .replaceAll('|', '_'); // Replace pipe

  const testDir = path.join(
    process.cwd(),
    'test-results',
    timestamp,
    sanitize(categoryName),
    sanitize(testName)
  );
  await ensureDir(testDir);
  return testDir;
};

const isPortAvailable = async (port: number): Promise<boolean> =>
  await new Promise((resolve) => {
    const server = net.createServer();

    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.listen({ port, host: '0.0.0.0', exclusive: true }, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });

/**
 * Finds an available test port near the requested base port.
 * Uses process.pid and a randomized starting offset, then scans for the first free port.
 * @remarks WARNING: Do NOT construct nested `describe()` tests, isolation environment will break.
 */
export const getTestPort = async (basePort: number = 6000): Promise<number> => {
  const rangeSize = 5000;
  const pidComponent = process.pid % 1000;
  const randomComponent = Math.floor(Math.random() * 4000);
  const initialOffset = (pidComponent + randomComponent) % rangeSize;

  for (let attempt = 0; attempt < rangeSize; attempt++) {
    const port = basePort + ((initialOffset + attempt) % rangeSize);
    if (blockedFetchPorts.has(port)) {
      continue;
    }

    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `Could not find an available test port in range ${basePort}-${basePort + rangeSize - 1}`
  );
};

/**
 * Forcefully terminates any remaining CLI processes
 * Used in test cleanup to prevent zombie processes
 */
export const cleanupCLIProcesses = async (): Promise<void> => {
  try {
    // Use shell command with proper error suppression
    // pkill returns 1 when no processes are found, which is normal
    await execAsync('pkill -f "dist/cli" 2>/dev/null || true');
  } catch (error) {
    // Silently ignore all errors - this is expected when no processes exist
  }
};

/**
 * Waits for the test server to be ready by polling the health endpoint.
 * @param serverPort - The port where the server is running
 * @param authMode - Reserved for compatibility with existing helper call sites
 * @param maxRetries - Maximum number of retry attempts (default: 30)
 * @param retryDelay - Delay between retries in milliseconds (default: 500)
 * @returns Promise that resolves when the server is ready
 * @throws Error if the server doesn't become ready within the timeout
 */
export const waitForServerReady = async (
  serverPort: number,
  _authMode: 'none' | 'publish' | 'full',
  maxRetries: number = 30,
  retryDelay: number = 500
): Promise<void> => {
  const url = `http://localhost:${serverPort}/health`;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Set a short timeout to avoid blocking
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(url, {
        signal: controller.signal,
        // Avoid following redirects that might hang
        redirect: 'manual',
      });

      clearTimeout(timeoutId);

      if (response.status === 200) {
        return;
      }

      if (i === maxRetries - 1) {
        throw new Error(`Server returned unexpected status ${response.status}`);
      }
    } catch (error: any) {
      // Handle fetch errors (connection refused, timeout, etc.)
      if (i === maxRetries - 1) {
        // Last attempt failed
        throw new Error(
          `Server failed to start within ${(maxRetries * retryDelay) / 1000} seconds: ${error.message}`
        );
      }

      // Server not ready yet, continue retrying
    }

    // Wait before next attempt
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
};
