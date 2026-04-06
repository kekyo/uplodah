// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { Logger } from '../types';

interface GenericRequest {
  protocol: string;
  ip?: string;
  socket: {
    remoteAddress?: string;
  };
  headers: {
    [key: string]: string | string[] | undefined;
  };
}

/**
 * Configuration for URL resolution.
 */
export interface UrlResolverConfig {
  /**
   * Fixed external base URL.
   */
  baseUrl?: string;
  /**
   * Trusted reverse proxy IP addresses.
   */
  trustedProxies?: string[];
}

/**
 * Resolved request URL information.
 */
export interface ResolvedUrl {
  /**
   * Base URL without a trailing slash.
   */
  baseUrl: string;
  /**
   * Whether the base URL is fixed by configuration.
   */
  isFixed: boolean;
}

/**
 * Extracts the path segment from a configured base URL.
 * @param baseUrl Configured base URL.
 * @returns Path prefix without a trailing slash.
 */
export const extractPathFromBaseUrl = (baseUrl: string | undefined): string => {
  if (!baseUrl) {
    return '';
  }

  try {
    return new URL(baseUrl).pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
};

/**
 * Creates a URL resolver that understands proxy headers and base path prefixes.
 * @param logger Logger used for diagnostic output.
 * @param config Resolver configuration.
 * @returns URL resolver object.
 */
export const createUrlResolver = (
  logger: Logger,
  config: UrlResolverConfig = {}
) => {
  const { baseUrl: fixedBaseUrl, trustedProxies = [] } = config;

  const isRequestFromTrustedProxy = (request: GenericRequest): boolean => {
    if (trustedProxies.length === 0) {
      logger.debug('resolveUrl: no trustedProxies configured');
      return true;
    }

    const clientIp = request.ip || request.socket.remoteAddress;
    const forwardedFor = request.headers['x-forwarded-for'] as string;
    const sourceIps = [clientIp];

    if (forwardedFor) {
      sourceIps.push(...forwardedFor.split(',').map((ip) => ip.trim()));
    }

    const isTrusted = sourceIps.some((ip) => trustedProxies.includes(ip ?? ''));
    logger.debug(`resolveUrl: trusted proxy=${isTrusted}`);
    return isTrusted;
  };

  const parseForwardedHeader = (forwarded: string): Record<string, string> => {
    const parsed: Record<string, string> = {};

    for (const pair of forwarded.split(';').map((value) => value.trim())) {
      const [key, value] = pair.split('=').map((entry) => entry.trim());
      if (key && value) {
        parsed[key.toLowerCase()] = value.replaceAll('"', '');
      }
    }

    return parsed;
  };

  const resolveUrl = (request: GenericRequest): ResolvedUrl => {
    if (fixedBaseUrl) {
      const normalizedBaseUrl = fixedBaseUrl.replace(/\/$/, '');
      logger.debug(`resolveUrl: fixed=${normalizedBaseUrl}`);
      return {
        baseUrl: normalizedBaseUrl,
        isFixed: true,
      };
    }

    let protocol = request.protocol;
    let host = (request.headers.host as string) || 'localhost';
    let port: string | undefined;

    if (isRequestFromTrustedProxy(request)) {
      const forwarded = request.headers['forwarded'] as string;
      if (forwarded) {
        const parsed = parseForwardedHeader(forwarded);
        if (parsed['proto']) {
          protocol = parsed['proto'];
        }
        if (parsed['host']) {
          host = parsed['host'];
        }
        if (parsed['port']) {
          port = parsed['port'];
        }
      } else {
        const forwardedProto = request.headers['x-forwarded-proto'] as string;
        const forwardedHost = request.headers['x-forwarded-host'] as string;
        const forwardedPort = request.headers['x-forwarded-port'] as string;

        if (forwardedProto) {
          protocol = forwardedProto;
        }
        if (forwardedHost) {
          host = forwardedHost;
        }
        if (forwardedPort) {
          port = forwardedPort;
        }
      }
    }

    const hostWithPort = port && !host.includes(':') ? `${host}:${port}` : host;
    const baseUrl = `${protocol}://${hostWithPort}`;
    logger.debug(`resolveUrl: resolved=${baseUrl}`);

    return {
      baseUrl,
      isFixed: false,
    };
  };

  const extractPathPrefix = (request: GenericRequest): string => {
    if (fixedBaseUrl) {
      const pathPrefix = extractPathFromBaseUrl(fixedBaseUrl);
      if (pathPrefix) {
        logger.debug(`extractPathPrefix: fixed=${pathPrefix}`);
        return pathPrefix;
      }
    }

    if (isRequestFromTrustedProxy(request)) {
      const forwardedPath = request.headers['x-forwarded-path'] as string;
      if (forwardedPath) {
        const normalizedPath = forwardedPath.replace(/\/$/, '');
        logger.debug(`extractPathPrefix: forwarded=${normalizedPath}`);
        return normalizedPath;
      }
    }

    return '';
  };

  return {
    resolveUrl,
    extractPathPrefix,
    isFixedUrl: (): boolean => fixedBaseUrl !== undefined,
  };
};

/**
 * Gets the fixed base URL from the environment.
 * @returns Base URL from `UPLODAH_BASE_URL`.
 */
export const getBaseUrlFromEnv = (): string | undefined =>
  process.env['UPLODAH_BASE_URL'];

/**
 * Gets the trusted proxies list from the environment.
 * @returns Trusted proxy IPs from `UPLODAH_TRUSTED_PROXIES`.
 */
export const getTrustedProxiesFromEnv = (): string[] | undefined => {
  const value = process.env['UPLODAH_TRUSTED_PROXIES'];
  if (!value) {
    return undefined;
  }

  return value
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);
};
