// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import type { ServerUrlInfo } from '../../types';

/**
 * API example entry for display.
 */
export interface ApiCommandExample {
  /**
   * Section title.
   */
  title: string;
  /**
   * Example command text.
   */
  command: string;
}

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.replace(/\/$/, '');

const buildApiUrl = (serverUrl: ServerUrlInfo, path: string): string =>
  serverUrl.baseUrl
    ? `${normalizeBaseUrl(serverUrl.baseUrl)}${path}`
    : `${serverUrl.isHttps ? 'https' : 'http'}://localhost:${serverUrl.port}${path}`;

/**
 * Builds an upload curl example.
 * @param serverUrl Server URL information used in the generated command.
 * @returns Upload curl example.
 */
export const buildUploadCurlExample = (serverUrl: ServerUrlInfo): string =>
  `curl -X POST ${buildApiUrl(serverUrl, '/api/upload/report.txt')} -H "Content-Type: application/octet-stream" --data-binary @./report.txt`;

/**
 * Builds a PUT upload curl example.
 * @param serverUrl Server URL information used in the generated command.
 * @returns Upload curl example.
 */
export const buildPutUploadCurlExample = (serverUrl: ServerUrlInfo): string =>
  `curl -X PUT ${buildApiUrl(serverUrl, '/api/upload/report.txt')} -H "Content-Type: application/octet-stream" --data-binary @./report.txt`;

/**
 * Builds a latest download curl example.
 * @param serverUrl Server URL information used in the generated command.
 * @returns Download curl example.
 */
export const buildDownloadCurlExample = (serverUrl: ServerUrlInfo): string =>
  `curl -L "${buildApiUrl(serverUrl, '/api/files/report.txt')}" -o ./report.txt`;

/**
 * Builds a version-specific download curl example.
 * @param serverUrl Server URL information used in the generated command.
 * @returns Download curl example.
 */
export const buildVersionDownloadCurlExample = (
  serverUrl: ServerUrlInfo
): string =>
  `curl -L "${buildApiUrl(serverUrl, '/api/files/report.txt/20260406_203040_123')}" -o ./report.txt`;

/**
 * Builds both upload and download API examples for the UI.
 * @param serverUrl Server URL information used in the generated commands.
 * @returns API example entries.
 */
export const buildApiCommandExamples = (
  serverUrl: ServerUrlInfo
): ApiCommandExample[] => [
  {
    title: 'Upload API (POST)',
    command: buildUploadCurlExample(serverUrl),
  },
  {
    title: 'Upload API (PUT)',
    command: buildPutUploadCurlExample(serverUrl),
  },
  {
    title: 'Download API (Latest)',
    command: buildDownloadCurlExample(serverUrl),
  },
  {
    title: 'Download API (Version)',
    command: buildVersionDownloadCurlExample(serverUrl),
  },
];
