// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('Vite configuration loading', () => {
  it.each(['bundle', 'native'] as const)(
    'loads production and development configurations with %s',
    async (loader) => {
      // A separate Node process avoids Vitest transforming the native imports.
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `
            import assert from 'node:assert/strict';
            import { join, resolve } from 'node:path';
            import { mkdtemp, rm } from 'node:fs/promises';
            import { tmpdir } from 'node:os';
            import { createServer, loadConfigFromFile } from 'vite';

            for (const target of ['server', 'ui', 'development']) {
              const development = target === 'development';
              process.env.BUILD_TARGET = development ? 'server' : target;
              const loaded = await loadConfigFromFile(
                {
                  command: development ? 'serve' : 'build',
                  mode: development ? 'development' : 'production',
                },
                'vite.config.ts',
                process.cwd(),
                'warn',
                undefined,
                process.env.TEST_CONFIG_LOADER
              );
              assert.ok(loaded);
              const { config } = loaded;
              if (target === 'server') {
                assert.equal(config.build.lib.entry.cli, resolve('src/cli.ts'));
              } else {
                assert.equal(config.root, 'src/ui');
              }
              if (development) {
                const backend = config.plugins.flat().find(
                  (plugin) => plugin?.name === 'vite-plugin-fastify'
                );
                assert.ok(backend);
                // Exercise the configured backend in an isolated working directory.
                const projectRoot = process.cwd();
                const root = resolve(config.root);
                const directory = await mkdtemp(join(tmpdir(), 'uplodah-vite-config-'));
                process.chdir(directory);
                let server;
                try {
                  server = await createServer({
                    configFile: false,
                    root,
                    cacheDir: join(directory, 'cache'),
                    plugins: [backend],
                    logLevel: 'silent',
                    server: { host: '127.0.0.1', port: 0, watch: null },
                  });
                  await server.listen();
                  const response = await fetch(new URL('api/config', server.resolvedUrls.local[0]));
                  assert.equal(response.status, 200);
                  assert.equal((await response.json()).authMode, 'publish');
                } finally {
                  await server?.close();
                  process.chdir(projectRoot);
                  await rm(directory, { recursive: true, force: true });
                }
              }
            }
            console.log('Configurations loaded successfully');
          `,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            TEST_CONFIG_LOADER: loader,
            VITE_CONFIG_NATIVE_IGNORE_WARNING: '',
          },
        }
      );

      expect(stdout).toContain('Configurations loaded successfully');
      expect(stderr).not.toContain("configLoader: 'native'");
    },
    30000
  );
});
