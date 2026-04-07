// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

describe('container build assets', () => {
  test('shows uplodah multi-platform podman usage', async () => {
    const scriptPath = path.join(projectRoot, 'build-docker-multiplatform.sh');

    const { stdout } = await execFileAsync('bash', [scriptPath, '--help'], {
      cwd: projectRoot,
    });

    expect(stdout).toContain(
      'Build multi-platform container images for uplodah using Podman'
    );
    expect(stdout).toContain(
      '--platforms PLATFORMS   Comma-separated list of platforms (default: linux/amd64,linux/arm64)'
    );
    expect(stdout).toContain('OCI_SERVER_USER=myuser');
    expect(stdout).toContain(`${scriptPath} --inspect`);
  });

  test('defines the runtime defaults used by the container image', async () => {
    const dockerfile = await readFile(path.join(projectRoot, 'Dockerfile'), {
      encoding: 'utf8',
    });

    expect(dockerfile).toContain('npm install -g npm@11.6.2');
    expect(dockerfile).toContain('EXPOSE 5968');
    expect(dockerfile).toContain('http://localhost:5968/health');
    expect(dockerfile).toContain('VOLUME ["/storage", "/data"]');
    expect(dockerfile).toContain(
      'CMD ["node", "dist/cli.mjs", "--config-file", "/data/config.json", "--storage-dir", "/storage"]'
    );
  });
});
