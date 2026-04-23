// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { createTestDirectory, getTestPort } from './helpers/test-helper';
import { loadConfigFromPath } from '../src/utils/configLoader';

const execAsync = promisify(exec);

describe('max upload and download size configuration', () => {
  let testDir: string;
  let testPort: number;
  const cliPath = join(process.cwd(), 'dist', 'cli.mjs');

  beforeEach(async (fn) => {
    testDir = await createTestDirectory('max-upload-size', fn.task.name);
    testPort = await getTestPort(6300);
  });

  afterEach(() => {
    delete process.env.UPLODAH_MAX_UPLOAD_SIZE_MB;
    delete process.env.UPLODAH_MAX_DOWNLOAD_SIZE_MB;
  });

  const runCli = async (
    args = '',
    env: Record<string, string> = {}
  ): Promise<{ stdout: string; stderr: string }> => {
    const fullEnv = { ...process.env, ...env };
    const command = `timeout 5 node ${cliPath} ${args} || true`;
    return execAsync(command, { env: fullEnv });
  };

  it('should load valid maxUploadSizeMb from config.json', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        maxUploadSizeMb: 200,
      })
    );

    const config = await loadConfigFromPath(configPath);
    expect(config.maxUploadSizeMb).toBe(200);
  });

  it('should load valid maxDownloadSizeMb from config.json', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        maxDownloadSizeMb: 300,
      })
    );

    const config = await loadConfigFromPath(configPath);
    expect(config.maxDownloadSizeMb).toBe(300);
  });

  it('should reject invalid maxUploadSizeMb values in config.json', async () => {
    const configPath = join(testDir, 'config.json');

    await writeFile(
      configPath,
      JSON.stringify({
        maxUploadSizeMb: 0,
      })
    );
    expect(
      (await loadConfigFromPath(configPath)).maxUploadSizeMb
    ).toBeUndefined();

    await writeFile(
      configPath,
      JSON.stringify({
        maxUploadSizeMb: 10001,
      })
    );
    expect(
      (await loadConfigFromPath(configPath)).maxUploadSizeMb
    ).toBeUndefined();
  });

  it('should accept --max-upload-size-mb CLI argument', async () => {
    const { stdout } = await runCli(
      `--port ${testPort} --max-upload-size-mb 250 --storage-dir ${testDir}`
    );

    expect(stdout).toContain('Max upload size: 250MB');
  }, 10000);

  it('should accept --max-download-size-mb CLI argument', async () => {
    const { stdout } = await runCli(
      `--port ${testPort} --max-download-size-mb 350 --storage-dir ${testDir}`
    );

    expect(stdout).toContain('Max download size: 350MB');
  }, 10000);

  it('should reject invalid --max-upload-size-mb CLI values', async () => {
    const result = await runCli(
      `--port ${testPort} --max-upload-size-mb 0 --storage-dir ${testDir}`
    );

    expect(result.stderr).toContain(
      'Invalid max upload size. Must be between 1 and 10000 MB'
    );
  }, 10000);

  it('should reject invalid --max-download-size-mb CLI values', async () => {
    const result = await runCli(
      `--port ${testPort} --max-download-size-mb 0 --storage-dir ${testDir}`
    );

    expect(result.stderr).toContain(
      'Invalid max download size. Must be between 1 and 10000 MB'
    );
  }, 10000);

  it('should accept UPLODAH_MAX_UPLOAD_SIZE_MB environment variable', async () => {
    const { stdout } = await runCli(
      `--port ${testPort} --storage-dir ${testDir}`,
      {
        UPLODAH_MAX_UPLOAD_SIZE_MB: '300',
      }
    );

    expect(stdout).toContain('Max upload size: 300MB');
  }, 10000);

  it('should accept UPLODAH_MAX_DOWNLOAD_SIZE_MB environment variable', async () => {
    const { stdout } = await runCli(
      `--port ${testPort} --storage-dir ${testDir}`,
      {
        UPLODAH_MAX_DOWNLOAD_SIZE_MB: '450',
      }
    );

    expect(stdout).toContain('Max download size: 450MB');
  }, 10000);

  it('should use default value for invalid environment variable values', async () => {
    const { stdout } = await runCli(
      `--port ${testPort} --storage-dir ${testDir}`,
      {
        UPLODAH_MAX_UPLOAD_SIZE_MB: 'abc',
      }
    );

    expect(stdout).toContain('Max upload size: 100MB');
  }, 10000);

  it('should prioritize CLI over environment and config', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        maxUploadSizeMb: 150,
        maxDownloadSizeMb: 250,
      })
    );

    const { stdout } = await runCli(
      `--port ${testPort} --config-file ${configPath} --max-upload-size-mb 400 --max-download-size-mb 500 --storage-dir ${testDir}`,
      {
        UPLODAH_MAX_UPLOAD_SIZE_MB: '300',
        UPLODAH_MAX_DOWNLOAD_SIZE_MB: '350',
      }
    );

    expect(stdout).toContain('Max upload size: 400MB');
    expect(stdout).toContain('Max download size: 500MB');
  }, 10000);

  it('should prioritize environment over config when CLI is not specified', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        maxUploadSizeMb: 150,
        maxDownloadSizeMb: 250,
      })
    );

    const { stdout } = await runCli(
      `--port ${testPort} --config-file ${configPath} --storage-dir ${testDir}`,
      {
        UPLODAH_MAX_UPLOAD_SIZE_MB: '300',
        UPLODAH_MAX_DOWNLOAD_SIZE_MB: '350',
      }
    );

    expect(stdout).toContain('Max upload size: 300MB');
    expect(stdout).toContain('Max download size: 350MB');
  }, 10000);
});
