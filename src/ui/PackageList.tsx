// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import {
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
  Chip,
  CircularProgress,
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
  description?: string;
  fileGroupCount: number;
  files: FileGroupSummary[];
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
  directories.map((directory) => ({
    directoryPath: directory.directoryPath,
    description: directory.description,
    fileGroupCount: directory.fileGroupCount,
    files: Array.from(
      browseFileGroupsByDirectory[directory.directoryPath] ?? []
    ),
  }));

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
}: {
  publicPath: string;
  versionsByPublicPath: Readonly<
    Record<string, readonly FileVersion[] | undefined>
  >;
  versionErrorsByPublicPath: Readonly<Record<string, string | undefined>>;
  versionLoadingPanels: ReadonlySet<string>;
}) => ({
  versionsByPublicPath: deleteRecordEntry(versionsByPublicPath, publicPath),
  versionErrorsByPublicPath: deleteRecordEntry(
    versionErrorsByPublicPath,
    publicPath
  ),
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
}) => {
  let nextVersionsByPublicPath = { ...versionsByPublicPath };
  let nextVersionErrorsByPublicPath = { ...versionErrorsByPublicPath };
  let nextVersionLoadingPanels = new Set(versionLoadingPanels);
  const nextExpandedPanels = new Set(expandedPanels);

  publicPaths.forEach((publicPath) => {
    nextExpandedPanels.delete(publicPath);

    const nextFileGroupState = clearFileGroupPanelState({
      publicPath,
      versionsByPublicPath: nextVersionsByPublicPath,
      versionErrorsByPublicPath: nextVersionErrorsByPublicPath,
      versionLoadingPanels: nextVersionLoadingPanels,
    });
    nextVersionsByPublicPath = nextFileGroupState.versionsByPublicPath;
    nextVersionErrorsByPublicPath =
      nextFileGroupState.versionErrorsByPublicPath;
    nextVersionLoadingPanels = nextFileGroupState.versionLoadingPanels;
  });

  return {
    browseFileGroupsByDirectory: deleteRecordEntry(
      browseFileGroupsByDirectory,
      directoryPath
    ),
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
  onDirectoryAccordionChange,
  onAccordionChange,
}: PackageListEntriesProps) => {
  const getMessage = useTypedMessage();

  return (
    <Stack spacing={2.5} useFlexGap>
      {sections.map((section) => (
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
              theme.palette.mode === 'light' ? 'background.paper' : '#232323',
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
              directoryErrorsByPath[section.directoryPath] === undefined) ? (
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
                                        params={{
                                          size: formatSize(version.size),
                                        }}
                                      />
                                    </Typography>
                                  </Box>
                                  <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<DownloadIcon />}
                                    href={version.versionDownloadPath}
                                    sx={{
                                      alignSelf: {
                                        xs: 'stretch',
                                        sm: 'center',
                                      },
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
            )}
          </AccordionDetails>
        </Accordion>
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
    <HomeIcon fontSize="large" />
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
          explicitBrowseCounts,
          browseDescriptions
        ),
      [browseDescriptions, directoryOrder, explicitBrowseCounts, searchResults]
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

    const loadDirectoryFileGroups = (directoryPath: string) => {
      if (directoryLoadingPanels.has(directoryPath)) {
        return;
      }
      if (browseFileGroupsByDirectory[directoryPath] !== undefined) {
        return;
      }
      if (directoryErrorsByPath[directoryPath] !== undefined) {
        return;
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

      void (async () => {
        try {
          const response = await apiFetch(
            `api/ui/browse/file-groups?directory=${encodeURIComponent(directoryPath)}`,
            {
              credentials: 'same-origin',
              signal: controller.signal,
            }
          );

          if (response.status === 401) {
            return;
          }
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data: BrowseFileGroupsResponse = await response.json();
          setBrowseFileGroupsByDirectory((currentFileGroups) => ({
            ...currentFileGroups,
            [directoryPath]: data.items,
          }));
        } catch (requestError) {
          if (
            requestError instanceof DOMException &&
            requestError.name === 'AbortError'
          ) {
            return;
          }
          setDirectoryErrorsByPath((currentErrors) => ({
            ...currentErrors,
            [directoryPath]:
              requestError instanceof Error
                ? requestError.message
                : getMessage(messages.UNKNOWN_ERROR),
          }));
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
      })();
    };

    const loadVersions = (publicPath: string) => {
      if (versionLoadingPanels.has(publicPath)) {
        return;
      }
      if (versionsByPublicPath[publicPath] !== undefined) {
        return;
      }
      if (versionErrorsByPublicPath[publicPath] !== undefined) {
        return;
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

      void (async () => {
        try {
          const response = await apiFetch(
            `api/ui/browse/versions?publicPath=${encodeURIComponent(publicPath)}`,
            {
              credentials: 'same-origin',
              signal: controller.signal,
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
          if (
            requestError instanceof DOMException &&
            requestError.name === 'AbortError'
          ) {
            return;
          }
          setVersionErrorsByPublicPath((currentErrors) => ({
            ...currentErrors,
            [publicPath]:
              requestError instanceof Error
                ? requestError.message
                : getMessage(messages.UNKNOWN_ERROR),
          }));
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
      })();
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
        loadDirectoryFileGroups(directoryPath);
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
            loadedDirectoryPanels={loadedDirectoryPanels}
            directoryLoadingPanels={directoryLoadingPanels}
            directoryErrorsByPath={directoryErrorsByPath}
            expandedDirectoryPanels={expandedDirectoryPanels}
            expandedPanels={expandedPanels}
            versionsByPublicPath={versionsByPublicPath}
            versionErrorsByPublicPath={versionErrorsByPublicPath}
            versionLoadingPanels={versionLoadingPanels}
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
      </Box>
    );
  }
);

export default PackageList;
