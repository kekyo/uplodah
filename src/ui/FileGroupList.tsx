// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import {
  forwardRef,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import dayjs from 'dayjs';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SourceIcon from '@mui/icons-material/Source';
import type { FileGroup, FileListResponse, StorageSection } from '../types';
import { apiFetch } from './utils/apiClient';
import {
  filterFileGroups,
  hasFileGroupFilterTerms,
  shouldAutoLoadMore,
  sortFileGroups,
} from './utils/fileGroupFilters';
import { buildFileGroupSections } from './utils/fileGroupSections';

/**
 * Imperative control surface for the file list.
 */
export interface FileGroupListRef {
  /**
   * Reloads the list from the first page.
   * @returns Refresh promise.
   */
  refresh: () => Promise<void>;
}

/**
 * Props for the grouped file-list view.
 */
export interface FileGroupListProps {
  /**
   * Whether the server has explicit storage rules.
   */
  storageConfigured: boolean;
  /**
   * Storage-backed section anchors exposed by the config endpoint.
   */
  storageSections: StorageSection[];
}

const formatDateTime = (value: string): string =>
  dayjs(value).format('YYYY/MM/DD HH:mm:ss');

const formatBytes = (value: number): string => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const FileGroupList = forwardRef<FileGroupListRef, FileGroupListProps>(
  (props, ref) => {
    const pageSize = 20;
    const [groups, setGroups] = useState<FileGroup[]>([]);
    const [expandedPanels, setExpandedPanels] = useState<Set<string>>(
      new Set()
    );
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [hasMore, setHasMore] = useState(true);
    const [totalGroups, setTotalGroups] = useState(0);
    const [searchText, setSearchText] = useState('');
    const deferredSearchText = useDeferredValue(searchText);
    const fileLoadInFlightRef = useRef(false);
    const nextSkipRef = useRef(0);
    const hasMoreRef = useRef(true);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    const filteredGroups = sortFileGroups(
      filterFileGroups(groups, deferredSearchText)
    );
    const groupedSections = buildFileGroupSections({
      groups: filteredGroups,
      storageSections: props.storageSections,
      storageConfigured: props.storageConfigured,
    });
    const hasActiveFilter = hasFileGroupFilterTerms(deferredSearchText);

    const loadFiles = async (isInitialLoad: boolean): Promise<void> => {
      if (fileLoadInFlightRef.current) {
        return;
      }

      const requestSkip = isInitialLoad ? 0 : nextSkipRef.current;
      if (!isInitialLoad && (loading || loadingMore || !hasMoreRef.current)) {
        return;
      }

      fileLoadInFlightRef.current = true;

      if (isInitialLoad) {
        setLoading(true);
        setError(undefined);
        setGroups([]);
        setTotalGroups(0);
        setHasMore(true);
        nextSkipRef.current = 0;
        hasMoreRef.current = true;
      } else {
        setLoadingMore(true);
      }

      try {
        const response = await apiFetch(
          `api/files?skip=${requestSkip}&take=${pageSize}`,
          {
            credentials: 'same-origin',
          }
        );
        if (!response.ok) {
          throw new Error(
            `Failed to load file list: ${response.status} ${response.statusText}`
          );
        }

        const responseBody = (await response.json()) as FileListResponse;
        setGroups((previousGroups) =>
          isInitialLoad
            ? responseBody.groups
            : [...previousGroups, ...responseBody.groups]
        );
        setTotalGroups(responseBody.totalGroups);

        const loadedGroupCount = requestSkip + responseBody.groups.length;
        nextSkipRef.current = loadedGroupCount;
        hasMoreRef.current = loadedGroupCount < responseBody.totalGroups;
        setHasMore(hasMoreRef.current);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load files'
        );
        hasMoreRef.current = false;
        setHasMore(false);
      } finally {
        fileLoadInFlightRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    };

    useEffect(() => {
      void loadFiles(true);
    }, []);

    useEffect(() => {
      if (
        !shouldAutoLoadMore({
          filterText: deferredSearchText,
          filteredGroupCount: filteredGroups.length,
          pageSize,
          loading,
          loadingMore,
          hasMore,
        })
      ) {
        return;
      }

      void loadFiles(false);
    }, [
      deferredSearchText,
      filteredGroups.length,
      hasMore,
      loading,
      loadingMore,
    ]);

    useEffect(() => {
      const target = loadMoreRef.current;
      if (!target || loading || loadingMore || hasActiveFilter || !hasMore) {
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            void loadFiles(false);
          }
        },
        {
          root: null,
          rootMargin: '200px 0px',
          threshold: 0,
        }
      );

      observer.observe(target);
      return () => observer.disconnect();
    }, [groups.length, hasActiveFilter, hasMore, loading, loadingMore]);

    useImperativeHandle(ref, () => ({
      refresh: async () => {
        await loadFiles(true);
      },
    }));

    const handleAccordionChange =
      (groupId: string) => (_event: SyntheticEvent, isExpanded: boolean) => {
        setExpandedPanels((previous) => {
          const next = new Set(previous);
          if (isExpanded) {
            next.add(groupId);
          } else {
            next.delete(groupId);
          }
          return next;
        });
      };

    if (loading) {
      return (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="200px"
        >
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return <Alert severity="error">{error}</Alert>;
    }

    return (
      <Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            variant="h4"
            component="h1"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <FolderOpenIcon />
            File groups{' '}
            {hasActiveFilter
              ? `(${filteredGroups.length}/${totalGroups})`
              : `(${totalGroups})`}
          </Typography>

          <TextField
            size="small"
            placeholder="Filter files"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            sx={{ minWidth: 250 }}
          />
        </Box>

        {filteredGroups.length === 0 ? (
          hasActiveFilter ? (
            <Alert severity="info">No files match the current filter.</Alert>
          ) : (
            <Alert severity="info">No uploaded files were found.</Alert>
          )
        ) : (
          groupedSections.map((section) => (
            <Box key={section.id} sx={{ mb: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  mb: 1,
                  px: 0.5,
                  flexWrap: 'wrap',
                }}
              >
                <Typography variant="h5" component="h2">
                  {section.title}
                </Typography>
                <Chip
                  label={`${section.items.length} file group${section.items.length !== 1 ? 's' : ''}`}
                  size="small"
                  variant="outlined"
                />
              </Box>

              {section.isFallback ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1.5, px: 0.5 }}
                >
                  Files in this section do not match any configured storage
                  entry.
                </Typography>
              ) : null}

              {section.items.map(({ group, displayFileName }) => (
                <Accordion
                  key={group.groupId}
                  sx={{
                    mb: 1,
                    bgcolor: (theme) =>
                      theme.palette.mode === 'light' ? 'grey.100' : 'grey.900',
                    '&:before': {
                      display: 'none',
                    },
                  }}
                  expanded={expandedPanels.has(group.groupId)}
                  onChange={handleAccordionChange(group.groupId)}
                  slotProps={{
                    transition: {
                      unmountOnExit: true,
                    },
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls={`panel-${group.groupId}-content`}
                    id={`panel-${group.groupId}-header`}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                      }}
                    >
                      <SourceIcon
                        sx={{
                          height: 40,
                          width: 40,
                          mr: 2,
                          color: 'text.secondary',
                        }}
                      />
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="h6" component="div">
                          {displayFileName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Latest upload:{' '}
                          {formatDateTime(group.latestUploadedAt)}
                        </Typography>
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {expandedPanels.has(group.groupId) ? (
                      <Box>
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Group Summary
                          </Typography>
                          <Box
                            sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
                          >
                            <Chip
                              label={`${group.versionCount} uploads`}
                              size="small"
                              variant="outlined"
                            />
                            <Chip
                              label={`Total size: ${formatBytes(group.totalSize)}`}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        </Box>

                        <Typography variant="subtitle2" gutterBottom>
                          Revisions ({group.versions.length})
                        </Typography>

                        {group.versions.map((version) => (
                          <Box
                            key={version.uploadId}
                            sx={{
                              mb: 1,
                              p: 1.5,
                              borderRadius: 1,
                              bgcolor: (theme) =>
                                theme.palette.mode === 'dark'
                                  ? 'rgba(255, 255, 255, 0.05)'
                                  : 'rgba(0, 0, 0, 0.02)',
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 2,
                                flexWrap: 'wrap',
                              }}
                            >
                              <Box>
                                <Typography variant="body1">
                                  {formatDateTime(version.uploadedAt)}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Upload ID: {version.uploadId}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Size: {formatBytes(version.size)}
                                </Typography>
                              </Box>
                              <Button
                                variant="contained"
                                size="small"
                                href={version.downloadPath}
                                startIcon={<DownloadIcon />}
                              >
                                Download
                              </Button>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    ) : null}
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          ))
        )}

        {loadingMore ? (
          <Box display="flex" justifyContent="center" alignItems="center" p={2}>
            <CircularProgress size={24} />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Loading more file groups...
            </Typography>
          </Box>
        ) : null}

        <Box ref={loadMoreRef} sx={{ height: 1 }} />

        {!hasActiveFilter && !hasMore && filteredGroups.length > 0 ? (
          <Typography
            sx={{ textAlign: 'center', p: 2, color: 'text.secondary' }}
          >
            All {groups.length} file groups are loaded.
          </Typography>
        ) : null}
      </Box>
    );
  }
);

FileGroupList.displayName = 'FileGroupList';

export default FileGroupList;
