#!/usr/bin/env node
// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { Command, Option } from 'commander';
import { createConsoleLogger } from './logger';
import { startFastifyServer } from './server';
import { loadConfigFromPath } from './utils/configLoader';
import {
  CliOptionValues,
  resolveCliServerConfig,
  resolveConfigFilePath,
} from './utils/cliConfig';
import * as packageMetadata from './generated/packageMetadata';

const program = new Command();

program
  .name(packageMetadata.name)
  .summary(packageMetadata.description)
  .addHelpText('beforeAll', `${packageMetadata.description}\n`)
  .version(`${packageMetadata.version}-${packageMetadata.git_commit_hash}`)
  .addOption(new Option('-p, --port <port>', 'port number'))
  .addOption(
    new Option(
      '-b, --base-url <url>',
      'fixed base URL for generated download URLs'
    )
  )
  .addOption(new Option('-d, --storage-dir <dir>', 'upload storage directory'))
  .addOption(new Option('-c, --config-file <path>', 'path to config.json file'))
  .addOption(new Option('-r, --realm <realm>', 'UI title and server label'))
  .addOption(
    new Option('-l, --log-level <level>', 'log level').choices([
      'debug',
      'info',
      'warn',
      'error',
      'ignore',
    ])
  )
  .addOption(
    new Option(
      '--trusted-proxies <ips>',
      'comma-separated list of trusted proxy IPs'
    )
  )
  .addOption(
    new Option(
      '--max-upload-size-mb <size>',
      'maximum upload size in MB (1-10000)'
    )
  )
  .action(async (options: CliOptionValues) => {
    const configFilePath = resolveConfigFilePath(options, process.env);
    const tempLogger = createConsoleLogger(packageMetadata.name, 'warn');
    const fileConfig = await loadConfigFromPath(configFilePath, tempLogger);

    let config;
    try {
      config = resolveCliServerConfig({
        options,
        env: process.env,
        fileConfig,
        defaultRealm: `${packageMetadata.name} ${packageMetadata.version}`,
      }).config;
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : 'Failed to resolve config'
      );
      process.exit(1);
      return;
    }

    const logger = createConsoleLogger(
      packageMetadata.name,
      config.logLevel || 'info'
    );

    logger.info(
      `${packageMetadata.name} [${packageMetadata.version}] Starting...`
    );
    logger.info(`Config file: ${configFilePath}`);
    logger.info(`Port: ${config.port}`);
    logger.info(
      config.baseUrl
        ? `Base URL: ${config.baseUrl} (fixed)`
        : `Base URL: http://localhost:${config.port} (auto-detected)`
    );
    logger.info(`Storage directory: ${config.storageDir}`);
    logger.info(`Realm: ${config.realm}`);
    logger.info(`Log level: ${config.logLevel}`);
    logger.info(`Max upload size: ${config.maxUploadSizeMb} MB`);
    if (config.trustedProxies && config.trustedProxies.length > 0) {
      logger.info(`Trusted proxies: ${config.trustedProxies.join(', ')}`);
    }

    const server = await startFastifyServer(config, logger);

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`);
      await server.close();
      process.exit(0);
    };

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  });

void program.parseAsync(process.argv);
