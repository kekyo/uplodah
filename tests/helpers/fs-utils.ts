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
