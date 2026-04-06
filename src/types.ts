// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

/**
 * Logger interface.
 */
export interface Logger {
  /**
   * Writes a debug log entry.
   * @param msg Message to log.
   */
  readonly debug: (msg: string) => void;
  /**
   * Writes an info log entry.
   * @param msg Message to log.
   */
  readonly info: (msg: string) => void;
  /**
   * Writes a warning log entry.
   * @param msg Message to log.
   */
  readonly warn: (msg: string) => void;
  /**
   * Writes an error log entry.
   * @param msg Message to log.
   */
  readonly error: (msg: string) => void;
}

/**
 * Log level definitions.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'ignore';

/**
 * URL information exposed to the UI.
 */
export interface ServerUrlInfo {
  /**
   * Fixed external base URL. When omitted, clients fall back to localhost and port.
   */
  baseUrl?: string;
  /**
   * Listening port number.
   */
  port: number;
  /**
   * Whether the externally visible URL is HTTPS.
   */
  isHttps: boolean;
}

/**
 * Public server configuration.
 */
export interface ServerConfig {
  /**
   * Port number for the HTTP server.
   */
  port?: number;
  /**
   * Fixed external base URL. When omitted, it is inferred from the request.
   */
  baseUrl?: string;
  /**
   * Trusted reverse proxy IP addresses.
   */
  trustedProxies?: string[];
  /**
   * Root directory for uploaded file storage.
   */
  storageDir?: string;
  /**
   * Directory where configuration files are stored.
   */
  configDir?: string;
  /**
   * UI title and server label.
   */
  realm?: string;
  /**
   * Logging verbosity.
   */
  logLevel?: LogLevel;
  /**
   * Maximum upload body size in megabytes.
   */
  maxUploadSizeMb?: number;
  /**
   * Virtual storage directory rules keyed by paths such as `/tmp`.
   */
  storage?: Record<string, StorageEntryConfig>;
}

/**
 * Storage rule for a virtual directory.
 */
export interface StorageEntryConfig {
  /**
   * Reject uploads into this directory and its descendants.
   */
  readonly?: boolean;
  /**
   * Automatically delete uploads after this many seconds.
   */
  expireSeconds?: number;
}

/**
 * Normalized runtime configuration.
 */
export interface ResolvedServerConfig {
  /**
   * Port number for the HTTP server.
   */
  port: number;
  /**
   * Fixed external base URL. When omitted, it is inferred from the request.
   */
  baseUrl: string | undefined;
  /**
   * Trusted reverse proxy IP addresses.
   */
  trustedProxies: string[] | undefined;
  /**
   * Root directory for uploaded file storage.
   */
  storageDir: string;
  /**
   * Directory where configuration files are stored.
   */
  configDir: string;
  /**
   * UI title and server label.
   */
  realm: string;
  /**
   * Logging verbosity.
   */
  logLevel: LogLevel;
  /**
   * Maximum upload body size in megabytes.
   */
  maxUploadSizeMb: number;
  /**
   * Virtual storage directory rules keyed by paths such as `/tmp`.
   */
  storage: Record<string, StorageEntryConfig> | undefined;
}

/**
 * Single uploaded file revision.
 */
export interface FileRevision {
  /**
   * Group identifier derived from the file name.
   */
  groupId: string;
  /**
   * Unique upload identifier.
   */
  uploadId: string;
  /**
   * Original file name.
   */
  fileName: string;
  /**
   * Upload timestamp in ISO 8601 UTC.
   */
  uploadedAt: string;
  /**
   * File size in bytes.
   */
  size: number;
  /**
   * Relative version-specific download path.
   */
  downloadPath: string;
  /**
   * Absolute version-specific download URL.
   */
  downloadUrl?: string;
  /**
   * Relative latest-version download path.
   */
  latestDownloadPath?: string;
  /**
   * Absolute latest-version download URL.
   */
  latestDownloadUrl?: string;
}

/**
 * File group keyed by the same file name.
 */
export interface FileGroup {
  /**
   * Group identifier derived from the file name.
   */
  groupId: string;
  /**
   * Original file name.
   */
  fileName: string;
  /**
   * Latest upload timestamp in ISO 8601 UTC.
   */
  latestUploadedAt: string;
  /**
   * Number of revisions in this group.
   */
  versionCount: number;
  /**
   * Total size of all revisions in bytes.
   */
  totalSize: number;
  /**
   * Revisions sorted by most recent upload first.
   */
  versions: FileRevision[];
}

/**
 * Response body for file listing.
 */
export interface FileListResponse {
  /**
   * File groups sorted by latest upload first.
   */
  groups: FileGroup[];
  /**
   * Total group count.
   */
  totalGroups: number;
  /**
   * Total stored revision count.
   */
  totalFiles: number;
  /**
   * Current offset in the group list.
   */
  skip: number;
  /**
   * Requested page size.
   */
  take: number;
}

/**
 * Response body for successful uploads.
 */
export interface UploadResponse {
  /**
   * Human-readable upload status.
   */
  message: string;
  /**
   * Stored revision metadata.
   */
  file: FileRevision;
}

/**
 * Writable upload directory exposed to the UI.
 */
export interface UploadDirectory {
  /**
   * Virtual directory path used as the upload destination.
   */
  path: string;
  /**
   * Automatic expiration in seconds when configured.
   */
  expireSeconds?: number;
}

/**
 * Response body for upload directory listing.
 */
export interface UploadDirectoriesResponse {
  /**
   * Writable upload directories available to the current UI.
   */
  directories: UploadDirectory[];
}

/**
 * Storage section exposed to the file-list UI.
 */
export interface StorageSection {
  /**
   * Virtual directory path that anchors a visible section.
   */
  path: string;
}

/**
 * UI configuration payload.
 */
export interface AppConfigResponse {
  /**
   * Display title.
   */
  realm: string;
  /**
   * URL information for generated examples.
   */
  serverUrl: ServerUrlInfo;
  /**
   * Package name.
   */
  name: string;
  /**
   * Package version.
   */
  version: string;
  /**
   * Authentication mode.
   */
  authMode: 'none';
  /**
   * Whether each auth capability is enabled.
   */
  authEnabled: {
    general: false;
    publish: false;
    admin: false;
  };
  /**
   * Current authenticated user.
   */
  currentUser: null;
  /**
   * Maximum upload size in megabytes.
   */
  maxUploadSizeMb: number;
  /**
   * Whether storage rules are explicitly configured on the server.
   */
  storageConfigured: boolean;
  /**
   * Storage-backed section anchors used to group the file list.
   */
  storageSections: StorageSection[];
}
