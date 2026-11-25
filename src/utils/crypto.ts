// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { createSemaphore } from 'async-primitives';

/**
 * Generates a random salt for password hashing
 * @param length - Length of the salt in bytes (default: 16)
 * @returns Base64 encoded salt
 */
export const generateSalt = (length: number = 16): string => {
  return randomBytes(length).toString('base64');
};

/**
 * Identifies the canonical, untagged Base64 encoding used in older user stores.
 * @param hash - Stored password or API password hash.
 * @returns Whether the record contains a legacy 20-byte digest.
 */
export const isLegacyCredentialHash = (hash: string): boolean =>
  typeof hash === 'string' &&
  /^[A-Za-z0-9+/]{27}=$/.test(hash) &&
  Buffer.from(hash, 'base64').toString('base64') === hash;

/**
 * Verifies an existing salted SHA-1 record during the migration period.
 * @param password - Password or API password presented by its holder.
 * @param storedHash - Stored legacy digest.
 * @param salt - The original salt string, as written by older releases.
 * @returns Whether this credential matches a supported legacy record.
 * @remarks This compatibility reader never creates credentials. Its callers
 * replace a verified record before returning authentication success.
 */
export const matchesLegacyCredential = (
  password: string,
  storedHash: string,
  salt: string | undefined
): boolean => {
  if (
    !isLegacyCredentialHash(storedHash) ||
    typeof salt !== 'string' ||
    salt.length === 0
  )
    return false;
  const hash = createHash('sha1');
  hash.update(password + salt);
  return timingSafeEqual(hash.digest(), Buffer.from(storedHash, 'base64'));
};

// Parameters form part of the on-disk format. Do not accept work factors from disk.
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const passwordPrefix = 'scrypt$32768$8$3$';
const passwordWorkers = createSemaphore(2);

const derivePassword = async (
  password: string,
  salt: string
): Promise<Buffer> => {
  if (passwordWorkers.pendingCount >= 8) {
    throw Object.assign(new Error('Password processing is busy'), {
      code: 'PASSWORD_BUSY',
      statusCode: 503,
      headers: { 'Retry-After': '1' },
    });
  }
  const worker = await passwordWorkers.acquire();
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 32, scryptOptions, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  } finally {
    worker.release();
  }
};

const matchesDigest = (
  stored: string,
  prefix: string,
  digest: Buffer
): boolean => {
  if (!stored.startsWith(prefix)) return false;
  const encoded = stored.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/.test(encoded)) return false;
  return timingSafeEqual(digest, Buffer.from(encoded, 'hex'));
};

/**
 * Derives a versioned password hash with scrypt.
 * @param password - User-selected password.
 * @param salt - Random per-password salt.
 * @returns Encoded work factors and digest.
 */
export const hashPassword = async (
  password: string,
  salt: string
): Promise<string> =>
  passwordPrefix + (await derivePassword(password, salt)).toString('hex');

/**
 * Verifies a supported password record.
 * @param password - Submitted password.
 * @param hash - Stored, versioned password hash.
 * @param salt - Stored salt.
 * @returns Whether the password matches.
 */
export const verifyPassword = async (
  password: string,
  hash: string,
  salt: string
): Promise<boolean> =>
  typeof hash === 'string' &&
  (hash.startsWith(passwordPrefix)
    ? matchesDigest(hash, passwordPrefix, await derivePassword(password, salt))
    : matchesLegacyCredential(password, hash, salt));

/**
 * Derives an application-specific verifier for a randomly generated Basic API key.
 * The issued 192-bit secret is the HMAC key. Only its tag for this fixed domain is stored.
 * @param token - API password supplied through HTTP Basic authentication.
 * @returns HMAC-SHA-256 verification tag.
 */
export const apiPasswordDigest = (token: string): Buffer =>
  createHmac('sha256', token).update('uplodah/basic-api/v1').digest();

/**
 * Encodes a token digest for storage on issuance or migration.
 * @param digest - Digest of the presented API password.
 * @returns Versioned HMAC-SHA-256 tag.
 */
export const encodeApiPasswordDigest = (digest: Buffer): string =>
  'hmac-sha256$' + digest.toString('hex');

/**
 * Checks a stored token record using a fixed-length comparison.
 * @param hash - Versioned stored token hash.
 * @param digest - Digest of the presented token.
 * @returns Whether the API password matches.
 */
export const matchesApiPassword = (hash: string, digest: Buffer): boolean =>
  matchesDigest(hash, 'hmac-sha256$', digest);

/**
 * Generates a secure random API password
 * @param length - Length of the API password in bytes (default: 24)
 * @returns Base64 encoded API password
 */
export const generateApiPassword = (length: number = 24): string => {
  return randomBytes(length).toString('base64');
};

/**
 * Generates a secure session token
 * @param length - Length of the token in bytes (default: 32)
 * @returns Hex encoded session token
 */
export const generateSessionToken = (length: number = 32): string => {
  return randomBytes(length).toString('hex');
};

/**
 * Generates a unique user ID
 * @returns UUID-like string
 */
export const generateUserId = (): string => {
  return randomBytes(16).toString('hex');
};
