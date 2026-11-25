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
 * Reproduces the Base64 digest in older user stores for comparison only.
 * @param password - Credential supplied by its holder.
 * @param salt - Salt written with the original digest.
 * @returns The historical representation of the submitted credential.
 */
const legacyCredentialDigest = (password: string, salt: string): string => {
  const hash = createHash('sha1');
  hash.update(password + salt);
  return hash.digest('base64');
};

/**
 * Verifies a password against a hash
 * @param password - Plain text password to verify
 * @param hash - Stored hash
 * @param salt - Salt used for hashing
 * @returns True if password matches
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
 * Identifies the canonical, untagged Base64 encoding used in older user stores.
 * @param hash - Stored password or API password hash.
 * @returns Whether the record contains a legacy 20-byte digest.
 */
export const isLegacyCredentialHash = (hash: string): boolean =>
  typeof hash === 'string' &&
  /^[A-Za-z0-9+/]{27}=$/.test(hash) &&
  Buffer.from(hash, 'base64').toString('base64') === hash;

/**
 * Compares a submitted credential with a canonical record from older releases.
 * @param password - Login or API password supplied by its holder.
 * @param storedHash - Historical Base64 digest from the account record.
 * @param salt - Salt stored with the historical digest.
 * @returns Whether the credential matched and can be upgraded.
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
  return timingSafeEqual(
    Buffer.from(legacyCredentialDigest(password, salt), 'ascii'),
    Buffer.from(storedHash, 'ascii')
  );
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
 * Derives an application-specific verifier for a randomly generated Basic API key.
 * The issued 192-bit secret is the HMAC key. Only its tag for this fixed domain is stored.
 * @param token - API password supplied through HTTP Basic authentication.
 * @returns HMAC-SHA-256 verification tag.
 */
export const apiPasswordDigest = (token: string): Buffer =>
  // HMAC pads short keys with zero bytes. Bind the input length to its tag.
  createHmac('sha256', token)
    .update(`uplodah/basic-api/v1:${Buffer.byteLength(token, 'utf8')}`)
    .digest();

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
