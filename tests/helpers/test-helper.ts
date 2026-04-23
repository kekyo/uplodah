// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import path from 'path';
import net from 'node:net';
import dayjs from 'dayjs';
import { LogLevel } from '../../src/types';
import { ensureDir } from './fs-utils';

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
