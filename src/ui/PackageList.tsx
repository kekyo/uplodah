// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import {
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useState,
} from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
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
}

interface FileGroupSummary {
  publicPath: string;
  displayPath: string;
  directoryPath: string;
  fileName: string;
  latestUploadId: string;
  latestUploadedAt: string;
  latestDownloadPath: string;
}

interface DirectorySummary {
  directoryPath: string;
  readonly: boolean;
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

interface ServerConfig {
  authMode: 'none' | 'publish' | 'full';
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
  fileGroupCount: number;
  files: FileGroupSummary[];
}

interface PackageListEntriesProps {
  sections: readonly DirectorySection[];
  expandedPanels: ReadonlySet<string>;
  versionsByPublicPath: Readonly<
    Record<string, readonly FileVersion[] | undefined>
  >;
  versionErrorsByPublicPath: Readonly<Record<string, string | undefined>>;
  versionLoadingPanels: ReadonlySet<string>;
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

const buildDirectorySections = (
  files: readonly FileGroupSummary[],
  directoryOrder: readonly string[],
  explicitCountsByDirectory: ReadonlyMap<string, number> | undefined
): DirectorySection[] => {
  const sections = new Map<string, FileGroupSummary[]>();

  files.forEach((file) => {
    const sectionFiles = sections.get(file.directoryPath);
    if (sectionFiles) {
      sectionFiles.push(file);
      return;
    }
    sections.set(file.directoryPath, [file]);
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
        fileGroupCount,
        files: sectionFiles,
      };
    })
    .filter(
      (section) => section.fileGroupCount > 0 && section.files.length > 0
    );
};

/**
 * Render file-group accordion entries for the package list.
 */
export const PackageListEntries = ({
  sections,
  expandedPanels,
  versionsByPublicPath,
  versionErrorsByPublicPath,
  versionLoadingPanels,
  onAccordionChange,
}: PackageListEntriesProps) => {
  const getMessage = useTypedMessage();

  return (
    <Stack spacing={2.5}>
      {sections.map((section) => (
        <Box key={section.directoryPath}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mb: 1.25,
            }}
          >
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
              {section.directoryPath === '/'
                ? getMessage(messages.ROOT_DIRECTORY, {
                    path: section.directoryPath,
                  })
                : section.directoryPath}
            </Typography>
            <Chip
              size="small"
              label={getMessage(messages.FILE_GROUPS_COUNT, {
                count: section.fileGroupCount,
              })}
            />
          </Box>
          <Stack spacing={1.25} useFlexGap>
            {section.files.map((file) => {
              const FileGroupIcon = resolveFileGroupIconComponent(
                file.fileName
              );
              const versions = versionsByPublicPath[file.publicPath];
              const versionError = versionErrorsByPublicPath[file.publicPath];
              const isVersionLoading = versionLoadingPanels.has(
                file.publicPath
              );
              const totalSize =
                versions?.reduce((size, version) => size + version.size, 0) ??
                0;

              return (
                <Accordion
                  key={file.publicPath}
                  expanded={expandedPanels.has(file.publicPath)}
                  onChange={(_event, isExpanded) =>
                    onAccordionChange(file.publicPath, isExpanded)
                  }
                  sx={{
                    bgcolor: (theme) =>
                      theme.palette.mode === 'light' ? 'grey.100' : '#2d2d2d',
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
                      <ExpandMoreIcon sx={{ color: 'text.secondary' }} />
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
                          sx={{ fontWeight: 700, wordBreak: 'break-word' }}
                        >
                          {file.fileName}
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
                          <TypedMessage message={messages.GROUP_SUMMARY} />
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
                            message={messages.REVISIONS_HEADER}
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
                                flexDirection: { xs: 'column', sm: 'row' },
                                alignItems: { xs: 'stretch', sm: 'center' },
                                justifyContent: 'space-between',
                                gap: 2,
                                bgcolor: (theme) =>
                                  theme.palette.mode === 'light'
                                    ? 'grey.50'
                                    : 'rgba(255,255,255,0.04)',
                                borderColor: 'divider',
                              }}
                            >
                              <Box>
                                <Typography
                                  variant="body1"
                                  sx={{ fontWeight: 500 }}
                                >
                                  {formatUploadedAt(version.uploadedAt)}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  <TypedMessage
                                    message={messages.UPLOAD_ID_LABEL}
                                    params={{ uploadId: version.uploadId }}
                                  />
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  <TypedMessage
                                    message={messages.FILE_SIZE_LABEL}
                                    params={{ size: formatSize(version.size) }}
                                  />
                                </Typography>
                              </Box>
                              <Button
                                variant="contained"
                                size="small"
                                startIcon={<DownloadIcon />}
                                href={version.versionDownloadPath}
                                sx={{
                                  alignSelf: { xs: 'stretch', sm: 'center' },
                                  minWidth: { sm: 132 },
                                  boxShadow: 'none',
                                }}
                              >
                                <TypedMessage message={messages.DOWNLOAD} />
                              </Button>
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
        </Box>
      ))}
    </Stack>
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
      fontWeight: 700,
    }}
  >
    <FolderCopyIcon />
    <TypedMessage message={messages.FILE_GROUPS_HEADER} /> (
    {visibleDirectoryCount})
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
    const [expandedPanels, setExpandedPanels] = useState<Set<string>>(
      new Set()
    );
    const [filterText, setFilterText] = useState('');
    const [debouncedFilterText, setDebouncedFilterText] = useState('');
    const [refreshToken, setRefreshToken] = useState(0);

    const canBrowse =
      serverConfig !== undefined &&
      serverConfig !== null &&
      !(
        serverConfig.authMode === 'full' &&
        !serverConfig.currentUser?.authenticated
      );

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

      setBrowseLoading(true);
      setBrowseError(null);
      setDirectorySummaries([]);
      setBrowseFileGroupsByDirectory({});
      setSearchResults([]);
      setVersionsByPublicPath({});
      setVersionErrorsByPublicPath({});
      setVersionLoadingPanels(new Set());

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
          const nonEmptyDirectories = directoriesData.items.filter(
            (directory) => directory.fileGroupCount > 0
          );
          const fileGroupEntries = await Promise.all(
            nonEmptyDirectories.map(async (directory) => {
              const fileGroupsResponse = await apiFetch(
                `api/ui/browse/file-groups?directory=${encodeURIComponent(directory.directoryPath)}`,
                {
                  credentials: 'same-origin',
                  signal: controller.signal,
                }
              );

              if (fileGroupsResponse.status === 401) {
                throw new Error('UNAUTHORIZED');
              }
              if (!fileGroupsResponse.ok) {
                throw new Error(
                  `HTTP error! status: ${fileGroupsResponse.status}`
                );
              }

              const fileGroupsData: BrowseFileGroupsResponse =
                await fileGroupsResponse.json();
              return {
                directoryPath: directory.directoryPath,
                items: fileGroupsData.items,
              };
            })
          );

          if (!active) {
            return;
          }

          const nextBrowseFileGroupsByDirectory: Record<
            string,
            FileGroupSummary[]
          > = {};
          fileGroupEntries.forEach((entry) => {
            nextBrowseFileGroupsByDirectory[entry.directoryPath] = entry.items;
          });

          setDirectorySummaries(directoriesData.items);
          setBrowseFileGroupsByDirectory(nextBrowseFileGroupsByDirectory);
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

    const directoryOrder = useMemo(
      () => directorySummaries.map((directory) => directory.directoryPath),
      [directorySummaries]
    );
    const browseFiles = useMemo(
      () =>
        directoryOrder.flatMap(
          (directoryPath) => browseFileGroupsByDirectory[directoryPath] ?? []
        ),
      [browseFileGroupsByDirectory, directoryOrder]
    );
    const isSearchMode = debouncedFilterText.length > 0;
    const activeFiles = isSearchMode ? searchResults : browseFiles;
    const explicitBrowseCounts = useMemo(
      () =>
        new Map(
          directorySummaries.map((directory) => [
            directory.directoryPath,
            directory.fileGroupCount,
          ])
        ),
      [directorySummaries]
    );
    const sections = useMemo(
      () =>
        buildDirectorySections(
          activeFiles,
          directoryOrder,
          isSearchMode ? undefined : explicitBrowseCounts
        ),
      [activeFiles, directoryOrder, explicitBrowseCounts, isSearchMode]
    );

    const activeError = isSearchMode ? searchError : browseError;
    const isInitialLoading = shouldShowPackageListInitialLoading(
      browseLoading,
      isSearchMode
    );
    const visibleDirectoryCount = sections.length;

    const loadVersions = (publicPath: string) => {
      if (versionLoadingPanels.has(publicPath)) {
        return;
      }
      if (versionsByPublicPath[publicPath] !== undefined) {
        return;
      }

      setVersionLoadingPanels((currentPanels) => {
        const nextPanels = new Set(currentPanels);
        nextPanels.add(publicPath);
        return nextPanels;
      });
      setVersionErrorsByPublicPath((currentErrors) => ({
        ...currentErrors,
        [publicPath]: undefined,
      }));

      void (async () => {
        try {
          const response = await apiFetch(
            `api/ui/browse/versions?publicPath=${encodeURIComponent(publicPath)}`,
            {
              credentials: 'same-origin',
            }
          );

          if (response.status === 401) {
            return;
          }
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data: BrowseVersionsResponse = await response.json();
          setVersionsByPublicPath((currentVersions) => ({
            ...currentVersions,
            [publicPath]: data.items,
          }));
        } catch (requestError) {
          setVersionErrorsByPublicPath((currentErrors) => ({
            ...currentErrors,
            [publicPath]:
              requestError instanceof Error
                ? requestError.message
                : getMessage(messages.UNKNOWN_ERROR),
          }));
        } finally {
          setVersionLoadingPanels((currentPanels) => {
            const nextPanels = new Set(currentPanels);
            nextPanels.delete(publicPath);
            return nextPanels;
          });
        }
      })();
    };

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
        if (versionLoadingPanels.has(publicPath)) {
          return;
        }
        loadVersions(publicPath);
      });
    }, [
      activeFiles,
      expandedPanels,
      versionsByPublicPath,
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
              minWidth: { xs: '100%', sm: 250 },
            }}
          >
            <TextField
              size="small"
              placeholder={getMessage(messages.FILTER_FILES_PLACEHOLDER)}
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              sx={{ minWidth: { sm: 250 } }}
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

        {isSearchMode && sections.length === 0 && !searchLoading ? (
          <Alert severity="info">
            <TypedMessage message={messages.NO_FILES_MATCH_FILTER} />
          </Alert>
        ) : (
          <PackageListEntries
            sections={sections}
            expandedPanels={expandedPanels}
            versionsByPublicPath={versionsByPublicPath}
            versionErrorsByPublicPath={versionErrorsByPublicPath}
            versionLoadingPanels={versionLoadingPanels}
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

              if (isExpanded) {
                loadVersions(publicPath);
              }
            }}
          />
        )}
      </Box>
    );
  }
);

export default PackageList;
