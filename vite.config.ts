// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import screwUp from 'screw-up';
import prettierMax from 'prettier-max';
import { fastifyHost } from './src/plugins/vite-plugin-fastify';
import { ServerConfig } from './src/types';

const devConfig: ServerConfig = {
  port: 5968,
  configDir: './dev',
  storageDir: './dev/storage',
  realm: 'uplodah dev',
  logLevel: 'debug',
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode, command }) => {
  const isDev = mode === 'development';
  const isBuild = command === 'build';
  const buildTarget = process.env.BUILD_TARGET || 'server';

  if (isDev && !isBuild) {
    return {
      root: 'src/ui',
      base: './',
      plugins: [
        react(),
        prettierMax(),
        screwUp({
          outputMetadataFile: true,
        }),
        fastifyHost(devConfig),
      ],
      server: {
        port: 3000,
      },
      build: {
        outDir: '../../dist/ui',
        emptyOutDir: true,
        chunkSizeWarningLimit: 10000,
      },
    };
  }

  if (isBuild && buildTarget === 'ui') {
    return {
      root: 'src/ui',
      base: './',
      plugins: [
        react(),
        prettierMax({
          failOnError: true,
        }),
      ],
      build: {
        outDir: '../../dist/ui',
        emptyOutDir: false,
        chunkSizeWarningLimit: 10000,
      },
    };
  }

  return {
    plugins: [
      react(),
      dts({
        insertTypesEntry: true,
        exclude: ['src/ui/**/*', 'src/plugins/**/*'],
      }),
      screwUp({
        outputMetadataFile: true,
      }),
      prettierMax(),
    ],
    build: {
      emptyOutDir: true,
      chunkSizeWarningLimit: 10000,
      lib: {
        entry: {
          index: resolve(__dirname, 'src/index.ts'),
          cli: resolve(__dirname, 'src/cli.ts'),
        },
        name: 'uplodah',
        fileName: (format, entryName) =>
          `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
        formats: ['es', 'cjs'],
      },
      rollupOptions: {
        external: [
          'commander',
          'fs/promises',
          'fs',
          'path',
          'url',
          'crypto',
          'stream',
          'buffer',
          'http',
          'dayjs',
          'fastify',
          '@fastify/static',
          '@fastify/send',
          'react',
          'react-dom',
          '@mui/material',
          '@mui/icons-material',
          '@emotion/react',
          '@emotion/styled',
        ],
      },
      sourcemap: true,
      minify: false,
    },
  };
});
