// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import {
  type MouseEvent,
  type SyntheticEvent,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import HomeIcon from '@mui/icons-material/Home';
import FolderCopyIcon from '@mui/icons-material/FolderCopy';
import FileIcon from '@mui/icons-material/InsertDriveFile';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { TypedMessage, useTypedMessage } from 'typed-message';
import { messages } from '../generated/messages';
import { apiFetch } from './utils/apiClient';
import { fileGroupIconsByExtension } from './fileIcons';

dayjs.extend(utc);

interface FileVersion {
  uploadId: string;
  uploadedAt: string;
  size: number;
  versionDownloadPath: string;
  canDelete: boolean;
  uploadedBy?: string;
  tags?: string[];
}

interface FileGroupSummary {
  publicPath: string;
  displayPath: string;
  directoryPath: string;
  browseDirectoryPath: string;
  browseRelativePath: string;
  fileName: string;
  latestUploadId: string;
  latestUploadedAt: string;
  latestDownloadPath: string;
}

interface DirectorySummary {
  directoryPath: string;
  description?: string;
  accept: Array<'store' | 'delete'>;
  fileGroupCount: number;
}

interface BrowseDirectoriesResponse {
  items: DirectorySummary[];
}

interface BrowseFileGroupsResponse {
  directoryPath: string;
  items: FileGroupSummary[];
}

interface BrowseVersionsResponse {
  publicPath: string;
  items: FileVersion[];
}

interface BrowseSearchResponse {
  query: string;
  items: FileGroupSummary[];
}

type ArchiveRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface CreateArchiveResponse {
  requestId: string;
  status: ArchiveRequestStatus;
  statusPath: string;
  downloadPath: string;
}

interface ArchiveStatusResponse {
  status: ArchiveRequestStatus;
  downloadPath?: string;
  error?: string;
}

interface ServerConfig {
  authMode: 'none' | 'publish' | 'full';
  maxDownloadSizeMb?: number;
  currentUser?: {
    username: string;
    role: string;
    authenticated: boolean;
  } | null;
}

/**
 * Package list imperative handle.
 */
export interface PackageListRef {
  refresh: () => void;
}

interface PackageListProps {
  serverConfig?: ServerConfig | null;
}

interface DirectorySection {
  directoryPath: string;
  description?: string;
  fileGroupCount: number;
  files: FileGroupSummary[];
}

/**
 * Selected file version used for archive downloads.
 */
export interface FileVersionSelectionItem {
  /** Public file path relative to the storage root. */
  publicPath: string;
  /** Upload identifier of the selected version. */
  uploadId: string;
}

interface PackageListEntriesProps {
  sections: readonly DirectorySection[];
  loadedDirectoryPanels: ReadonlySet<string>;
  directoryLoadingPanels: ReadonlySet<string>;
  directoryErrorsByPath: Readonly<Record<string, string | undefined>>;
  expandedDirectoryPanels: ReadonlySet<string>;
  expandedPanels: ReadonlySet<string>;
  versionsByPublicPath: Readonly<
    Record<string, readonly FileVersion[] | undefined>
  >;
  versionErrorsByPublicPath: Readonly<Record<string, string | undefined>>;
  versionLoadingPanels: ReadonlySet<string>;
  selectedVersionKeys: ReadonlySet<string>;
  canDeleteFileGroupVersion: (
    file: FileGroupSummary,
    version: FileVersion
  ) => boolean;
  onToggleVersionSelection: (
    file: FileGroupSummary,
    version: FileVersion
  ) => void;
  onToggleFileGroupVersions: (
    file: FileGroupSummary,
    selected: boolean
  ) => void;
  onToggleDirectoryVersions: (
    section: DirectorySection,
    selected: boolean
  ) => void;
  onDeleteVersionRequest: (
    file: FileGroupSummary,
    version: FileVersion
  ) => void;
  onDirectoryAccordionChange: (
    directoryPath: string,
    isExpanded: boolean
  ) => void;
  onAccordionChange: (publicPath: string, isExpanded: boolean) => void;
}

/**
 * Decide whether the package list should temporarily replace the UI with the
 * initial full-screen loading indicator.
 * @param browseLoading Whether browse data is loading.
 * @param isSearchMode Whether the list is currently showing search results.
 * @returns True only while the initial browse screen is still loading.
 */
export const shouldShowPackageListInitialLoading = (
  browseLoading: boolean,
  isSearchMode: boolean
): boolean => browseLoading && !isSearchMode;

type FileGroupIconComponent = typeof FileIcon;

const getNormalizedFileExtension = (fileName: string): string | undefined => {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
    return undefined;
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase();
};

/**
 * Resolve the icon component used for a file-group entry by file extension.
 * @param fileName File name shown in the file-group list.
 * @returns A representative MUI icon component, or the default file icon.
 * @remarks Representative mappings include pdf, image, video, audio, archive,
 * text, document, spreadsheet, structured data, web, script, and source files.
 */
export const resolveFileGroupIconComponent = (
  fileName: string
): FileGroupIconComponent => {
  const extension = getNormalizedFileExtension(fileName);
  if (extension === undefined) {
    return FileIcon;
  }

  return fileGroupIconsByExtension[extension] ?? FileIcon;
};

const formatSize = (size: number): string => {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
};

const formatUtcOffset = (offsetMinutes: number): string => {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteOffsetMinutes / 60)).padStart(2, '0');
  const minutes = absoluteOffsetMinutes % 60;

  if (minutes === 0) {
    return `${sign}${hours}`;
  }

  return `${sign}${hours}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Format an uploaded timestamp as browser-local time plus UTC.
 * @param uploadedAt ISO-8601 timestamp.
 * @param localOffsetMinutes Optional browser-local UTC offset in minutes.
 * @returns Formatted timestamp string.
 */
export const formatUploadedAt = (
  uploadedAt: string,
  localOffsetMinutes?: number
): string => {
  const utcDate = dayjs.utc(uploadedAt);
  if (!utcDate.isValid()) {
    return uploadedAt;
  }

  const resolvedOffsetMinutes =
    localOffsetMinutes ?? dayjs(uploadedAt).utcOffset();
  const localDate = utcDate.utcOffset(resolvedOffsetMinutes);

  return `${localDate.format('YYYY/MM/DD HH:mm:ss')} ${formatUtcOffset(resolvedOffsetMinutes)} (${utcDate.format('YYYY/MM/DD HH:mm:ss [UTC]')})`;
};

const buildFileGroupLabel = (
  file: Pick<FileGroupSummary, 'browseRelativePath' | 'displayPath'>
): string => file.browseRelativePath || file.displayPath;

/**
 * Build directory sections for file-group lists using the browse directory
 * resolved by the API.
 * @param files File-group summaries to arrange into sections.
 * @param directoryOrder Browse-directory order returned by the server.
 * @param explicitCountsByDirectory Optional total counts keyed by browse
 * directory path.
 * @param descriptionsByDirectory Optional descriptions keyed by browse
 * directory path.
 * @returns Directory sections in browse-directory order.
 */
export const buildDirectorySections = (
  files: readonly FileGroupSummary[],
  directoryOrder: readonly string[],
  explicitCountsByDirectory: ReadonlyMap<string, number> | undefined,
  descriptionsByDirectory: ReadonlyMap<string, string | undefined> | undefined
): DirectorySection[] => {
  const sections = new Map<string, FileGroupSummary[]>();

  files.forEach((file) => {
    const sectionDirectoryPath = file.browseDirectoryPath;
    const sectionFiles = sections.get(sectionDirectoryPath);
    if (sectionFiles) {
      sectionFiles.push(file);
      return;
    }
    sections.set(sectionDirectoryPath, [file]);
  });

  const remainingDirectories = Array.from(sections.keys()).filter(
    (directoryPath) => !directoryOrder.includes(directoryPath)
  );
  remainingDirectories.sort((left, right) => left.localeCompare(right));

  return [...directoryOrder, ...remainingDirectories]
    .map((directoryPath) => {
      const sectionFiles = sections.get(directoryPath) ?? [];
      const fileGroupCount =
        explicitCountsByDirectory?.get(directoryPath) ?? sectionFiles.length;

      return {
        directoryPath,
        description: descriptionsByDirectory?.get(directoryPath),
        fileGroupCount,
        files: sectionFiles,
      };
    })
    .filter(
      (section) => section.fileGroupCount > 0 && section.files.length > 0
    );
};

/**
 * Build browse-mode directory sections from the directory summaries and any
 * currently loaded file-group entries.
 * @param directories Directory summaries returned by the browse API.
 * @param browseFileGroupsByDirectory Loaded file-group entries keyed by
 * directory path.
 * @returns Directory sections used by the browse-mode accordion.
 */
export const buildBrowseDirectorySections = (
  directories: readonly DirectorySummary[],
  browseFileGroupsByDirectory: Readonly<Record<string, FileGroupSummary[]>>
): DirectorySection[] =>
  directories.map((directory) => {
    const loadedFiles = browseFileGroupsByDirectory[directory.directoryPath];

    return {
      directoryPath: directory.directoryPath,
      description: directory.description,
      fileGroupCount: loadedFiles?.length ?? directory.fileGroupCount,
      files: Array.from(loadedFiles ?? []),
    };
  });

/**
 * Build a stable selection key for a file version.
 * @param item File version identity.
 * @returns Serialized selection key.
 */
export const createFileVersionSelectionKey = (
  item: FileVersionSelectionItem
): string => JSON.stringify([item.publicPath, item.uploadId]);

/**
 * Parse a serialized file-version selection key.
 * @param key Serialized selection key.
 * @returns File version identity, or undefined when the key is invalid.
 */
export const parseFileVersionSelectionKey = (
  key: string
): FileVersionSelectionItem | undefined => {
  try {
    const value = JSON.parse(key);
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string'
    ) {
      return {
        publicPath: value[0],
        uploadId: value[1],
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
};

/**
 * Collect loaded file-version selection items for a visible file scope.
 * @param params Visible files and currently loaded version cache.
 * @returns Loaded file-version identities in display order.
 */
export const collectLoadedFileVersionSelectionItems = ({
  files,
  versionsByPublicPath,
}: {
  files: readonly Pick<FileGroupSummary, 'publicPath'>[];
  versionsByPublicPath: Readonly<
    Record<string, readonly Pick<FileVersion, 'uploadId'>[] | undefined>
  >;
}): FileVersionSelectionItem[] =>
  files.flatMap((file) =>
    (versionsByPublicPath[file.publicPath] ?? []).map((version) => ({
      publicPath: file.publicPath,
      uploadId: version.uploadId,
    }))
  );

const getDirectorySegments = (directoryPath: string): string[] =>
  directoryPath === '/'
    ? []
    : directoryPath.split('/').filter((segment) => segment.length > 0);

const getPublicPathSegments = (publicPath: string): string[] =>
  publicPath.split('/').filter((segment) => segment.length > 0);

const isDirectoryPrefixMatch = (
  publicPathSegments: readonly string[],
  directorySegments: readonly string[]
): boolean =>
  directorySegments.length < publicPathSegments.length &&
  directorySegments.every(
    (segment, index) => publicPathSegments[index] === segment
  );

/**
 * Resolve the browse directory path that owns a public path.
 * @param publicPath Public file path.
 * @param directoryPaths Candidate browse directory paths.
 * @returns The most specific matching browse directory path.
 */
export const resolveBrowseDirectoryPathForPublicPath = (
  publicPath: string,
  directoryPaths: readonly string[]
): string | undefined => {
  const publicPathSegments = getPublicPathSegments(publicPath);
  return directoryPaths
    .filter((directoryPath) =>
      isDirectoryPrefixMatch(
        publicPathSegments,
        getDirectorySegments(directoryPath)
      )
    )
    .sort(
      (left, right) =>
        getDirectorySegments(right).length -
          getDirectorySegments(left).length || left.localeCompare(right)
    )[0];
};

/**
 * Filter selected versions to the currently visible file groups.
 * @param params Selected version items and visible file groups.
 * @returns Selected versions whose public paths are visible.
 */
export const filterSelectedArchiveItemsForVisibleFiles = ({
  selectedItems,
  visibleFiles,
}: {
  selectedItems: readonly FileVersionSelectionItem[];
  visibleFiles: readonly Pick<FileGroupSummary, 'publicPath'>[];
}): FileVersionSelectionItem[] => {
  const visiblePublicPaths = new Set(
    visibleFiles.map((file) => file.publicPath)
  );
  return selectedItems.filter((item) =>
    visiblePublicPaths.has(item.publicPath)
  );
};

/**
 * Calculate the total size of selected archive versions.
 * @param params Selected version items and loaded version metadata.
 * @returns Total known payload size in bytes.
 */
export const calculateSelectedArchiveSizeBytes = ({
  selectedItems,
  versionsByPublicPath,
}: {
  selectedItems: readonly FileVersionSelectionItem[];
  versionsByPublicPath: Readonly<
    Record<
      string,
      readonly Pick<FileVersion, 'uploadId' | 'size'>[] | undefined
    >
  >;
}): number =>
  selectedItems.reduce((totalSize, item) => {
    const version = versionsByPublicPath[item.publicPath]?.find(
      (candidate) => candidate.uploadId === item.uploadId
    );
    return totalSize + (version?.size ?? 0);
  }, 0);

/**
 * Check whether a selected archive size exceeds the configured limit.
 * @param params Total selected bytes and maximum size in MB.
 * @returns True when the selected size is over the configured limit.
 */
export const isArchiveDownloadSizeExceeded = ({
  selectedSizeBytes,
  maxDownloadSizeMb,
}: {
  selectedSizeBytes: number;
  maxDownloadSizeMb: number | undefined;
}): boolean =>
  maxDownloadSizeMb !== undefined &&
  selectedSizeBytes > maxDownloadSizeMb * 1024 * 1024;

/**
 * Format the browser-local timestamp used for batch archive file names.
 * @param date Date-time value in the browser's local timezone.
 * @returns Timestamp in YYYYMMDD_HHmmss form.
 */
export const formatArchiveRequestFileName = (date: dayjs.Dayjs): string =>
  date.format('YYYYMMDD_HHmmss');

const archiveStatusPollIntervalMs = 1000;

const waitForArchiveStatusPoll = async (): Promise<void> =>
  await new Promise((resolve) => {
    window.setTimeout(resolve, archiveStatusPollIntervalMs);
  });

const resolveArchiveErrorMessage = (
  data: Partial<{ error: string; message: string }>,
  fallbackMessage: string
): string =>
  typeof data.error === 'string'
    ? data.error
    : typeof data.message === 'string'
      ? data.message
      : fallbackMessage;

/**
 * Batch archive download button with in-progress feedback.
 * @param props Archive download button state and action.
 * @returns Button element.
 */
export const ArchiveDownloadButton = ({
  selectedCount,
  disabled,
  inProgress,
  sizeExceeded,
  onClick,
}: {
  selectedCount: number;
  disabled: boolean;
  inProgress: boolean;
  sizeExceeded: boolean;
  onClick: () => void;
}) => (
  <Button
    variant="contained"
    size="small"
    color={sizeExceeded ? 'error' : 'primary'}
    startIcon={
      inProgress ? (
        <CircularProgress size={16} color="inherit" />
      ) : (
        <DownloadIcon />
      )
    }
    disabled={disabled}
    onClick={onClick}
    sx={{
      boxShadow: 'none',
      minHeight: 40,
      ...(sizeExceeded
        ? {
            '&.Mui-disabled': {
              bgcolor: 'error.dark',
              color: 'error.contrastText',
              opacity: 0.72,
            },
          }
        : {}),
    }}
  >
    <TypedMessage
      message={messages.DOWNLOAD_SELECTED_ARCHIVE}
      params={{ count: selectedCount }}
    />
  </Button>
);

/**
 * Summarize selected versions within a visible file scope.
 * @param params Visible files, loaded versions, and selected version keys.
 * @returns Selection counts and checkbox state flags for the scope.
 */
export const summarizeFileVersionSelectionScope = ({
  files,
  directoryPath,
  directoryPaths,
  versionsByPublicPath,
  selectedVersionKeys,
}: {
  files: readonly Pick<FileGroupSummary, 'publicPath'>[];
  directoryPath?: string;
  directoryPaths?: readonly string[];
  versionsByPublicPath: Readonly<
    Record<string, readonly Pick<FileVersion, 'uploadId'>[] | undefined>
  >;
  selectedVersionKeys: ReadonlySet<string>;
}) => {
  const publicPaths = new Set(files.map((file) => file.publicPath));
  const loadedItems = collectLoadedFileVersionSelectionItems({
    files,
    versionsByPublicPath,
  });
  const loadedKeys = new Set(loadedItems.map(createFileVersionSelectionKey));
  const selectedLoadedCount = loadedItems.filter((item) =>
    selectedVersionKeys.has(createFileVersionSelectionKey(item))
  ).length;
  let selectedScopeCount = 0;
  selectedVersionKeys.forEach((key) => {
    const item = parseFileVersionSelectionKey(key);
    if (!item) {
      return;
    }
    if (publicPaths.has(item.publicPath)) {
      selectedScopeCount += 1;
      return;
    }
    if (
      publicPaths.size === 0 &&
      directoryPath !== undefined &&
      directoryPaths !== undefined &&
      resolveBrowseDirectoryPathForPublicPath(
        item.publicPath,
        directoryPaths
      ) === directoryPath
    ) {
      selectedScopeCount += 1;
    }
  });

  const allSelected =
    loadedItems.length > 0 &&
    selectedLoadedCount === loadedItems.length &&
    selectedScopeCount === loadedKeys.size;

  return {
    totalCount: loadedItems.length,
    selectedCount:
      loadedItems.length > 0 ? selectedLoadedCount : selectedScopeCount,
    allSelected,
    partiallySelected: selectedScopeCount > 0 && !allSelected,
  };
};

/**
 * Resolve the file groups used by a directory-level selection action.
 * @param params Directory section, search mode, and optionally loaded files.
 * @returns The visible file groups that should be selected or deselected.
 */
export const resolveDirectorySelectionFiles = ({
  section,
  isSearchMode,
  loadedFiles,
}: {
  section: Pick<DirectorySection, 'files'>;
  isSearchMode: boolean;
  loadedFiles: readonly FileGroupSummary[] | undefined;
}): readonly FileGroupSummary[] => {
  if (!isSearchMode && section.files.length === 0 && loadedFiles) {
    return loadedFiles;
  }

  return section.files;
};

/**
 * Decide whether the current package-list context may show delete actions for a
 * specific file version.
 * @param params Target file version returned by the browse API.
 * @returns True when file-version deletion is allowed for the version.
 */
export const canDeleteFileGroupVersion = ({
  version,
}: {
  version: Pick<FileVersion, 'canDelete'>;
}): boolean => version.canDelete === true;

/**
 * Update the stored file-group count for a browse directory summary.
 * @param directories Current directory summaries.
 * @param directoryPath Directory path to update.
 * @param fileGroupCount File-group count resolved after loading the directory.
 * @returns Directory summaries with the matching directory count updated.
 */
export const updateDirectorySummaryFileGroupCount = ({
  directories,
  directoryPath,
  fileGroupCount,
}: {
  directories: readonly DirectorySummary[];
  directoryPath: string;
  fileGroupCount: number;
}): DirectorySummary[] => {
  let changed = false;

  const nextDirectories = directories.map((directory) => {
    if (directory.directoryPath !== directoryPath) {
      return directory;
    }
    if (directory.fileGroupCount === fileGroupCount) {
      return directory;
    }

    changed = true;
    return {
      ...directory,
      fileGroupCount,
    };
  });

  return changed ? nextDirectories : Array.from(directories);
};

const deleteRecordEntry = <TValue,>(
  entries: Readonly<Record<string, TValue>>,
  key: string
): Record<string, TValue> => {
  const nextEntries = { ...entries };
  delete nextEntries[key];
  return nextEntries;
};

const deleteSetEntry = (
  entries: ReadonlySet<string>,
  key: string
): Set<string> => {
  const nextEntries = new Set(entries);
  nextEntries.delete(key);
  return nextEntries;
};

const hasSelectedFileVersions = (
  selectedVersionKeys: ReadonlySet<string>,
  publicPaths: ReadonlySet<string>
): boolean => {
  for (const key of selectedVersionKeys) {
    const item = parseFileVersionSelectionKey(key);
    if (item && publicPaths.has(item.publicPath)) {
      return true;
    }
  }

  return false;
};

/**
 * Clear cached state associated with a file-group accordion.
 * @param params File-group state to clear.
 * @returns File-group state with the specified public path removed.
 */
export const clearFileGroupPanelState = ({
  publicPath,
  versionsByPublicPath,
  versionErrorsByPublicPath,
  versionLoadingPanels,
  preserveVersions,
}: {
  publicPath: string;
  versionsByPublicPath: Readonly<
    Record<string, readonly FileVersion[] | undefined>
  >;
  versionErrorsByPublicPath: Readonly<Record<string, string | undefined>>;
  versionLoadingPanels: ReadonlySet<string>;
  preserveVersions?: boolean;
}) => ({
  versionsByPublicPath: preserveVersions
    ? { ...versionsByPublicPath }
    : deleteRecordEntry(versionsByPublicPath, publicPath),
  versionErrorsByPublicPath: preserveVersions
    ? { ...versionErrorsByPublicPath }
    : deleteRecordEntry(versionErrorsByPublicPath, publicPath),
  versionLoadingPanels: deleteSetEntry(versionLoadingPanels, publicPath),
});

/**
 * Clear cached state associated with a directory accordion and all nested
 * file-group accordions.
 * @param params Directory state to clear.
 * @returns Directory and nested file-group state with the directory removed.
 */
export const clearDirectoryPanelState = ({
  directoryPath,
  publicPaths,
  browseFileGroupsByDirectory,
  directoryErrorsByPath,
  directoryLoadingPanels,
  expandedPanels,
  versionsByPublicPath,
  versionErrorsByPublicPath,
  versionLoadingPanels,
  selectedVersionKeys,
}: {
  directoryPath: string;
  publicPaths: readonly string[];
  browseFileGroupsByDirectory: Readonly<Record<string, FileGroupSummary[]>>;
  directoryErrorsByPath: Readonly<Record<string, string | undefined>>;
  directoryLoadingPanels: ReadonlySet<string>;
  expandedPanels: ReadonlySet<string>;
  versionsByPublicPath: Readonly<
    Record<string, readonly FileVersion[] | undefined>
  >;
  versionErrorsByPublicPath: Readonly<Record<string, string | undefined>>;
  versionLoadingPanels: ReadonlySet<string>;
  selectedVersionKeys?: ReadonlySet<string>;
}) => {
  let nextVersionsByPublicPath = { ...versionsByPublicPath };
  let nextVersionErrorsByPublicPath = { ...versionErrorsByPublicPath };
  let nextVersionLoadingPanels = new Set(versionLoadingPanels);
  const nextExpandedPanels = new Set(expandedPanels);
  const publicPathSet = new Set(publicPaths);
  const preserveDirectoryCache =
    selectedVersionKeys !== undefined &&
    hasSelectedFileVersions(selectedVersionKeys, publicPathSet);

  publicPaths.forEach((publicPath) => {
    nextExpandedPanels.delete(publicPath);

    const nextFileGroupState = clearFileGroupPanelState({
      publicPath,
      versionsByPublicPath: nextVersionsByPublicPath,
      versionErrorsByPublicPath: nextVersionErrorsByPublicPath,
      versionLoadingPanels: nextVersionLoadingPanels,
      preserveVersions: preserveDirectoryCache,
    });
    nextVersionsByPublicPath = nextFileGroupState.versionsByPublicPath;
    nextVersionErrorsByPublicPath =
      nextFileGroupState.versionErrorsByPublicPath;
    nextVersionLoadingPanels = nextFileGroupState.versionLoadingPanels;
  });

  return {
    browseFileGroupsByDirectory: preserveDirectoryCache
      ? { ...browseFileGroupsByDirectory }
      : deleteRecordEntry(browseFileGroupsByDirectory, directoryPath),
    directoryErrorsByPath: deleteRecordEntry(
      directoryErrorsByPath,
      directoryPath
    ),
    directoryLoadingPanels: deleteSetEntry(
      directoryLoadingPanels,
      directoryPath
    ),
    expandedPanels: nextExpandedPanels,
    versionsByPublicPath: nextVersionsByPublicPath,
    versionErrorsByPublicPath: nextVersionErrorsByPublicPath,
    versionLoadingPanels: nextVersionLoadingPanels,
  };
};

/**
 * Render file-group accordion entries for the package list.
 */
export const PackageListEntries = ({
  sections,
  loadedDirectoryPanels,
  directoryLoadingPanels,
  directoryErrorsByPath,
  expandedDirectoryPanels,
  expandedPanels,
  versionsByPublicPath,
  versionErrorsByPublicPath,
  versionLoadingPanels,
  selectedVersionKeys,
  canDeleteFileGroupVersion,
  onToggleVersionSelection,
  onToggleFileGroupVersions,
  onToggleDirectoryVersions,
  onDeleteVersionRequest,
  onDirectoryAccordionChange,
  onAccordionChange,
}: PackageListEntriesProps) => {
  const getMessage = useTypedMessage();
  const [versionActionsAnchorEl, setVersionActionsAnchorEl] =
    useState<HTMLElement | null>(null);
  const [versionActionsTarget, setVersionActionsTarget] = useState<{
    file: FileGroupSummary;
    version: FileVersion;
  } | null>(null);

  const handleOpenVersionActions = (
    event: MouseEvent<HTMLElement>,
    file: FileGroupSummary,
    version: FileVersion
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setVersionActionsAnchorEl(event.currentTarget);
    setVersionActionsTarget({ file, version });
  };

  const handleCloseVersionActions = () => {
    setVersionActionsAnchorEl(null);
    setVersionActionsTarget(null);
  };

  const stopAccordionToggle = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <>
      <Stack spacing={2.5} useFlexGap>
        {sections.map((section) => {
          const directorySelection = summarizeFileVersionSelectionScope({
            files: section.files,
            directoryPath: section.directoryPath,
            directoryPaths: sections.map((entry) => entry.directoryPath),
            versionsByPublicPath,
            selectedVersionKeys,
          });

          return (
            <Accordion
              key={section.directoryPath}
              expanded={expandedDirectoryPanels.has(section.directoryPath)}
              slotProps={{
                transition: {
                  unmountOnExit: true,
                },
              }}
              onChange={(_event, isExpanded) =>
                onDirectoryAccordionChange(section.directoryPath, isExpanded)
              }
              sx={{
                bgcolor: (theme) =>
                  theme.palette.mode === 'light'
                    ? 'background.paper'
                    : '#232323',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                boxShadow: 'none',
                overflow: 'hidden',
                '&:before': {
                  display: 'none',
                },
                '&.Mui-expanded': {
                  my: 0,
                },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ color: 'text.secondary' }} />}
                sx={{
                  px: 2.5,
                  minHeight: 72,
                  '&.Mui-expanded': {
                    minHeight: 72,
                  },
                  '& .MuiAccordionSummary-content': {
                    my: 1.75,
                  },
                  '& .MuiAccordionSummary-content.Mui-expanded': {
                    my: 1.75,
                  },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    gap: 2,
                    minWidth: 0,
                    width: '100%',
                  }}
                >
                  <Checkbox
                    checked={directorySelection.allSelected}
                    indeterminate={directorySelection.partiallySelected}
                    aria-label={getMessage(
                      directorySelection.allSelected
                        ? messages.DESELECT_DIRECTORY_VERSIONS
                        : messages.SELECT_DIRECTORY_VERSIONS
                    )}
                    onClick={stopAccordionToggle}
                    onFocus={stopAccordionToggle}
                    onChange={() =>
                      onToggleDirectoryVersions(
                        section,
                        !directorySelection.allSelected
                      )
                    }
                    sx={{ flexShrink: 0 }}
                  />
                  <FolderCopyIcon
                    sx={{
                      color: 'text.secondary',
                      fontSize: '2rem',
                      flexShrink: 0,
                      mt: { xs: 0.25, sm: 0 },
                    }}
                  />
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography
                      variant="h6"
                      component="h2"
                      sx={{ fontWeight: 700, wordBreak: 'break-word' }}
                    >
                      {section.directoryPath === '/'
                        ? getMessage(messages.ROOT_DIRECTORY, {
                            path: section.directoryPath,
                          })
                        : section.directoryPath}
                    </Typography>
                    {section.description ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.25 }}
                      >
                        {section.description}
                      </Typography>
                    ) : null}
                  </Box>
                  <Chip
                    size="small"
                    label={getMessage(messages.FILE_GROUPS_COUNT, {
                      count: section.fileGroupCount,
                    })}
                    sx={{ flexShrink: 0, mr: 1.5 }}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 2, pt: 0, pb: 2.5 }}>
                {directoryLoadingPanels.has(section.directoryPath) ||
                (!loadedDirectoryPanels.has(section.directoryPath) &&
                  directoryErrorsByPath[section.directoryPath] ===
                    undefined) ? (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      py: 3,
                    }}
                  >
                    <CircularProgress size={24} />
                  </Box>
                ) : directoryErrorsByPath[section.directoryPath] ? (
                  <Alert severity="error">
                    {directoryErrorsByPath[section.directoryPath]}
                  </Alert>
                ) : (
                  <Stack spacing={1.25} useFlexGap>
                    {section.files.map((file) => {
                      const FileGroupIcon = resolveFileGroupIconComponent(
                        file.fileName
                      );
                      const versions = versionsByPublicPath[file.publicPath];
                      const versionError =
                        versionErrorsByPublicPath[file.publicPath];
                      const isVersionLoading = versionLoadingPanels.has(
                        file.publicPath
                      );
                      const totalSize =
                        versions?.reduce(
                          (size, version) => size + version.size,
                          0
                        ) ?? 0;
                      const fileGroupSelection =
                        summarizeFileVersionSelectionScope({
                          files: [file],
                          versionsByPublicPath,
                          selectedVersionKeys,
                        });

                      return (
                        <Accordion
                          key={file.publicPath}
                          expanded={expandedPanels.has(file.publicPath)}
                          slotProps={{
                            transition: {
                              unmountOnExit: true,
                            },
                          }}
                          onChange={(_event, isExpanded) =>
                            onAccordionChange(file.publicPath, isExpanded)
                          }
                          sx={{
                            bgcolor: (theme) =>
                              theme.palette.mode === 'light'
                                ? 'grey.100'
                                : '#2d2d2d',
                            border: '1px solid',
                            borderColor: (theme) =>
                              theme.palette.mode === 'light'
                                ? 'grey.300'
                                : 'rgba(255,255,255,0.08)',
                            borderRadius: 1,
                            boxShadow: 'none',
                            overflow: 'hidden',
                            '&:before': {
                              display: 'none',
                            },
                            '&.Mui-expanded': {
                              my: 0,
                            },
                          }}
                        >
                          <AccordionSummary
                            expandIcon={
                              <ExpandMoreIcon
                                sx={{ color: 'text.secondary' }}
                              />
                            }
                            sx={{
                              px: 2.5,
                              minHeight: 80,
                              '&.Mui-expanded': {
                                minHeight: 80,
                              },
                              '& .MuiAccordionSummary-content': {
                                my: 1.75,
                              },
                              '& .MuiAccordionSummary-content.Mui-expanded': {
                                my: 1.75,
                              },
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                                minWidth: 0,
                                width: '100%',
                              }}
                            >
                              <Checkbox
                                checked={fileGroupSelection.allSelected}
                                indeterminate={
                                  fileGroupSelection.partiallySelected
                                }
                                aria-label={getMessage(
                                  fileGroupSelection.allSelected
                                    ? messages.DESELECT_FILE_GROUP_VERSIONS
                                    : messages.SELECT_FILE_GROUP_VERSIONS
                                )}
                                onClick={stopAccordionToggle}
                                onFocus={stopAccordionToggle}
                                onChange={() =>
                                  onToggleFileGroupVersions(
                                    file,
                                    !fileGroupSelection.allSelected
                                  )
                                }
                                sx={{ flexShrink: 0 }}
                              />
                              <FileGroupIcon
                                sx={{
                                  color: 'text.secondary',
                                  fontSize: '2rem',
                                  flexShrink: 0,
                                }}
                              />
                              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                <Typography
                                  variant="h6"
                                  component="div"
                                  sx={{
                                    fontWeight: 700,
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {buildFileGroupLabel(file)}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ mt: 0.25 }}
                                >
                                  <TypedMessage
                                    message={messages.LATEST_UPLOAD}
                                    params={{
                                      uploadedAt: formatUploadedAt(
                                        file.latestUploadedAt
                                      ),
                                    }}
                                  />
                                </Typography>
                              </Box>
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails sx={{ px: 2.5, pt: 0, pb: 2.5 }}>
                            {isVersionLoading ? (
                              <Box
                                sx={{
                                  display: 'flex',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  py: 3,
                                }}
                              >
                                <CircularProgress size={24} />
                              </Box>
                            ) : versionError ? (
                              <Alert severity="error">{versionError}</Alert>
                            ) : versions ? (
                              <>
                                <Typography
                                  variant="subtitle2"
                                  component="h3"
                                  sx={{ mb: 1, fontWeight: 700 }}
                                >
                                  <TypedMessage
                                    message={messages.GROUP_SUMMARY}
                                  />
                                </Typography>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  useFlexGap
                                  sx={{ mb: 2.5, flexWrap: 'wrap' }}
                                >
                                  <Chip
                                    size="small"
                                    label={getMessage(messages.UPLOADS_COUNT, {
                                      count: versions.length,
                                    })}
                                    sx={{
                                      bgcolor: 'transparent',
                                      border: '1px solid',
                                      borderColor: 'divider',
                                    }}
                                  />
                                  <Chip
                                    size="small"
                                    label={getMessage(messages.TOTAL_SIZE, {
                                      size: formatSize(totalSize),
                                    })}
                                    sx={{
                                      bgcolor: 'transparent',
                                      border: '1px solid',
                                      borderColor: 'divider',
                                    }}
                                  />
                                </Stack>
                                <Typography
                                  variant="subtitle2"
                                  component="h3"
                                  sx={{ mb: 1.25, fontWeight: 700 }}
                                >
                                  <TypedMessage
                                    message={messages.VERSIONS_HEADER}
                                    params={{ count: versions.length }}
                                  />
                                </Typography>
                                <Stack spacing={1}>
                                  {versions.map((version) => (
                                    <Paper
                                      key={`${file.publicPath}-${version.uploadId}`}
                                      variant="outlined"
                                      sx={{
                                        p: 2,
                                        display: 'flex',
                                        flexDirection: {
                                          xs: 'column',
                                          sm: 'row',
                                        },
                                        alignItems: {
                                          xs: 'stretch',
                                          sm: 'center',
                                        },
                                        justifyContent: 'space-between',
                                        gap: 2,
                                        bgcolor: (theme) =>
                                          theme.palette.mode === 'light'
                                            ? 'grey.50'
                                            : 'rgba(255,255,255,0.04)',
                                        borderColor: 'divider',
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'flex-start',
                                          gap: 1.5,
                                          minWidth: 0,
                                          flexGrow: 1,
                                        }}
                                      >
                                        <Checkbox
                                          checked={selectedVersionKeys.has(
                                            createFileVersionSelectionKey({
                                              publicPath: file.publicPath,
                                              uploadId: version.uploadId,
                                            })
                                          )}
                                          aria-label={getMessage(
                                            selectedVersionKeys.has(
                                              createFileVersionSelectionKey({
                                                publicPath: file.publicPath,
                                                uploadId: version.uploadId,
                                              })
                                            )
                                              ? messages.DESELECT_FILE_VERSION
                                              : messages.SELECT_FILE_VERSION
                                          )}
                                          onChange={() =>
                                            onToggleVersionSelection(
                                              file,
                                              version
                                            )
                                          }
                                          sx={{ flexShrink: 0, mt: -0.75 }}
                                        />
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography
                                            variant="body1"
                                            sx={{ fontWeight: 500 }}
                                          >
                                            {formatUploadedAt(
                                              version.uploadedAt
                                            )}
                                          </Typography>
                                          <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{ mt: 0.25 }}
                                          >
                                            <TypedMessage
                                              message={
                                                messages.VERSION_DETAILS_LABEL
                                              }
                                              params={{
                                                uploadId: version.uploadId,
                                                size: formatSize(version.size),
                                              }}
                                            />
                                          </Typography>
                                          {version.uploadedBy ||
                                          version.tags?.length ? (
                                            <Box
                                              sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: 0.75,
                                                mt: 0.5,
                                              }}
                                            >
                                              {version.uploadedBy ? (
                                                <Typography
                                                  variant="body2"
                                                  color="text.secondary"
                                                >
                                                  <TypedMessage
                                                    message={
                                                      messages.UPLOADED_BY_LABEL
                                                    }
                                                    params={{
                                                      uploadedBy:
                                                        version.uploadedBy,
                                                    }}
                                                  />
                                                </Typography>
                                              ) : null}
                                              {version.tags?.length ? (
                                                <Typography
                                                  variant="body2"
                                                  color="text.secondary"
                                                >
                                                  <TypedMessage
                                                    message={
                                                      messages.TAGS_LABEL
                                                    }
                                                  />
                                                </Typography>
                                              ) : null}
                                              {version.tags?.map((tag) => (
                                                <Chip
                                                  key={`${file.publicPath}-${version.uploadId}-${tag}`}
                                                  label={tag}
                                                  size="small"
                                                  variant="outlined"
                                                  sx={{
                                                    bgcolor: 'transparent',
                                                    borderColor: 'divider',
                                                  }}
                                                />
                                              ))}
                                            </Box>
                                          ) : null}
                                        </Box>
                                      </Box>
                                      <Stack
                                        direction="row"
                                        spacing={1}
                                        useFlexGap
                                        sx={{
                                          alignSelf: {
                                            xs: 'stretch',
                                            sm: 'center',
                                          },
                                          width: { xs: '100%', sm: 'auto' },
                                        }}
                                      >
                                        <Button
                                          variant="contained"
                                          size="small"
                                          startIcon={<DownloadIcon />}
                                          href={version.versionDownloadPath}
                                          sx={{
                                            flexGrow: { xs: 1, sm: 0 },
                                            minWidth: { sm: 132 },
                                            boxShadow: 'none',
                                          }}
                                        >
                                          <TypedMessage
                                            message={messages.DOWNLOAD}
                                          />
                                        </Button>
                                        {canDeleteFileGroupVersion(
                                          file,
                                          version
                                        ) ? (
                                          <Button
                                            variant="outlined"
                                            size="small"
                                            aria-label={getMessage(
                                              messages.FILE_ACTIONS
                                            )}
                                            onClick={(event) =>
                                              handleOpenVersionActions(
                                                event,
                                                file,
                                                version
                                              )
                                            }
                                            sx={{
                                              minWidth: 44,
                                              px: 1.25,
                                              fontSize: '1.1rem',
                                              lineHeight: 1,
                                            }}
                                          >
                                            ...
                                          </Button>
                                        ) : null}
                                      </Stack>
                                    </Paper>
                                  ))}
                                </Stack>
                              </>
                            ) : (
                              <Box
                                sx={{
                                  display: 'flex',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  py: 3,
                                }}
                              >
                                <CircularProgress size={24} />
                              </Box>
                            )}
                          </AccordionDetails>
                        </Accordion>
                      );
                    })}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
      {versionActionsTarget ? (
        <Menu
          anchorEl={versionActionsAnchorEl}
          open={true}
          onClose={handleCloseVersionActions}
        >
          <MenuItem
            onClick={() => {
              onDeleteVersionRequest(
                versionActionsTarget.file,
                versionActionsTarget.version
              );
              handleCloseVersionActions();
            }}
          >
            <TypedMessage message={messages.DELETE} />
          </MenuItem>
        </Menu>
      ) : null}
    </>
  );
};

/**
 * Render the package-list header title with the directory counter.
 * @param visibleDirectoryCount Number of visible directory sections.
 * @returns Package-list header title element.
 */
export const PackageListHeaderTitle = ({
  visibleDirectoryCount,
}: {
  visibleDirectoryCount: number;
}) => (
  <Typography
    variant="h4"
    component="h1"
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1,
    }}
  >
    <HomeIcon fontSize="large" />
    <TypedMessage
      message={messages.FILE_GROUPS_HEADER}
      params={{ count: visibleDirectoryCount }}
    />
  </Typography>
);

const PackageList = forwardRef<PackageListRef, PackageListProps>(
  ({ serverConfig }, ref) => {
    const getMessage = useTypedMessage();
    const [directorySummaries, setDirectorySummaries] = useState<
      DirectorySummary[]
    >([]);
    const [browseFileGroupsByDirectory, setBrowseFileGroupsByDirectory] =
      useState<Record<string, FileGroupSummary[]>>({});
    const [directoryErrorsByPath, setDirectoryErrorsByPath] = useState<
      Record<string, string | undefined>
    >({});
    const [directoryLoadingPanels, setDirectoryLoadingPanels] = useState<
      Set<string>
    >(new Set());
    const [searchResults, setSearchResults] = useState<FileGroupSummary[]>([]);
    const [versionsByPublicPath, setVersionsByPublicPath] = useState<
      Record<string, readonly FileVersion[] | undefined>
    >({});
    const [versionErrorsByPublicPath, setVersionErrorsByPublicPath] = useState<
      Record<string, string | undefined>
    >({});
    const [versionLoadingPanels, setVersionLoadingPanels] = useState<
      Set<string>
    >(new Set());
    const [browseLoading, setBrowseLoading] = useState(true);
    const [searchLoading, setSearchLoading] = useState(false);
    const [browseError, setBrowseError] = useState<string | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [expandedDirectoryPanels, setExpandedDirectoryPanels] = useState<
      Set<string>
    >(new Set());
    const [expandedPanels, setExpandedPanels] = useState<Set<string>>(
      new Set()
    );
    const [filterText, setFilterText] = useState('');
    const [debouncedFilterText, setDebouncedFilterText] = useState('');
    const [refreshToken, setRefreshToken] = useState(0);
    const [deleteTarget, setDeleteTarget] = useState<{
      file: FileGroupSummary;
      version: FileVersion;
    } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteInProgress, setDeleteInProgress] = useState(false);
    const [selectedVersionKeys, setSelectedVersionKeys] = useState<Set<string>>(
      new Set()
    );
    const [archiveInProgress, setArchiveInProgress] = useState(false);
    const [archiveError, setArchiveError] = useState<string | null>(null);
    const directoryRequestControllersRef = useRef<Map<string, AbortController>>(
      new Map()
    );
    const versionRequestControllersRef = useRef<Map<string, AbortController>>(
      new Map()
    );

    const canBrowse =
      serverConfig !== undefined &&
      serverConfig !== null &&
      !(
        serverConfig.authMode === 'full' &&
        !serverConfig.currentUser?.authenticated
      );

    const abortDirectoryRequest = (directoryPath: string) => {
      const controller =
        directoryRequestControllersRef.current.get(directoryPath);
      if (controller) {
        controller.abort();
        directoryRequestControllersRef.current.delete(directoryPath);
      }
    };

    const abortVersionRequest = (publicPath: string) => {
      const controller = versionRequestControllersRef.current.get(publicPath);
      if (controller) {
        controller.abort();
        versionRequestControllersRef.current.delete(publicPath);
      }
    };

    const abortAllPanelRequests = () => {
      directoryRequestControllersRef.current.forEach((controller) => {
        controller.abort();
      });
      directoryRequestControllersRef.current.clear();
      versionRequestControllersRef.current.forEach((controller) => {
        controller.abort();
      });
      versionRequestControllersRef.current.clear();
    };

    useEffect(() => {
      const timeoutId = window.setTimeout(() => {
        setDebouncedFilterText(filterText.trim());
      }, 300);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }, [filterText]);

    useEffect(() => {
      if (!serverConfig) {
        setBrowseLoading(false);
        return;
      }

      if (
        serverConfig.authMode === 'full' &&
        !serverConfig.currentUser?.authenticated
      ) {
        setBrowseLoading(false);
        return;
      }

      const controller = new AbortController();
      let active = true;

      abortAllPanelRequests();
      setBrowseLoading(true);
      setBrowseError(null);
      setDirectorySummaries([]);
      setBrowseFileGroupsByDirectory({});
      setDirectoryErrorsByPath({});
      setDirectoryLoadingPanels(new Set());
      setSearchResults([]);
      setVersionsByPublicPath({});
      setVersionErrorsByPublicPath({});
      setVersionLoadingPanels(new Set());
      setSelectedVersionKeys(new Set());
      setArchiveError(null);

      void (async () => {
        try {
          const directoriesResponse = await apiFetch(
            'api/ui/browse/directories',
            {
              credentials: 'same-origin',
              signal: controller.signal,
            }
          );

          if (directoriesResponse.status === 401) {
            if (active) {
              setBrowseLoading(false);
            }
            return;
          }
          if (!directoriesResponse.ok) {
            throw new Error(
              `HTTP error! status: ${directoriesResponse.status}`
            );
          }

          const directoriesData: BrowseDirectoriesResponse =
            await directoriesResponse.json();

          if (!active) {
            return;
          }

          setDirectorySummaries(directoriesData.items);
        } catch (requestError) {
          if (
            requestError instanceof DOMException &&
            requestError.name === 'AbortError'
          ) {
            return;
          }
          if (
            requestError instanceof Error &&
            requestError.message === 'UNAUTHORIZED'
          ) {
            if (active) {
              setBrowseLoading(false);
            }
            return;
          }
          if (active) {
            setBrowseError(
              requestError instanceof Error
                ? requestError.message
                : getMessage(messages.UNKNOWN_ERROR)
            );
          }
        } finally {
          if (active) {
            setBrowseLoading(false);
          }
        }
      })();

      return () => {
        active = false;
        controller.abort();
      };
    }, [serverConfig, refreshToken, getMessage]);

    useEffect(
      () => () => {
        abortAllPanelRequests();
      },
      []
    );

    useEffect(() => {
      if (!serverConfig) {
        setSearchLoading(false);
        return;
      }

      if (
        serverConfig.authMode === 'full' &&
        !serverConfig.currentUser?.authenticated
      ) {
        setSearchLoading(false);
        return;
      }

      if (debouncedFilterText.length === 0) {
        setSearchResults([]);
        setSearchError(null);
        setSearchLoading(false);
        return;
      }

      const controller = new AbortController();
      let active = true;

      setSearchLoading(true);
      setSearchError(null);

      void (async () => {
        try {
          const response = await apiFetch(
            `api/ui/browse/search?q=${encodeURIComponent(debouncedFilterText)}`,
            {
              credentials: 'same-origin',
              signal: controller.signal,
            }
          );

          if (response.status === 401) {
            if (active) {
              setSearchLoading(false);
            }
            return;
          }
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data: BrowseSearchResponse = await response.json();
          if (active) {
            setSearchResults(data.items);
          }
        } catch (requestError) {
          if (
            requestError instanceof DOMException &&
            requestError.name === 'AbortError'
          ) {
            return;
          }
          if (active) {
            setSearchError(
              requestError instanceof Error
                ? requestError.message
                : getMessage(messages.UNKNOWN_ERROR)
            );
          }
        } finally {
          if (active) {
            setSearchLoading(false);
          }
        }
      })();

      return () => {
        active = false;
        controller.abort();
      };
    }, [serverConfig, debouncedFilterText, refreshToken, getMessage]);

    useImperativeHandle(ref, () => ({
      refresh: () => {
        setRefreshToken((current) => current + 1);
      },
    }));

    const handleCloseDeleteDialog = () => {
      if (deleteInProgress) {
        return;
      }

      setDeleteTarget(null);
      setDeleteError(null);
    };

    const handleConfirmDelete = async () => {
      if (!deleteTarget) {
        return;
      }

      setDeleteInProgress(true);
      setDeleteError(null);

      try {
        const response = await apiFetch(
          deleteTarget.version.versionDownloadPath,
          {
            method: 'DELETE',
            credentials: 'same-origin',
          }
        );
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          setDeleteTarget(null);
          setDeleteError(null);
          setRefreshToken((current) => current + 1);
          return;
        }

        if (response.status === 401) {
          setDeleteTarget(null);
          setDeleteError(null);
          return;
        }

        const errorMessage =
          typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
              ? data.message
              : getMessage(messages.FILE_VERSION_DELETE_FAILED);
        setDeleteError(errorMessage);
      } catch (error) {
        setDeleteError(
          `${getMessage(messages.FILE_VERSION_DELETE_FAILED)}: ${error instanceof Error ? error.message : getMessage(messages.UNKNOWN_ERROR)}`
        );
      } finally {
        setDeleteInProgress(false);
      }
    };

    const removeSelectedVersionsByPublicPath = (
      selectedKeys: ReadonlySet<string>,
      publicPaths: ReadonlySet<string>
    ): Set<string> => {
      const nextKeys = new Set<string>();
      selectedKeys.forEach((key) => {
        const item = parseFileVersionSelectionKey(key);
        if (!item || !publicPaths.has(item.publicPath)) {
          nextKeys.add(key);
        }
      });
      return nextKeys;
    };

    const handleToggleVersionSelection = (
      file: FileGroupSummary,
      version: FileVersion
    ) => {
      const key = createFileVersionSelectionKey({
        publicPath: file.publicPath,
        uploadId: version.uploadId,
      });
      setSelectedVersionKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys);
        if (nextKeys.has(key)) {
          nextKeys.delete(key);
        } else {
          nextKeys.add(key);
        }
        return nextKeys;
      });
      setArchiveError(null);
    };

    const handleToggleVisibleFileVersions = async (
      files: readonly FileGroupSummary[],
      selected: boolean
    ) => {
      const publicPaths = new Set(files.map((file) => file.publicPath));
      if (!selected) {
        setSelectedVersionKeys((currentKeys) =>
          removeSelectedVersionsByPublicPath(currentKeys, publicPaths)
        );
        setArchiveError(null);
        return;
      }

      const nextItems: FileVersionSelectionItem[] = [];
      for (const file of files) {
        const versions = await loadFileGroupVersions(file.publicPath);
        if (!versions) {
          continue;
        }
        versions.forEach((version) => {
          nextItems.push({
            publicPath: file.publicPath,
            uploadId: version.uploadId,
          });
        });
      }

      setSelectedVersionKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys);
        nextItems.forEach((item) => {
          nextKeys.add(createFileVersionSelectionKey(item));
        });
        return nextKeys;
      });
      setArchiveError(null);
    };

    const selectedArchiveItems = useMemo(
      () =>
        Array.from(selectedVersionKeys)
          .map(parseFileVersionSelectionKey)
          .filter(
            (item): item is FileVersionSelectionItem => item !== undefined
          ),
      [selectedVersionKeys]
    );

    const handleDownloadSelectedArchive = async () => {
      if (
        downloadableSelectedArchiveItems.length === 0 ||
        archiveInProgress ||
        archiveDownloadSizeExceeded
      ) {
        return;
      }

      setArchiveInProgress(true);
      setArchiveError(null);

      try {
        const response = await apiFetch('api/files/archive-requests', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: downloadableSelectedArchiveItems,
            archiveFileName: formatArchiveRequestFileName(dayjs()),
          }),
        });
        const data = (await response.json().catch(() => ({}))) as Partial<
          CreateArchiveResponse & { error: string; message: string }
        >;

        if (response.status === 401) {
          return;
        }
        if (!response.ok) {
          throw new Error(
            resolveArchiveErrorMessage(
              data,
              `HTTP error! status: ${response.status}`
            )
          );
        }
        if (typeof data.statusPath !== 'string') {
          throw new Error(getMessage(messages.UNKNOWN_ERROR));
        }

        let downloadPath: string | undefined;
        while (!downloadPath) {
          await waitForArchiveStatusPoll();

          const statusResponse = await apiFetch(data.statusPath, {
            credentials: 'same-origin',
          });
          const statusData = (await statusResponse
            .json()
            .catch(() => ({}))) as Partial<
            ArchiveStatusResponse & { error: string; message: string }
          >;

          if (statusResponse.status === 401) {
            return;
          }
          if (!statusResponse.ok) {
            throw new Error(
              resolveArchiveErrorMessage(
                statusData,
                `HTTP error! status: ${statusResponse.status}`
              )
            );
          }
          if (statusData.status === 'failed') {
            throw new Error(
              statusData.error || getMessage(messages.UNKNOWN_ERROR)
            );
          }
          if (statusData.status === 'completed') {
            if (typeof statusData.downloadPath !== 'string') {
              throw new Error(getMessage(messages.UNKNOWN_ERROR));
            }
            downloadPath = statusData.downloadPath;
            break;
          }
          if (
            statusData.status !== 'pending' &&
            statusData.status !== 'processing'
          ) {
            throw new Error(getMessage(messages.UNKNOWN_ERROR));
          }
        }

        const anchor = document.createElement('a');
        anchor.href = downloadPath;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch (error) {
        setArchiveError(
          `${getMessage(messages.ARCHIVE_DOWNLOAD_FAILED)}: ${error instanceof Error ? error.message : getMessage(messages.UNKNOWN_ERROR)}`
        );
      } finally {
        setArchiveInProgress(false);
      }
    };

    const directoryOrder = useMemo(
      () => directorySummaries.map((directory) => directory.directoryPath),
      [directorySummaries]
    );
    const isSearchMode = debouncedFilterText.length > 0;
    const activeFiles = isSearchMode
      ? searchResults
      : directoryOrder.flatMap(
          (directoryPath) => browseFileGroupsByDirectory[directoryPath] ?? []
        );
    const downloadableSelectedArchiveItems = useMemo(
      () =>
        isSearchMode
          ? filterSelectedArchiveItemsForVisibleFiles({
              selectedItems: selectedArchiveItems,
              visibleFiles: activeFiles,
            })
          : selectedArchiveItems,
      [activeFiles, isSearchMode, selectedArchiveItems]
    );
    const selectedArchiveSizeBytes = useMemo(
      () =>
        calculateSelectedArchiveSizeBytes({
          selectedItems: downloadableSelectedArchiveItems,
          versionsByPublicPath,
        }),
      [downloadableSelectedArchiveItems, versionsByPublicPath]
    );
    const archiveDownloadSizeExceeded = isArchiveDownloadSizeExceeded({
      selectedSizeBytes: selectedArchiveSizeBytes,
      maxDownloadSizeMb: serverConfig?.maxDownloadSizeMb,
    });
    const archiveDownloadButtonDisabled =
      downloadableSelectedArchiveItems.length === 0 ||
      archiveInProgress ||
      archiveDownloadSizeExceeded;
    const browseDescriptions = useMemo(
      () =>
        new Map(
          directorySummaries.map((directory) => [
            directory.directoryPath,
            directory.description,
          ])
        ),
      [directorySummaries]
    );
    const browseSections = useMemo(
      () =>
        buildBrowseDirectorySections(
          directorySummaries,
          browseFileGroupsByDirectory
        ),
      [browseFileGroupsByDirectory, directorySummaries]
    );
    const searchSections = useMemo(
      () =>
        buildDirectorySections(
          searchResults,
          directoryOrder,
          undefined,
          browseDescriptions
        ),
      [browseDescriptions, directoryOrder, searchResults]
    );
    const sections = isSearchMode ? searchSections : browseSections;
    const loadedDirectoryPanels = useMemo(
      () =>
        isSearchMode
          ? new Set(sections.map((section) => section.directoryPath))
          : new Set(Object.keys(browseFileGroupsByDirectory)),
      [browseFileGroupsByDirectory, isSearchMode, sections]
    );

    const activeError = isSearchMode ? searchError : browseError;
    const isInitialLoading = shouldShowPackageListInitialLoading(
      browseLoading,
      isSearchMode
    );
    const visibleDirectoryCount = sections.length;
    const resolveCanDeleteFileGroupVersion = (
      _file: FileGroupSummary,
      version: FileVersion
    ): boolean =>
      canDeleteFileGroupVersion({
        version,
      });

    const loadDirectoryFileGroups = async (
      directoryPath: string
    ): Promise<readonly FileGroupSummary[] | undefined> => {
      if (directoryLoadingPanels.has(directoryPath)) {
        return browseFileGroupsByDirectory[directoryPath];
      }
      if (browseFileGroupsByDirectory[directoryPath] !== undefined) {
        return browseFileGroupsByDirectory[directoryPath];
      }
      if (directoryErrorsByPath[directoryPath] !== undefined) {
        return undefined;
      }

      abortDirectoryRequest(directoryPath);
      const controller = new AbortController();
      directoryRequestControllersRef.current.set(directoryPath, controller);

      setDirectoryLoadingPanels((currentPanels) => {
        const nextPanels = new Set(currentPanels);
        nextPanels.add(directoryPath);
        return nextPanels;
      });
      setDirectoryErrorsByPath((currentErrors) => ({
        ...currentErrors,
        [directoryPath]: undefined,
      }));

      try {
        const response = await apiFetch(
          `api/ui/browse/file-groups?directory=${encodeURIComponent(directoryPath)}`,
          {
            credentials: 'same-origin',
            signal: controller.signal,
          }
        );

        if (response.status === 401) {
          return undefined;
        }
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: BrowseFileGroupsResponse = await response.json();
        setBrowseFileGroupsByDirectory((currentFileGroups) => ({
          ...currentFileGroups,
          [directoryPath]: data.items,
        }));
        setDirectorySummaries((currentDirectories) =>
          updateDirectorySummaryFileGroupCount({
            directories: currentDirectories,
            directoryPath,
            fileGroupCount: data.items.length,
          })
        );
        return data.items;
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return undefined;
        }
        setDirectoryErrorsByPath((currentErrors) => ({
          ...currentErrors,
          [directoryPath]:
            requestError instanceof Error
              ? requestError.message
              : getMessage(messages.UNKNOWN_ERROR),
        }));
        return undefined;
      } finally {
        if (
          directoryRequestControllersRef.current.get(directoryPath) ===
          controller
        ) {
          directoryRequestControllersRef.current.delete(directoryPath);
        }
        setDirectoryLoadingPanels((currentPanels) => {
          const nextPanels = new Set(currentPanels);
          nextPanels.delete(directoryPath);
          return nextPanels;
        });
      }
    };

    const fetchFileGroupVersions = async (
      publicPath: string,
      signal: AbortSignal
    ): Promise<readonly FileVersion[] | undefined> => {
      const response = await apiFetch(
        `api/ui/browse/versions?publicPath=${encodeURIComponent(publicPath)}`,
        {
          credentials: 'same-origin',
          signal,
        }
      );

      if (response.status === 401) {
        return undefined;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: BrowseVersionsResponse = await response.json();
      return data.items;
    };

    const loadFileGroupVersions = async (
      publicPath: string
    ): Promise<readonly FileVersion[] | undefined> => {
      if (versionLoadingPanels.has(publicPath)) {
        return versionsByPublicPath[publicPath];
      }
      if (versionsByPublicPath[publicPath] !== undefined) {
        return versionsByPublicPath[publicPath];
      }
      if (versionErrorsByPublicPath[publicPath] !== undefined) {
        return undefined;
      }

      abortVersionRequest(publicPath);
      const controller = new AbortController();
      versionRequestControllersRef.current.set(publicPath, controller);

      setVersionLoadingPanels((currentPanels) => {
        const nextPanels = new Set(currentPanels);
        nextPanels.add(publicPath);
        return nextPanels;
      });
      setVersionErrorsByPublicPath((currentErrors) => ({
        ...currentErrors,
        [publicPath]: undefined,
      }));

      try {
        const versions = await fetchFileGroupVersions(
          publicPath,
          controller.signal
        );
        if (versions !== undefined) {
          setVersionsByPublicPath((currentVersions) => ({
            ...currentVersions,
            [publicPath]: versions,
          }));
        }
        return versions;
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return undefined;
        }
        setVersionErrorsByPublicPath((currentErrors) => ({
          ...currentErrors,
          [publicPath]:
            requestError instanceof Error
              ? requestError.message
              : getMessage(messages.UNKNOWN_ERROR),
        }));
        return undefined;
      } finally {
        if (
          versionRequestControllersRef.current.get(publicPath) === controller
        ) {
          versionRequestControllersRef.current.delete(publicPath);
        }
        setVersionLoadingPanels((currentPanels) => {
          const nextPanels = new Set(currentPanels);
          nextPanels.delete(publicPath);
          return nextPanels;
        });
      }
    };

    const loadVersions = (publicPath: string) => {
      void loadFileGroupVersions(publicPath);
    };

    const handleToggleDirectoryVersions = async (
      section: DirectorySection,
      selected: boolean
    ) => {
      if (!selected) {
        await handleToggleVisibleFileVersions(section.files, false);
        return;
      }

      const loadedFiles =
        !isSearchMode &&
        browseFileGroupsByDirectory[section.directoryPath] === undefined
          ? await loadDirectoryFileGroups(section.directoryPath)
          : undefined;
      const files = resolveDirectorySelectionFiles({
        section,
        isSearchMode,
        loadedFiles,
      });
      await handleToggleVisibleFileVersions(files, true);
    };

    useEffect(() => {
      if (isSearchMode) {
        return;
      }

      const visibleDirectoryPaths = new Set(
        directorySummaries.map((directory) => directory.directoryPath)
      );

      expandedDirectoryPanels.forEach((directoryPath) => {
        if (!visibleDirectoryPaths.has(directoryPath)) {
          return;
        }
        if (browseFileGroupsByDirectory[directoryPath] !== undefined) {
          return;
        }
        if (directoryErrorsByPath[directoryPath] !== undefined) {
          return;
        }
        if (directoryLoadingPanels.has(directoryPath)) {
          return;
        }
        void loadDirectoryFileGroups(directoryPath);
      });
    }, [
      browseFileGroupsByDirectory,
      directoryErrorsByPath,
      directoryLoadingPanels,
      directorySummaries,
      expandedDirectoryPanels,
      isSearchMode,
    ]);

    useEffect(() => {
      const visiblePublicPaths = new Set(
        activeFiles.map((file) => file.publicPath)
      );

      expandedPanels.forEach((publicPath) => {
        if (!visiblePublicPaths.has(publicPath)) {
          return;
        }
        if (versionsByPublicPath[publicPath] !== undefined) {
          return;
        }
        if (versionErrorsByPublicPath[publicPath] !== undefined) {
          return;
        }
        if (versionLoadingPanels.has(publicPath)) {
          return;
        }
        loadVersions(publicPath);
      });
    }, [
      activeFiles,
      expandedPanels,
      versionsByPublicPath,
      versionErrorsByPublicPath,
      versionLoadingPanels,
    ]);

    if (isInitialLoading) {
      return (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '200px',
          }}
        >
          <CircularProgress />
        </Box>
      );
    }

    if (!canBrowse) {
      return null;
    }

    if (activeError) {
      return (
        <Alert severity="error">
          <TypedMessage
            message={messages.ERROR_LOADING_FILES}
            params={{ error: activeError }}
          />
        </Alert>
      );
    }

    if (!isSearchMode && visibleDirectoryCount === 0) {
      return (
        <Alert severity="info">
          <TypedMessage message={messages.NO_FILES_FOUND} />
        </Alert>
      );
    }

    return (
      <Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'stretch', sm: 'flex-start' },
            justifyContent: 'space-between',
            mb: 2.5,
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <PackageListHeaderTitle
            visibleDirectoryCount={visibleDirectoryCount}
          />
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: { xs: 'stretch', sm: 'flex-end' },
              gap: 1,
              minWidth: { xs: '100%', sm: 520 },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'stretch', sm: 'center' },
                gap: 1,
                width: '100%',
              }}
            >
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1}
                useFlexGap
                sx={{ alignItems: 'center', flexShrink: 0 }}
              >
                <ArchiveDownloadButton
                  selectedCount={downloadableSelectedArchiveItems.length}
                  disabled={archiveDownloadButtonDisabled}
                  inProgress={archiveInProgress}
                  sizeExceeded={archiveDownloadSizeExceeded}
                  onClick={handleDownloadSelectedArchive}
                />
                <Button
                  variant="outlined"
                  size="small"
                  disabled={
                    selectedArchiveItems.length === 0 || archiveInProgress
                  }
                  onClick={() => {
                    setSelectedVersionKeys(new Set());
                    setArchiveError(null);
                  }}
                  sx={{ minHeight: 40 }}
                >
                  <TypedMessage message={messages.CLEAR_SELECTION} />
                </Button>
              </Stack>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: { xs: 'stretch', sm: 'flex-end' },
                  gap: 0.75,
                  flexGrow: 1,
                  minWidth: { sm: 250 },
                }}
              >
                <TextField
                  size="small"
                  placeholder={getMessage(messages.FILTER_FILES_PLACEHOLDER)}
                  value={filterText}
                  onChange={(event) => setFilterText(event.target.value)}
                  sx={{ width: '100%' }}
                />
                {searchLoading && isSearchMode ? (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      <TypedMessage message={messages.LOADING_MORE_FILES} />
                    </Typography>
                  </Box>
                ) : null}
              </Box>
            </Box>
          </Box>
        </Box>

        {archiveError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {archiveError}
          </Alert>
        ) : null}

        {isSearchMode && sections.length === 0 && !searchLoading ? (
          <Alert severity="info">
            <TypedMessage message={messages.NO_FILES_MATCH_FILTER} />
          </Alert>
        ) : (
          <PackageListEntries
            sections={sections}
            loadedDirectoryPanels={loadedDirectoryPanels}
            directoryLoadingPanels={directoryLoadingPanels}
            directoryErrorsByPath={directoryErrorsByPath}
            expandedDirectoryPanels={expandedDirectoryPanels}
            expandedPanels={expandedPanels}
            versionsByPublicPath={versionsByPublicPath}
            versionErrorsByPublicPath={versionErrorsByPublicPath}
            versionLoadingPanels={versionLoadingPanels}
            selectedVersionKeys={selectedVersionKeys}
            canDeleteFileGroupVersion={resolveCanDeleteFileGroupVersion}
            onToggleVersionSelection={handleToggleVersionSelection}
            onToggleFileGroupVersions={(file, selected) => {
              void handleToggleVisibleFileVersions([file], selected);
            }}
            onToggleDirectoryVersions={(section, selected) => {
              void handleToggleDirectoryVersions(section, selected);
            }}
            onDeleteVersionRequest={(file, version) => {
              setDeleteTarget({ file, version });
              setDeleteError(null);
            }}
            onDirectoryAccordionChange={(directoryPath, isExpanded) => {
              setExpandedDirectoryPanels((currentPanels) => {
                const nextPanels = new Set(currentPanels);
                if (isExpanded) {
                  nextPanels.add(directoryPath);
                } else {
                  nextPanels.delete(directoryPath);
                }
                return nextPanels;
              });

              if (!isExpanded) {
                abortDirectoryRequest(directoryPath);

                const publicPaths =
                  browseFileGroupsByDirectory[directoryPath]?.map(
                    (file) => file.publicPath
                  ) ?? [];
                publicPaths.forEach((publicPath) => {
                  abortVersionRequest(publicPath);
                });

                const nextDirectoryState = clearDirectoryPanelState({
                  directoryPath,
                  publicPaths,
                  browseFileGroupsByDirectory,
                  directoryErrorsByPath,
                  directoryLoadingPanels,
                  expandedPanels,
                  versionsByPublicPath,
                  versionErrorsByPublicPath,
                  versionLoadingPanels,
                  selectedVersionKeys,
                });
                setBrowseFileGroupsByDirectory(
                  nextDirectoryState.browseFileGroupsByDirectory
                );
                setDirectoryErrorsByPath(
                  nextDirectoryState.directoryErrorsByPath
                );
                setDirectoryLoadingPanels(
                  nextDirectoryState.directoryLoadingPanels
                );
                setExpandedPanels(nextDirectoryState.expandedPanels);
                setVersionsByPublicPath(
                  nextDirectoryState.versionsByPublicPath
                );
                setVersionErrorsByPublicPath(
                  nextDirectoryState.versionErrorsByPublicPath
                );
                setVersionLoadingPanels(
                  nextDirectoryState.versionLoadingPanels
                );
              }
            }}
            onAccordionChange={(publicPath, isExpanded) => {
              setExpandedPanels((currentPanels) => {
                const nextPanels = new Set(currentPanels);
                if (isExpanded) {
                  nextPanels.add(publicPath);
                } else {
                  nextPanels.delete(publicPath);
                }
                return nextPanels;
              });

              if (!isExpanded) {
                abortVersionRequest(publicPath);

                const nextFileGroupState = clearFileGroupPanelState({
                  publicPath,
                  versionsByPublicPath,
                  versionErrorsByPublicPath,
                  versionLoadingPanels,
                  preserveVersions: hasSelectedFileVersions(
                    selectedVersionKeys,
                    new Set([publicPath])
                  ),
                });
                setVersionsByPublicPath(
                  nextFileGroupState.versionsByPublicPath
                );
                setVersionErrorsByPublicPath(
                  nextFileGroupState.versionErrorsByPublicPath
                );
                setVersionLoadingPanels(
                  nextFileGroupState.versionLoadingPanels
                );
              }
            }}
          />
        )}
        <Dialog
          open={deleteTarget !== null}
          onClose={handleCloseDeleteDialog}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            <TypedMessage message={messages.CONFIRM_FILE_DELETION_TITLE} />
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              {deleteTarget ? (
                <TypedMessage
                  message={messages.CONFIRM_DELETE_FILE_VERSION}
                  params={{
                    path: deleteTarget.file.displayPath,
                    uploadId: deleteTarget.version.uploadId,
                  }}
                />
              ) : null}
            </DialogContentText>
            {deleteError ? (
              <Alert severity="error" sx={{ mt: 2 }}>
                {deleteError}
              </Alert>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={handleCloseDeleteDialog}
              disabled={deleteInProgress}
            >
              <TypedMessage message={messages.CANCEL} />
            </Button>
            <Button
              onClick={handleConfirmDelete}
              color="error"
              disabled={deleteInProgress}
            >
              <TypedMessage
                message={deleteInProgress ? messages.DELETING : messages.DELETE}
              />
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }
);

export default PackageList;
