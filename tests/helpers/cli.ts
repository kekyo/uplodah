// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { onTestFinished } from 'vitest';

/**
 * Runs the built CLI with literal arguments and stops a server once it is listening.
 * @param args - Server or validation arguments.
 * @param env - Environment overrides for this invocation.
 * @param expectedExit - Expected CLI exit code.
 * @returns Captured output from both streams.
 */
export const runCli = async (
  args: readonly string[],
  env: Record<string, string> = {},
  expectedExit = 0
): Promise<{ stdout: string; stderr: string }> => {
  const child = spawn(process.execPath, [resolve('dist/cli.mjs'), ...args], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  onTestFinished(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    stdout += chunk;
    if (!child.killed && stdout.includes('Fastify server listening'))
      child.kill('SIGTERM');
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr += chunk;
  });
  const [code, signal] = await once(child, 'close');
  if (
    code !== expectedExit &&
    !(expectedExit === 0 && child.killed && signal === 'SIGTERM')
  )
    throw new Error(
      `Unexpected CLI exit (${code ?? signal}): ${stdout}\n${stderr}`
    );
  return { stdout, stderr };
};
