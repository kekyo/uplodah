// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { promises as fs } from 'fs';

/**
 * Ensures directory exists, creating it recursively if needed
 * Replacement for fs-extra's ensureDir
 */
export const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

/**
 * Checks if path exists
 * Replacement for fs-extra's pathExists
 */
export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Copies a file from source to destination
 * Replacement for fs-extra's copy (file only)
 */
export const copy = async (src: string, dest: string): Promise<void> => {
  await fs.copyFile(src, dest);
};
