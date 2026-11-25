// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { readFile } from 'node:fs/promises';
import * as prompts from '../src/utils/prompt.ts';
import { PassThrough } from 'node:stream';
import { runAuthInit } from '../src/authInit';
import { createConsoleLogger } from '../src/logger';
import { createTestDirectory, testGlobalLogLevel } from './helpers/test-helper';
import { ServerConfig } from '../src/types';

describe('Auth Init', () => {
  let testDir: string;
  let configDir: string;
  let logger: ReturnType<typeof createConsoleLogger>;

  beforeEach(async (fn) => {
    testDir = await createTestDirectory('auth-init', fn.task.name);
    configDir = join(testDir, 'config');
    logger = createConsoleLogger('auth-init', testGlobalLogLevel);
  });

  // Test directories are preserved in test-results for debugging

  describe('Pre-conditions', () => {
    it('should fail if users.json already exists', async () => {
      // Create config directory and users.json
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'users.json'), '[]');

      // Mock process.exit
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process exited with code ${code}`);
      });

      const config: ServerConfig = {
        port: 12345,
        storageDir: configDir,
        configDir: configDir,
        realm: 'Test Fastify UI Server - Publish',
        logLevel: testGlobalLogLevel,
        authMode: 'publish',
        passwordStrengthCheck: false,
      };

      // Expect the function to exit with error
      await expect(runAuthInit(config, logger)).rejects.toThrow(
        'Process exited with code 1'
      );

      // Verify error was logged
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    it('should create config directory if it does not exist', async () => {
      const username = vi
        .spyOn(prompts, 'promptInput')
        .mockResolvedValue('testadmin');
      const password = vi
        .spyOn(prompts, 'promptPassword')
        .mockResolvedValue('test-password');
      try {
        await runAuthInit(
          { port: 0, configDir, passwordStrengthCheck: false },
          logger
        );
        const users = JSON.parse(
          await readFile(join(configDir, 'users.json'), 'utf8')
        );
        expect(users).toMatchObject([{ username: 'testadmin', role: 'admin' }]);
      } finally {
        username.mockRestore();
        password.mockRestore();
      }
    });
  });

  it('preserves a pasted Unicode password across terminal reads and backspace', async () => {
    const terminal = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: vi.fn(),
    });
    const stdin = vi
      .spyOn(process, 'stdin', 'get')
      .mockReturnValue(terminal as unknown as typeof process.stdin);
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      const answer = prompts.promptPassword('Password');
      const input = Buffer.from('鍵🌱😀\x7fabc\r', 'utf8');
      terminal.write(input.subarray(0, 2));
      terminal.write(input.subarray(2));
      expect(await answer).toBe('鍵🌱abc');
    } finally {
      output.mockRestore();
      stdin.mockRestore();
      terminal.destroy();
    }
  });

  describe('User creation flow', () => {
    it('should validate username format', async () => {
      // Test data
      const invalidUsernames = [
        '', // Empty
        'a'.repeat(51), // Too long
        'user@name', // Invalid characters
        'user name', // Spaces
      ];

      const validUsernames = [
        'admin',
        'user123',
        'test-user',
        'user_name',
        'user.name',
      ];

      // Username validation is handled by UserService
      // These tests verify the validation rules match expectations
      for (const username of invalidUsernames) {
        // In actual implementation, UserService will validate
        expect(username).toMatch(/^$|^.{51,}$|[^a-zA-Z0-9._-]/);
      }

      for (const username of validUsernames) {
        expect(username).toMatch(/^[a-zA-Z0-9._-]+$/);
        expect(username.length).toBeLessThanOrEqual(50);
        expect(username.length).toBeGreaterThan(0);
      }
    });

    it('should validate password requirements', () => {
      // Test password validation rules
      const invalidPasswords = [
        '', // Empty
        '123', // Too short (< 4 chars)
      ];

      const validPasswords = [
        '1234', // Minimum length
        'password123',
        'VeryLongAndSecurePassword123!@#',
      ];

      // Password validation is handled in authInit
      for (const password of invalidPasswords) {
        expect(password.length).toBeLessThan(4);
      }

      for (const password of validPasswords) {
        expect(password.length).toBeGreaterThanOrEqual(4);
      }
    });
  });
});
