// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import type { FileGroup, StorageSection } from '../../types';
import { parseVirtualFileName } from '../../utils/storagePolicy';

/**
 * File group display item assigned to a visible section.
 */
export interface FileGroupSectionItem {
  /**
   * Original file group payload.
   */
  group: FileGroup;
  /**
   * Display name relative to the section anchor when possible.
   */
  displayFileName: string;
}

/**
 * Visible file-list section derived from configured storage anchors.
 */
export interface FileGroupSection {
  /**
   * Stable section identifier.
   */
  id: string;
  /**
   * Human-readable section title.
   */
  title: string;
  /**
   * Storage anchor path when backed by configuration.
   */
  path: string | undefined;
  /**
   * Whether this section represents unmatched file groups.
   */
  isFallback: boolean;
  /**
   * File groups that belong to the section.
   */
  items: FileGroupSectionItem[];
}

const fallbackSectionId = '__other__';

const matchesSectionPath = (
  directoryPath: string,
  sectionPath: string,
  storageConfigured: boolean
): boolean => {
  if (sectionPath === '/') {
    return storageConfigured ? true : directoryPath === '/';
  }

  return (
    directoryPath === sectionPath || directoryPath.startsWith(`${sectionPath}/`)
  );
};

const resolveSectionPath = (
  group: FileGroup,
  storageSections: StorageSection[],
  storageConfigured: boolean
): string | undefined => {
  const parsedFileName = parseVirtualFileName(group.fileName);
  let matchedSectionPath: string | undefined = undefined;

  for (const storageSection of storageSections) {
    if (
      !matchesSectionPath(
        parsedFileName.directoryPath,
        storageSection.path,
        storageConfigured
      )
    ) {
      continue;
    }

    if (
      matchedSectionPath === undefined ||
      storageSection.path.length > matchedSectionPath.length
    ) {
      matchedSectionPath = storageSection.path;
    }
  }

  return matchedSectionPath;
};

const buildRelativeDisplayFileName = (
  group: FileGroup,
  sectionPath: string | undefined
): string => {
  if (sectionPath === undefined) {
    return group.fileName;
  }

  if (sectionPath === '/') {
    return group.fileName.startsWith('/')
      ? group.fileName.slice(1)
      : group.fileName;
  }

  const sectionPrefix = `${sectionPath}/`;
  return group.fileName.startsWith(sectionPrefix)
    ? group.fileName.slice(sectionPrefix.length)
    : group.fileName;
};

const buildSectionTitle = (sectionPath: string | undefined): string => {
  if (sectionPath === undefined) {
    return 'Other';
  }

  return sectionPath === '/' ? 'Root (/)' : sectionPath;
};

/**
 * Groups file groups into storage-backed sections for display.
 * @param input File groups and storage section anchors.
 * @returns Ordered visible sections that contain matching file groups.
 */
export const buildFileGroupSections = (input: {
  groups: FileGroup[];
  storageSections: StorageSection[];
  storageConfigured: boolean;
}): FileGroupSection[] => {
  const sectionItemsByPath = new Map<string, FileGroupSectionItem[]>();
  const fallbackItems: FileGroupSectionItem[] = [];

  for (const group of input.groups) {
    const matchedSectionPath = resolveSectionPath(
      group,
      input.storageSections,
      input.storageConfigured
    );
    const item = {
      group,
      displayFileName: buildRelativeDisplayFileName(group, matchedSectionPath),
    };

    if (matchedSectionPath === undefined) {
      fallbackItems.push(item);
      continue;
    }

    const existingItems = sectionItemsByPath.get(matchedSectionPath);
    if (existingItems) {
      existingItems.push(item);
    } else {
      sectionItemsByPath.set(matchedSectionPath, [item]);
    }
  }

  const sections: FileGroupSection[] = input.storageSections
    .map((storageSection) => {
      const items = sectionItemsByPath.get(storageSection.path) ?? [];
      return {
        id: storageSection.path,
        title: buildSectionTitle(storageSection.path),
        path: storageSection.path,
        isFallback: false,
        items,
      };
    })
    .filter((section) => section.items.length > 0);

  if (fallbackItems.length > 0) {
    sections.push({
      id: fallbackSectionId,
      title: buildSectionTitle(undefined),
      path: undefined,
      isFallback: true,
      items: fallbackItems,
    });
  }

  return sections;
};
