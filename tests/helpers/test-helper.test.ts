// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTestPort } from './test-helper';

const closeServer = async (server: net.Server): Promise<void> =>
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const listenOnPort = async (port: number): Promise<net.Server> =>
  await new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      resolve(server);
    });
  });

describe('test-helper', () => {
  const servers: net.Server[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(servers.splice(0).map(closeServer));
  });

  it('should skip an occupied candidate port', async () => {
    const basePort = 20000;
    const occupiedPort = basePort + (process.pid % 1000);

    servers.push(await listenOnPort(occupiedPort));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const port = await getTestPort(basePort);

    expect(port).not.toBe(occupiedPort);
    expect(port).toBe(occupiedPort + 1);
  });

  it('should skip fetch-blocked candidate ports', async () => {
    const basePort = 6000 - (process.pid % 1000);

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const port = await getTestPort(basePort);

    expect(port).not.toBe(6000);
    expect(port).toBe(6001);
  });
});
