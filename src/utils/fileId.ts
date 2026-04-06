// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import dayjs from 'dayjs';

const uploadIdPattern = /^(\d{8})_(\d{6})_(\d{3})(?:_(\d+))?$/;

const parseUploadId = (
  uploadId: string
): {
  uploadedAt: string;
  sequence: number;
} => {
  const matched = uploadId.match(uploadIdPattern);
  if (!matched) {
    throw new Error('Invalid upload identifier');
  }

  const [, yyyyMMdd, hhmmss, milliseconds, sequenceText] = matched;
  if (!yyyyMMdd || !hhmmss || !milliseconds) {
    throw new Error('Invalid upload identifier');
  }

  const year = Number.parseInt(yyyyMMdd.slice(0, 4), 10);
  const month = Number.parseInt(yyyyMMdd.slice(4, 6), 10);
  const day = Number.parseInt(yyyyMMdd.slice(6, 8), 10);
  const hour = Number.parseInt(hhmmss.slice(0, 2), 10);
  const minute = Number.parseInt(hhmmss.slice(2, 4), 10);
  const second = Number.parseInt(hhmmss.slice(4, 6), 10);
  const milli = Number.parseInt(milliseconds, 10);
  const sequence =
    sequenceText !== undefined ? Number.parseInt(sequenceText, 10) : 0;

  const timestamp = new Date(year, month - 1, day, hour, minute, second, milli);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('Invalid upload timestamp');
  }

  return {
    uploadedAt: timestamp.toISOString(),
    sequence,
  };
};

/**
 * Creates the base upload identifier from a local timestamp.
 * @param date Upload date.
 * @returns Upload identifier base in `YYYYMMDD_HHmmss_SSS` format.
 */
export const createUploadIdBase = (date: Date): string =>
  dayjs(date).format('YYYYMMDD_HHmmss_SSS');

/**
 * Parses an upload identifier into the corresponding upload timestamp.
 * @param uploadId Upload identifier with optional sequential suffix.
 * @returns Upload timestamp in ISO 8601 UTC.
 */
export const extractUploadedAtFromUploadId = (uploadId: string): string => {
  return parseUploadId(uploadId).uploadedAt;
};

/**
 * Compares upload identifiers by newest-first order.
 * @param left Left upload identifier.
 * @param right Right upload identifier.
 * @returns Comparison result for descending sort.
 */
export const compareUploadIdsDesc = (left: string, right: string): number => {
  const leftParsed = parseUploadId(left);
  const rightParsed = parseUploadId(right);

  return (
    rightParsed.uploadedAt.localeCompare(leftParsed.uploadedAt) ||
    rightParsed.sequence - leftParsed.sequence
  );
};
