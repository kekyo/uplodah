// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { promises as fs } from 'fs';
import path from 'path';
import {
  generateSalt,
  hashPassword,
  generateApiPassword,
  generateUserId,
} from '../../src/utils/crypto';

interface JsonUser {
  username: string;
  password: string;
  role: 'read' | 'publish' | 'admin';
}

/**
 * Creates a users.json file with the specified users
 * @param configDir - Directory where the users.json file should be created
 * @param users - Array of users to include in the file
 */
export const createUsersJsonFile = async (
  configDir: string,
  users: JsonUser[]
): Promise<void> => {
  const usersData = users.map((user) => {
    const passwordSalt = generateSalt();
    const passwordHash = hashPassword(user.password, passwordSalt);

    const apiPassword = generateApiPassword();
    const apiPasswordSalt = generateSalt();
    const apiPasswordHash = hashPassword(apiPassword, apiPasswordSalt);

    const now = new Date().toISOString();

    return {
      id: generateUserId(),
      username: user.username,
      passwordHash,
      salt: passwordSalt,
      apiPasswordHash,
      apiPasswordSalt,
      role: user.role,
      createdAt: now,
      updatedAt: now,
    };
  });

  const filePath = path.join(configDir, 'users.json');
  await fs.writeFile(filePath, JSON.stringify(usersData, null, 2));
};
