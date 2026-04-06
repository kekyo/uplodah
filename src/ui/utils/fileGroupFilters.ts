// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import dayjs from 'dayjs';
import { FileGroup, FileRevision } from '../../types';

/**
 * Sorts file groups by file name for stable display ordering.
 * @param groups Source groups.
 * @returns Sorted group copy.
 */
export const sortFileGroups = (groups: FileGroup[]): FileGroup[] =>
  [...groups].sort((left, right) =>
    left.fileName.localeCompare(right.fileName, undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  );

const formatFilterDateTime = (value: string): string =>
  dayjs(value).format('YYYY/MM/DD HH:mm:ss');

const formatUploadIdDateTime = (uploadId: string): string | undefined => {
  const matched = uploadId.match(
    /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/
  );
  if (!matched) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second] = matched;
  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
};

const parseFilterTerms = (filterText: string): string[] =>
  filterText
    .trim()
    .toLowerCase()
    .split(/[,\s;]+/)
    .filter((term) => term.length > 0);

const buildVersionFilterTargets = (
  group: FileGroup,
  version: FileRevision
): string[] => [
  group.fileName,
  group.groupId,
  version.uploadId,
  formatFilterDateTime(version.uploadedAt),
  formatUploadIdDateTime(version.uploadId) ?? '',
];

const sumVersionSizes = (versions: FileRevision[]): number =>
  versions.reduce((totalSize, version) => totalSize + version.size, 0);

const filterGroupVersions = (
  group: FileGroup,
  normalizedTerms: string[]
): FileGroup | undefined => {
  const matchedVersions = group.versions.filter((version) =>
    normalizedTerms.every((term) =>
      buildVersionFilterTargets(group, version).some((target) =>
        target.toLowerCase().includes(term)
      )
    )
  );

  if (matchedVersions.length === 0) {
    return undefined;
  }

  if (matchedVersions.length === group.versions.length) {
    return group;
  }

  return {
    ...group,
    latestUploadedAt: matchedVersions[0]?.uploadedAt ?? group.latestUploadedAt,
    versionCount: matchedVersions.length,
    totalSize: sumVersionSizes(matchedVersions),
    versions: matchedVersions,
  };
};

/**
 * Filters file groups by case-insensitive matching against the file name,
 * version identifiers, and formatted upload timestamps.
 * @param groups Source groups.
 * @param filterText User-entered filter text.
 * @returns Filtered groups.
 */
export const filterFileGroups = (
  groups: FileGroup[],
  filterText: string
): FileGroup[] => {
  const normalizedTerms = parseFilterTerms(filterText);
  if (normalizedTerms.length === 0) {
    return groups;
  }

  return groups.flatMap((group) => {
    const filteredGroup = filterGroupVersions(group, normalizedTerms);
    return filteredGroup ? [filteredGroup] : [];
  });
};

/**
 * Determines whether the filter text contains at least one searchable term.
 * @param filterText User-entered filter text.
 * @returns Whether at least one normalized term exists.
 */
export const hasFileGroupFilterTerms = (filterText: string): boolean =>
  parseFilterTerms(filterText).length > 0;

/**
 * Determines whether the next page should be preloaded while filtering.
 * @param input Decision input values.
 * @returns Whether to trigger auto loading.
 */
export const shouldAutoLoadMore = (input: {
  filterText: string;
  filteredGroupCount: number;
  pageSize: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
}): boolean => {
  if (
    !hasFileGroupFilterTerms(input.filterText) ||
    input.loading ||
    input.loadingMore ||
    !input.hasMore
  ) {
    return false;
  }

  return input.filteredGroupCount < input.pageSize / 2;
};
