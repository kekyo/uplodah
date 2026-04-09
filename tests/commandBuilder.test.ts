// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, it } from 'vitest';
import {
  buildDownloadCommand,
  buildListFilesCommand,
  buildUploadCommand,
  resolveExamplePublicPath,
  shouldShowAuthenticatedApiExamples,
  shouldShowUploadCommandInRepositoryInfo,
} from '../src/ui/utils/commandBuilder';

describe('commandBuilder', () => {
  it('should build upload command with encoded path and local file name', () => {
    const command = buildUploadCommand({
      serverUrl: {
        port: 5968,
        isHttps: false,
      },
      publicPath: 'reports/2026 summary.txt',
    });

    expect(command).toBe(
      'curl -X POST "http://localhost:5968/api/upload/reports/2026%20summary.txt" -H "Content-Type: application/octet-stream" --data-binary @./2026 summary.txt'
    );
  });

  it('should build authenticated upload command with baseUrl', () => {
    const command = buildUploadCommand({
      serverUrl: {
        baseUrl: 'https://files.example.com/u',
        port: 5968,
        isHttps: true,
      },
      publicPath: 'incoming/report.txt',
      username: 'alice',
      apiPassword: 'secret',
    });

    expect(command).toContain(
      '"https://files.example.com/u/api/upload/incoming/report.txt"'
    );
    expect(command).toContain(' -u alice:secret ');
  });

  it('should build list files command with pagination and authentication', () => {
    const command = buildListFilesCommand({
      serverUrl: {
        baseUrl: 'https://files.example.com',
        port: 5968,
        isHttps: true,
      },
      skip: 20,
      take: 50,
      username: 'alice',
      apiPassword: 'secret',
    });

    expect(command).toBe(
      'curl "https://files.example.com/api/files?skip=20&take=50" -u alice:secret'
    );
  });

  it('should build latest download command by default', () => {
    const command = buildDownloadCommand({
      serverUrl: {
        port: 5968,
        isHttps: false,
      },
      publicPath: 'incoming/report.txt',
    });

    expect(command).toBe(
      'curl -L "http://localhost:5968/api/files/incoming/report.txt" -o ./report.txt'
    );
  });

  it('should build specific version download command', () => {
    const command = buildDownloadCommand({
      serverUrl: {
        baseUrl: 'https://files.example.com',
        port: 5968,
        isHttps: true,
      },
      publicPath: 'incoming/report.txt',
      uploadId: '20260408_120000_000',
      username: 'alice',
      apiPassword: 'secret',
    });

    expect(command).toBe(
      'curl -L "https://files.example.com/api/files/incoming/report.txt/20260408_120000_000" -u alice:secret -o ./report.txt'
    );
  });

  it('should resolve example public path for root uploads', () => {
    expect(resolveExamplePublicPath(undefined)).toBe('report.txt');
    expect(resolveExamplePublicPath(['/'])).toBe('report.txt');
  });

  it('should resolve example public path for configured directories', () => {
    expect(resolveExamplePublicPath(['/incoming'], 'photo.jpg')).toBe(
      'incoming/photo.jpg'
    );
  });

  it('should return undefined when no upload directories are available', () => {
    expect(resolveExamplePublicPath([])).toBeUndefined();
  });

  it('should show anonymous upload examples only for authMode none', () => {
    expect(shouldShowUploadCommandInRepositoryInfo('none')).toBe(true);
    expect(shouldShowUploadCommandInRepositoryInfo('publish')).toBe(false);
    expect(shouldShowUploadCommandInRepositoryInfo('full')).toBe(false);
  });

  it('should show authenticated API examples for publish and full', () => {
    expect(shouldShowAuthenticatedApiExamples('none')).toBe(false);
    expect(shouldShowAuthenticatedApiExamples('publish')).toBe(true);
    expect(shouldShowAuthenticatedApiExamples('full')).toBe(true);
  });
});
