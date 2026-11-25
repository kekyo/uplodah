// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { constants, type Stats } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  realpath,
  type FileHandle,
} from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

const unavailable = () =>
  Object.assign(new Error('File not found'), { code: 'ENOENT' });

/**
 * Resolves an existing relative storage path without following links below the root.
 * @param root Operator-configured root, which may itself be a link.
 * @param relativePath Path within that root, or an empty string for the root.
 * @returns Canonical path within the root.
 */
export const resolveStoragePath = async (
  root: string,
  relativePath: string
): Promise<string> => {
  if (isAbsolute(relativePath) || relativePath.includes('\0'))
    throw unavailable();
  const directory = await realpath(root);
  const candidate = resolve(directory, relativePath);
  if (
    candidate !== directory &&
    !candidate.startsWith(directory.endsWith(sep) ? directory : directory + sep)
  )
    throw unavailable();
  if ((await realpath(candidate)) !== candidate) throw unavailable();
  return candidate;
};

/**
 * Creates validated directory components below an operator-configured root.
 * @param root Configured storage root.
 * @param segments Validated public path components.
 * @returns The prepared directory.
 */
export const prepareStorageDirectory = async (
  root: string,
  segments: readonly string[]
): Promise<string> => {
  await mkdir(root, { recursive: true });
  let directory = await realpath(root);
  for (const segment of segments) {
    directory = join(directory, segment);
    try {
      await mkdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if (
      !(await lstat(directory)).isDirectory() ||
      (await realpath(directory)) !== directory
    )
      throw unavailable();
  }
  return directory;
};

/**
 * Opens a regular file beneath an operator-configured directory.
 * @param root - Trusted directory (it may itself be a configured symlink).
 * @param filePath - Relative path within the directory.
 * @returns The open descriptor and its stat. The caller must close the descriptor.
 * @throws ENOENT for paths outside the directory or non-regular files.
 */
export const openStorageFile = async (
  root: string,
  filePath: string
): Promise<{ file: FileHandle; stats: Stats }> => {
  const candidate = await resolveStoragePath(root, filePath);
  const file = await open(
    candidate,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0)
  );
  try {
    const stats = await file.stat();
    if (!stats.isFile()) throw unavailable();
    // Check that the descriptor belongs to the validated directory entry even
    // when another writer replaces a file between path resolution and open.
    const entry = await lstat(candidate);
    if (
      entry.dev !== stats.dev ||
      entry.ino !== stats.ino ||
      (await realpath(candidate)) !== candidate
    )
      throw unavailable();
    return { file, stats };
  } catch (error) {
    await file.close();
    throw error;
  }
};
