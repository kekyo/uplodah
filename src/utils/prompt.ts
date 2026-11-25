// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import * as readline from 'readline';
import { StringDecoder } from 'node:string_decoder';

/**
 * Prompts for user input with optional default value
 */
export const promptInput = (
  rl: readline.Interface,
  prompt: string,
  defaultValue?: string
): Promise<string> => {
  return new Promise((resolve) => {
    const displayPrompt = defaultValue
      ? `${prompt} [${defaultValue}]: `
      : `${prompt}: `;
    rl.question(displayPrompt, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
};

/**
 * Prompts for password input (hidden)
 */
export const promptPassword = (prompt: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Check if we're in an interactive terminal
    if (!process.stdin.isTTY) {
      // Non-interactive mode: read from stdin without masking
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
      });

      process.stdout.write(`${prompt}: `);

      rl.once('line', (input) => {
        process.stdout.write('\n');
        rl.close();
        resolve(input);
      });

      return;
    }

    // Interactive mode: mask password input
    // Don't create readline interface to avoid echo conflicts
    process.stdout.write(`${prompt}: `);

    // Set raw mode to hide input completely
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const password: string[] = [];
    const decoder = new StringDecoder('utf8');

    const onData = (chunk: Buffer) => {
      const str = decoder.write(chunk);

      // Handle multiple characters (e.g., from paste)
      for (const char of str) {
        switch (char) {
          case '\u0003': // Ctrl+C
            process.stdout.write('\n');
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            reject(new Error('Cancelled by user'));
            return;

          case '\r':
          case '\n': // Enter
            process.stdout.write('\n');
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            resolve(password.join(''));
            return;

          case '\u007F': // Backspace (DEL)
          case '\b': // Backspace (BS)
            if (password.length > 0) {
              password.pop();
              process.stdout.write('\b \b'); // Move back, write space, move back again
            }
            break;

          default:
            // Only accept printable characters
            if (!/[\u0000-\u001f\u007f-\u009f]/u.test(char)) {
              password.push(char);
              process.stdout.write('*');
            }
            break;
        }
      }
    };

    process.stdin.on('data', onData);
  });
};
