// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { createTestDirectory, getTestPort } from './helpers/test-helper';

const execAsync = promisify(exec);

describe('CLI configuration priority', () => {
  let testDir: string;
  let testPort: number;
  const cliPath = join(process.cwd(), 'dist', 'cli.mjs');

  beforeEach(async (fn) => {
    testDir = await createTestDirectory('cli-config', fn.task.name);
    testPort = await getTestPort(6200);
  });

  afterEach(() => {
    delete process.env.UPLODAH_PORT;
    delete process.env.UPLODAH_STORAGE_DIR;
    delete process.env.UPLODAH_LOG_LEVEL;
    delete process.env.UPLODAH_AUTH_MODE;
    delete process.env.UPLODAH_USERS_FILE;
    delete process.env.UPLODAH_CONFIG_FILE;
    delete process.env.UPLODAH_SESSION_SECRET;
    delete process.env.UPLODAH_BASE_URL;
    delete process.env.UPLODAH_TRUSTED_PROXIES;
  });

  const runCli = async (
    args = '',
    env: Record<string, string> = {}
  ): Promise<{ stdout: string; stderr: string }> => {
    const fullEnv = { ...process.env, ...env };
    const command = `timeout 5 node ${cliPath} ${args} || true`;
    return execAsync(command, { env: fullEnv });
  };

  it('should use CLI options as highest priority', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        port: 9000,
        storageDir: './config-storage',
        logLevel: 'debug',
        authMode: 'full',
      })
    );

    const { stdout } = await runCli(
      `--port ${testPort} --storage-dir ./cli-storage --log-level info --auth-mode none -c ${configPath}`,
      {
        UPLODAH_PORT: '8000',
        UPLODAH_STORAGE_DIR: './env-storage',
        UPLODAH_LOG_LEVEL: 'warn',
        UPLODAH_AUTH_MODE: 'publish',
      }
    );

    expect(stdout).toContain(`Port: ${testPort}`);
    expect(stdout).toContain('Storage directory: ./cli-storage');
    expect(stdout).toContain('Log level: info');
    expect(stdout).toContain('Authentication mode: none');
  }, 10000);

  it('should use environment variables when CLI options are not provided', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        port: 9000,
        storageDir: './config-storage',
        authMode: 'full',
      })
    );

    const { stdout } = await runCli(`-c ${configPath}`, {
      UPLODAH_PORT: String(testPort),
      UPLODAH_STORAGE_DIR: './env-storage',
      UPLODAH_AUTH_MODE: 'publish',
    });

    expect(stdout).toContain(`Port: ${testPort}`);
    expect(stdout).toContain('Storage directory: ./env-storage');
    expect(stdout).toContain('Authentication mode: publish');
  }, 10000);

  it('should use config.json when CLI and env are not provided', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        port: testPort,
        storageDir: './json-storage',
        logLevel: 'debug',
        authMode: 'publish',
        usersFile: './auth/users.json',
      })
    );

    const { stdout, stderr } = await runCli(`-c ${configPath}`);
    const output = stdout || stderr;

    expect(output).toContain(`Port: ${testPort}`);
    expect(output).toContain(
      `Storage directory: ${resolve(testDir, './json-storage')}`
    );
    expect(output).toContain('Log level: debug');
    expect(output).toContain('Authentication mode: publish');
    expect(output).toContain(
      `Users file: ${resolve(testDir, './auth/users.json')}`
    );
    expect(output).toContain(`Configuration loaded from ${configPath}`);
  }, 10000);

  it('should use defaults when nothing is provided', async () => {
    const configPath = join(testDir, 'nonexistent.json');
    const { stdout, stderr } = await runCli(`-c ${configPath}`);
    const output = stdout || stderr;

    expect(output).toContain('Port: 5968');
    expect(output).toContain('Storage directory: ./storage');
    expect(output).toContain('Log level: info');
    expect(output).toContain('Authentication mode: none');
  }, 10000);

  it('should prioritize usersFile configuration correctly', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        port: testPort,
        usersFile: 'config-users.json',
      })
    );

    const cliUsersFile = join(testDir, 'cli-users.json');
    const { stdout } = await runCli(
      `-c ${configPath} --users-file ${cliUsersFile}`,
      {
        UPLODAH_USERS_FILE: join(testDir, 'env-users.json'),
      }
    );

    expect(stdout).toContain(`Users file: ${cliUsersFile}`);
  }, 10000);

  it('should read config-file path from environment', async () => {
    const configPath = join(testDir, 'env-config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        port: testPort,
        logLevel: 'debug',
      })
    );

    const { stdout } = await runCli('', {
      UPLODAH_CONFIG_FILE: configPath,
    });

    expect(stdout).toContain(`Port: ${testPort}`);
    expect(stdout).toContain('Log level: debug');
    expect(stdout).toContain(`Config file: ${configPath}`);
  }, 10000);

  it('should read baseUrl and trusted proxies from environment', async () => {
    const { stdout } = await runCli(
      `--port ${testPort} --storage-dir ${testDir}`,
      {
        UPLODAH_BASE_URL: 'https://files.example.com/u',
        UPLODAH_TRUSTED_PROXIES: '127.0.0.1, 10.0.0.1',
      }
    );

    expect(stdout).toContain('Base URL: https://files.example.com/u (fixed)');
    expect(stdout).toContain('Trusted proxies: 127.0.0.1, 10.0.0.1');
  }, 10000);
});
